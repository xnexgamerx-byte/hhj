/**
 * العربون.
 *
 * التسلسل: يُنشأ الحجز محجوزاً مؤقتاً (HELD) ومعه مهلة، ثم يُدفع فيصير مؤكَّداً.
 * إن لم يُدفع في مهلته حرّره المجدوِل للمريض التالي — وإلا بقي الوقت مشغولاً
 * بحجز لم يكتمل.
 */
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/prisma.js";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.js";
import { notifyDoctorOfNewBooking } from "../../notifications/dispatch.js";
import { createPaymentProvider, type PaymentProvider } from "./provider.js";

/** مهلة إتمام الدفع قبل تحرير الوقت لغيره. */
export const HOLD_MINUTES = 15;

let provider: PaymentProvider = createPaymentProvider();
export function setPaymentProvider(next: PaymentProvider) {
  provider = next;
}
export function getPaymentProvider(): PaymentProvider {
  return provider;
}

/** يبدأ عملية دفع لحجز محجوز مؤقتاً ويعيد رابط الدفع إن وُجد. */
export async function startPayment(
  accountId: string,
  appointmentId: string,
  returnUrl: string,
  client: PrismaClient = defaultPrisma,
) {
  const appointment = await client.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: { select: { accountId: true } },
      doctorClinic: { include: { doctor: { include: { user: { select: { fullName: true } } } } } },
    },
  });
  if (!appointment) throw notFound("APPOINTMENT_NOT_FOUND", "الحجز غير موجود");
  if (appointment.patient.accountId !== accountId) {
    throw forbidden("NOT_YOUR_APPOINTMENT", "هذا الحجز لا يخصك");
  }
  if (appointment.paymentStatus === "PAID") throw conflict("ALREADY_PAID", "العربون مدفوع");
  if (appointment.depositAmount <= 0) throw badRequest("NO_DEPOSIT", "هذا الحجز لا يحتاج عربوناً");
  if (appointment.lockKey === null) throw conflict("CANCELLED", "هذا الحجز ملغى");

  const payment = await client.payment.create({
    data: {
      appointmentId,
      amount: appointment.depositAmount,
      provider: provider.name,
      status: "PENDING",
    },
  });

  const doctorName = `${appointment.doctorClinic.doctor.title} ${appointment.doctorClinic.doctor.user.fullName}`;
  const result = await provider.createCheckout({
    paymentId: payment.id,
    amount: appointment.depositAmount,
    currency: "IQD",
    description: `عربون حجز عند ${doctorName}`,
    returnUrl,
  });

  if (!result.ok) {
    await client.payment.update({ where: { id: payment.id }, data: { status: "FAILED", error: result.error } });
    throw badRequest("PAYMENT_INIT_FAILED", "تعذّر بدء عملية الدفع. حاول مرة أخرى");
  }

  await client.payment.update({
    where: { id: payment.id },
    data: { providerRef: result.providerRef, checkoutUrl: result.checkoutUrl },
  });

  if (result.settledImmediately) {
    await settlePayment(payment.id, "PAID", client);
  }

  return {
    paymentId: payment.id,
    amount: appointment.depositAmount,
    checkoutUrl: result.checkoutUrl,
    provider: provider.name,
    expiresAt: appointment.holdExpiresAt?.toISOString() ?? null,
  };
}

/** يسأل المزوّد عن حالة العملية ويثبّتها. يُستدعى عند عودة المريض أو من ويبهوك. */
export async function refreshPayment(paymentId: string, client: PrismaClient = defaultPrisma) {
  const payment = await client.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw notFound("PAYMENT_NOT_FOUND", "عملية الدفع غير موجودة");
  if (payment.status === "PAID") return { status: payment.status };
  if (!payment.providerRef) return { status: payment.status };

  const result = await provider.verify(payment.providerRef);
  if (result.status === "PENDING") return { status: "PENDING" as const };

  await settlePayment(paymentId, result.status, client);
  return { status: result.status };
}

/**
 * يثبّت نتيجة الدفع على العملية والحجز معاً.
 * النجاح يحوّل الحجز من محجوز مؤقتاً إلى مؤكَّد، ويرسل تفاصيله للطبيب —
 * لم تكن أُرسلت قبل الدفع لأن الحجز لم يكن مؤكَّداً بعد.
 */
export async function settlePayment(
  paymentId: string,
  status: "PAID" | "FAILED",
  client: PrismaClient = defaultPrisma,
): Promise<void> {
  const payment = await client.payment.findUnique({
    where: { id: paymentId },
    include: { appointment: { include: { doctorClinic: { select: { autoConfirm: true } } } } },
  });
  if (!payment || payment.status === "PAID") return;

  const now = new Date();

  await client.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: { status, paidAt: status === "PAID" ? now : null },
    });

    if (status === "PAID") {
      await tx.appointment.update({
        where: { id: payment.appointmentId },
        data: {
          paymentStatus: "PAID",
          status: payment.appointment.doctorClinic.autoConfirm ? "CONFIRMED" : "PENDING",
          confirmedAt: payment.appointment.doctorClinic.autoConfirm ? now : null,
          holdExpiresAt: null,
        },
      });
    } else {
      await tx.appointment.update({ where: { id: payment.appointmentId }, data: { paymentStatus: "FAILED" } });
    }
  });

  if (status === "PAID") {
    try {
      await notifyDoctorOfNewBooking(payment.appointmentId, client);
    } catch {
      // الحجز تأكّد؛ تعذّر إشعار الطبيب لا يُبطله
    }
  }
}

/** تأشير العيادة أن العربون قُبض نقداً — لمزوّد الدفع اليدوي. */
export async function markPaidManually(
  actorUserId: string,
  appointmentId: string,
  client: PrismaClient = defaultPrisma,
) {
  const payment = await client.payment.findFirst({
    where: { appointmentId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (!payment) throw notFound("PAYMENT_NOT_FOUND", "لا توجد عملية دفع معلّقة لهذا الحجز");

  await settlePayment(payment.id, "PAID", client);
  await client.auditLog.create({
    data: { actorUserId, action: "PAYMENT_MARKED_PAID", entity: "Payment", entityId: payment.id },
  });

  return { status: "PAID" as const };
}
