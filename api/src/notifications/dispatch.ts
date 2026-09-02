/**
 * إرسال الإشعارات.
 *
 * القاعدة الحاكمة: **فشل الواتساب لا يُفشل الحجز أبداً.**
 * لذلك تُسجَّل الرسالة صفاً في notification_logs ضمن معاملة الحجز نفسها،
 * ثم تُرسل بعد نجاح الحجز. إن سقط الإرسال بقي الصف في الطابور لإعادة المحاولة،
 * ولم يخسر المريض موعده لأن واتساب كان متعطلاً.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../lib/prisma.js";
import { notifyInApp } from "./inbox.js";
import { toWhatsAppAddress } from "../lib/phone.js";
import type { WhatsAppProvider } from "./whatsapp/provider.js";
import { createWhatsAppProvider } from "./whatsapp/provider.js";
import type { WhatsAppMessage } from "./whatsapp/templates.js";
import { newBookingMessage, bookingCancelledMessage } from "./whatsapp/templates.js";
import type { BookingSummary } from "./whatsapp/templates.js";

const MAX_ATTEMPTS = 5;

let provider: WhatsAppProvider = createWhatsAppProvider();

/** لتبديل المزوّد في الاختبارات أو عند تغيير الإعدادات وقت التشغيل. */
export function setWhatsAppProvider(next: WhatsAppProvider) {
  provider = next;
}
export function getWhatsAppProvider(): WhatsAppProvider {
  return provider;
}

type QueueInput = {
  userId: string | null;
  appointmentId: string | null;
  to: string;
  /**
   * مفتاح منع التكرار: رسالة واحدة بهذا المفتاح لكل حجز.
   * قد يختلف عن اسم القالب المعتمد لدى ميتا — تذكير اليوم وتذكير الساعتين
   * مفتاحان مختلفان لكنهما يستعملان القالب نفسه.
   */
  template: string;
  message: WhatsAppMessage;
};

/** يسجّل الرسالة في الطابور. يقبل معاملة جارية ليُكتب الصف مع الحجز ذرّياً. */
export async function queueWhatsApp(
  input: QueueInput,
  tx: Prisma.TransactionClient | PrismaClient = defaultPrisma,
): Promise<string> {
  const log = await tx.notificationLog.create({
    data: {
      userId: input.userId,
      appointmentId: input.appointmentId,
      channel: "WHATSAPP",
      template: input.template,
      toAddress: input.to,
      renderedBody: input.message.body,
      payload: {
        params: input.message.params,
        languageCode: input.message.languageCode,
        // اسم القالب لدى ميتا يُحفظ هنا لأن حقل template مفتاحُ منع تكرار لا اسمُ قالب
        templateName: input.message.templateName,
      },
      status: "QUEUED",
    },
    select: { id: true },
  });
  return log.id;
}

/** محاولة إرسال صف واحد. لا ترمي استثناءً — تُرجع نجاحاً أو فشلاً. */
export async function deliver(logId: string, client: PrismaClient = defaultPrisma): Promise<boolean> {
  const log = await client.notificationLog.findUnique({ where: { id: logId } });
  if (!log || log.status === "SENT" || !log.toAddress) return false;

  const payload = (log.payload ?? {}) as { params?: string[]; languageCode?: string; templateName?: string };
  const message: WhatsAppMessage = {
    templateName: payload.templateName ?? log.template,
    languageCode: payload.languageCode ?? "ar",
    params: payload.params ?? [],
    body: log.renderedBody ?? "",
  };

  const result = await provider.send(log.toAddress, message);
  const attempts = log.attempts + 1;

  if (result.ok) {
    await client.notificationLog.update({
      where: { id: logId },
      data: { status: "SENT", attempts, sentAt: new Date(), providerMessageId: result.providerMessageId, error: null },
    });
    return true;
  }

  const exhausted = !result.retryable || attempts >= MAX_ATTEMPTS;
  await client.notificationLog.update({
    where: { id: logId },
    data: { status: exhausted ? "FAILED" : "QUEUED", attempts, error: result.error },
  });
  return false;
}

/** عامل إعادة المحاولة — يُشغَّل دورياً على ما بقي في الطابور. */
export async function flushPending(limit = 50, client: PrismaClient = defaultPrisma): Promise<number> {
  const pending = await client.notificationLog.findMany({
    // القنوات الخارجية وحدها: إشعار التطبيق تسليمه كتابتُه، ولا مزوّد له
    // يُعاد إليه. وهو يُكتب SENT أصلاً، لكن الشرط صريحٌ كي لا يعتمد هذا
    // العامل على تفصيلٍ في مكانٍ آخر قد يتبدّل
    where: { status: "QUEUED", channel: { not: "IN_APP" }, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  let delivered = 0;
  for (const { id } of pending) {
    if (await deliver(id, client)) delivered++;
  }
  return delivered;
}

/** رقم الواتساب المعتمد: أولوية رقم الموقع، ثم رقم الطبيب. */
export function resolveDoctorWhatsApp(practice: {
  whatsappNumber: string | null;
  doctor: { whatsappNumber: string | null; whatsappEnabled: boolean };
}): string | null {
  if (!practice.doctor.whatsappEnabled) return null;
  const number = practice.whatsappNumber ?? practice.doctor.whatsappNumber;
  return number ? toWhatsAppAddress(number) : null;
}

/**
 * تحويل تفاصيل الحجز إلى واتساب الطبيب.
 * تُستدعى بعد نجاح معاملة الحجز؛ لا ترمي استثناءً مهما حدث.
 */
export async function notifyDoctorOfNewBooking(
  appointmentId: string,
  client: PrismaClient = defaultPrisma,
): Promise<{ queued: boolean; delivered: boolean; reason?: string }> {
  const appointment = await client.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: { include: { account: { select: { phone: true } } } },
      doctorClinic: {
        include: {
          clinic: { select: { nameAr: true } },
          doctor: { select: { userId: true, whatsappNumber: true, whatsappEnabled: true } },
        },
      },
    },
  });
  if (!appointment) return { queued: false, delivered: false, reason: "الحجز غير موجود" };

  const to = resolveDoctorWhatsApp(appointment.doctorClinic);
  if (!to) return { queued: false, delivered: false, reason: "لا يوجد رقم واتساب مفعّل لهذا الطبيب" };

  const summary = toBookingSummary(appointment);
  const message = newBookingMessage(summary);
  const logId = await queueWhatsApp(
    {
      userId: appointment.doctorClinic.doctor.userId,
      appointmentId: appointment.id,
      to,
      template: message.templateName,
      message,
    },
    client,
  );

  const delivered = await deliver(logId, client);
  return { queued: true, delivered };
}

/** إشعار الطبيب بإلغاء حجز. */
export async function notifyDoctorOfCancellation(
  appointmentId: string,
  cancelledBy: "PATIENT" | "CLINIC",
  client: PrismaClient = defaultPrisma,
): Promise<{ queued: boolean; delivered: boolean; reason?: string }> {
  const appointment = await client.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: { include: { account: { select: { phone: true } } } },
      doctorClinic: {
        include: {
          clinic: { select: { nameAr: true } },
          doctor: { select: { userId: true, whatsappNumber: true, whatsappEnabled: true } },
        },
      },
    },
  });
  if (!appointment) return { queued: false, delivered: false, reason: "الحجز غير موجود" };

  const to = resolveDoctorWhatsApp(appointment.doctorClinic);
  if (!to) return { queued: false, delivered: false, reason: "لا يوجد رقم واتساب مفعّل لهذا الطبيب" };

  const message = bookingCancelledMessage(toBookingSummary(appointment), cancelledBy);
  const logId = await queueWhatsApp(
    {
      userId: appointment.doctorClinic.doctor.userId,
      appointmentId: appointment.id,
      to,
      template: message.templateName,
      message,
    },
    client,
  );

  const delivered = await deliver(logId, client);
  return { queued: true, delivered };
}

type AppointmentWithRelations = {
  reference: string;
  bookingMode: "SLOT" | "QUEUE";
  slotStart: Date;
  sessionStart: Date;
  sessionEnd: Date;
  queueNumber: number;
  patientNote: string | null;
  patient: { fullName: string; phone: string | null; account: { phone: string | null } };
  doctorClinic: { clinic: { nameAr: string } };
};

function toBookingSummary(appointment: AppointmentWithRelations): BookingSummary {
  return {
    reference: appointment.reference,
    patientName: appointment.patient.fullName,
    // رقم المريض نفسه إن وُجد، وإلا رقم الحساب الذي حجز له
    patientPhone: appointment.patient.phone ?? appointment.patient.account.phone ?? "",
    clinicName: appointment.doctorClinic.clinic.nameAr,
    bookingMode: appointment.bookingMode,
    slotStart: appointment.slotStart,
    sessionStart: appointment.sessionStart,
    sessionEnd: appointment.sessionEnd,
    queueNumber: appointment.queueNumber,
    patientNote: appointment.patientNote,
  };
}

/* ── إشعارات المريض في صندوق التطبيق ─────────────────────────── */

/**
 * يخبر المريض بأن حجزه ثُبّت، ويعطيه رقمه.
 *
 * منفصلٌ عن إشعار الطبيب لأنهما لا يتلازمان: الطبيب قد يكون بلا واتساب
 * مفعّل، والمريض يستحقّ إشعاره في الحالتين.
 */
export async function notifyPatientOfBooking(
  appointmentId: string,
  client: PrismaClient = defaultPrisma,
): Promise<boolean> {
  const appointment = await client.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      dailyNumber: true,
      slotStart: true,
      bookedByUserId: true,
      patient: { select: { fullName: true } },
      doctorClinic: {
        select: {
          clinic: { select: { nameAr: true, timezone: true } },
          doctor: { select: { title: true, user: { select: { fullName: true } } } },
        },
      },
    },
  });
  if (!appointment) return false;

  const when = formatWhen(appointment.slotStart, appointment.doctorClinic.clinic.timezone);
  const doctor = `${appointment.doctorClinic.doctor.title} ${appointment.doctorClinic.doctor.user.fullName}`;
  const number = appointment.dailyNumber ? ` رقمك في العيادة ${toArabicDigits(appointment.dailyNumber)}.` : "";

  return notifyInApp(
    {
      userId: appointment.bookedByUserId,
      appointmentId: appointment.id,
      template: "booking_confirmed",
      title: "تم تثبيت حجزك",
      body: `${appointment.patient.fullName} عند ${doctor} — ${when}، ${appointment.doctorClinic.clinic.nameAr}.${number}`,
      linkTo: "/bookings",
    },
    client,
  );
}

/** يخبر المريض بأن موعده أُلغي، ومن ألغاه. */
export async function notifyPatientOfCancellation(
  appointmentId: string,
  cancelledBy: "PATIENT" | "CLINIC",
  reason: string | null,
  client: PrismaClient = defaultPrisma,
): Promise<boolean> {
  // إلغاء المريض بيده لا يحتاج إشعاراً يخبره بما فعله للتوّ
  if (cancelledBy === "PATIENT") return false;

  const appointment = await client.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      slotStart: true,
      bookedByUserId: true,
      doctorClinic: {
        select: {
          clinic: { select: { nameAr: true, timezone: true } },
          doctor: { select: { title: true, user: { select: { fullName: true } } } },
        },
      },
    },
  });
  if (!appointment) return false;

  const when = formatWhen(appointment.slotStart, appointment.doctorClinic.clinic.timezone);
  const doctor = `${appointment.doctorClinic.doctor.title} ${appointment.doctorClinic.doctor.user.fullName}`;

  return notifyInApp(
    {
      userId: appointment.bookedByUserId,
      appointmentId: appointment.id,
      template: "booking_cancelled",
      title: "أُلغي موعدك",
      body: `موعدك عند ${doctor} — ${when} أُلغي من العيادة.${reason ? ` السبب: ${reason}` : ""} تقدر تحجز موعداً آخر.`,
      linkTo: "/bookings",
    },
    client,
  );
}

/** يدعو المريض لتقييم زيارةٍ انتهت. */
export async function notifyPatientToReview(
  appointmentId: string,
  client: PrismaClient = defaultPrisma,
): Promise<boolean> {
  const appointment = await client.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      bookedByUserId: true,
      doctorClinic: { select: { doctor: { select: { title: true, user: { select: { fullName: true } } } } } },
    },
  });
  if (!appointment) return false;

  const doctor = `${appointment.doctorClinic.doctor.title} ${appointment.doctorClinic.doctor.user.fullName}`;
  return notifyInApp(
    {
      userId: appointment.bookedByUserId,
      appointmentId: appointment.id,
      template: "review_request",
      title: "كيف كانت زيارتك؟",
      body: `تقييمك لـ${doctor} يساعد مرضى غيرك على الاختيار. يأخذ ثوانٍ.`,
      linkTo: "/bookings",
    },
    client,
  );
}

/** التاريخ والساعة بتوقيت العيادة، في سطرٍ يُقرأ لا في صيغةٍ تقنية */
function formatWhen(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ar-IQ", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}

const toArabicDigits = (value: number) => String(value).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
