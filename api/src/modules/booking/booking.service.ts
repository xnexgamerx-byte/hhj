/**
 * إنشاء الحجز وإلغاؤه.
 *
 * قاعدتان حاكمتان:
 *  ١. القيد الفريد في قاعدة البيانات هو ما يمنع الحجز المزدوج، لا التحقق في الكود.
 *  ٢. فشل الواتساب لا يُفشل الحجز — يُرسل بعد نجاح المعاملة، وما يسقط يبقى في الطابور.
 */
import { randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/prisma.js";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.js";
import { notifyDoctorOfCancellation, notifyDoctorOfNewBooking } from "../../notifications/dispatch.js";

/** رقم مرجعي قصير يقرأه المريض للسكرتير — بلا أحرف متشابهة. */
function generateReference(): string {
  const alphabet = "ACDEFGHJKLMNPQRTUVWXY34679";
  const bytes = randomBytes(6);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return `${out.slice(0, 3)}-${out.slice(3)}`;
}

export type CreateBookingInput = {
  doctorClinicId: string;
  patientId: string;
  bookedByUserId: string;
  /** بداية فترة الدوام */
  sessionStart: Date;
  sessionEnd: Date;
  /** لنمط الوقت المحدد فقط — الفترة التي اختارها المريض */
  slotStart?: Date;
  patientNote?: string | null;
  /** موجود إن أضاف السكرتير الحجز يدوياً لمريض حضر بلا تطبيق */
  createdByStaffId?: string | null;
};

export type CreateBookingResult = {
  appointmentId: string;
  reference: string;
  queueNumber: number;
  slotStart: Date;
  status: string;
  whatsapp: { queued: boolean; delivered: boolean; reason?: string };
};

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export async function createBooking(
  input: CreateBookingInput,
  client: PrismaClient = defaultPrisma,
): Promise<CreateBookingResult> {
  const practice = await client.doctorClinic.findUnique({
    where: { id: input.doctorClinicId },
    include: { doctor: { select: { id: true, isActive: true, isPublished: true } } },
  });
  if (!practice) throw notFound("PRACTICE_NOT_FOUND", "العيادة غير موجودة");
  if (!practice.isActive || !practice.doctor.isActive) {
    throw forbidden("PRACTICE_INACTIVE", "هذه العيادة لا تستقبل حجوزات حالياً");
  }

  const patient = await client.patient.findUnique({
    where: { id: input.patientId },
    select: { id: true, accountId: true },
  });
  if (!patient) throw notFound("PATIENT_NOT_FOUND", "المريض غير موجود");
  if (patient.accountId !== input.bookedByUserId && !input.createdByStaffId) {
    throw forbidden("NOT_YOUR_PATIENT", "لا يمكنك الحجز باسم مريض لا يتبع حسابك");
  }

  const blocked = await client.blockedPatient.findUnique({
    where: { doctorId_patientId: { doctorId: practice.doctor.id, patientId: patient.id } },
    select: { id: true },
  });
  if (blocked) throw forbidden("PATIENT_BLOCKED", "لا يمكن الحجز عند هذا الطبيب");

  if (input.sessionEnd <= input.sessionStart) {
    throw badRequest("INVALID_SESSION", "فترة الدوام غير صحيحة");
  }
  const horizon = new Date(Date.now() + practice.bookingHorizonDays * 24 * 60 * 60 * 1000);
  if (input.sessionStart > horizon) {
    throw badRequest("BEYOND_HORIZON", "لا يمكن الحجز إلى هذا التاريخ البعيد");
  }

  const status = practice.autoConfirm ? "CONFIRMED" : "PENDING";

  const appointment =
    practice.bookingMode === "SLOT"
      ? await createSlotBooking(input, status, client)
      : await createQueueBooking(input, practice.capacityPerSession, status, client);

  // بعد نجاح الحجز فقط: تحويل التفاصيل لواتساب الطبيب.
  // أي فشل هنا لا يمس الحجز — يبقى في الطابور لإعادة المحاولة.
  let whatsapp: CreateBookingResult["whatsapp"];
  try {
    whatsapp = await notifyDoctorOfNewBooking(appointment.id, client);
  } catch (error) {
    whatsapp = { queued: false, delivered: false, reason: (error as Error).message };
  }

  return {
    appointmentId: appointment.id,
    reference: appointment.reference,
    queueNumber: appointment.queueNumber,
    slotStart: appointment.slotStart,
    status: appointment.status,
    whatsapp,
  };
}

async function createSlotBooking(
  input: CreateBookingInput,
  status: "CONFIRMED" | "PENDING",
  client: PrismaClient,
) {
  if (!input.slotStart) throw badRequest("SLOT_REQUIRED", "اختر وقت الموعد");
  if (input.slotStart < input.sessionStart || input.slotStart >= input.sessionEnd) {
    throw badRequest("SLOT_OUT_OF_SESSION", "الوقت المختار خارج دوام الطبيب");
  }

  try {
    return await client.appointment.create({
      data: {
        reference: generateReference(),
        doctorClinicId: input.doctorClinicId,
        patientId: input.patientId,
        bookedByUserId: input.bookedByUserId,
        createdByStaffId: input.createdByStaffId ?? null,
        bookingMode: "SLOT",
        sessionStart: input.sessionStart,
        sessionEnd: input.sessionEnd,
        slotStart: input.slotStart,
        queueNumber: 0,
        status,
        lockKey: true,
        patientNote: input.patientNote ?? null,
        confirmedAt: status === "CONFIRMED" ? new Date() : null,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("SLOT_TAKEN", "هذا الوقت حُجز للتو. اختر وقتاً آخر");
    }
    throw error;
  }
}

/**
 * نمط رقم الدور: نأخذ الرقم التالي المتاح.
 * حساب «الأكبر + ١» عرضة للتسابق، لذا نعتمد على القيد الفريد ونعيد المحاولة
 * عند التصادم بدل قفل الجدول — أسرع وأقل تعطيلاً تحت الضغط.
 */
async function createQueueBooking(
  input: CreateBookingInput,
  capacity: number,
  status: "CONFIRMED" | "PENDING",
  client: PrismaClient,
) {
  const MAX_RETRIES = 10;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const highest = await client.appointment.aggregate({
      where: {
        doctorClinicId: input.doctorClinicId,
        slotStart: input.sessionStart,
        lockKey: true,
      },
      _max: { queueNumber: true },
    });

    const next = (highest._max.queueNumber ?? 0) + 1;
    if (next > capacity) {
      throw conflict("SESSION_FULL", "اكتمل عدد المرضى في هذه الفترة. اختر يوماً آخر");
    }

    try {
      return await client.appointment.create({
        data: {
          reference: generateReference(),
          doctorClinicId: input.doctorClinicId,
          patientId: input.patientId,
          bookedByUserId: input.bookedByUserId,
          createdByStaffId: input.createdByStaffId ?? null,
          bookingMode: "QUEUE",
          sessionStart: input.sessionStart,
          sessionEnd: input.sessionEnd,
          slotStart: input.sessionStart,
          queueNumber: next,
          status,
          lockKey: true,
          patientNote: input.patientNote ?? null,
          confirmedAt: status === "CONFIRMED" ? new Date() : null,
        },
      });
    } catch (error) {
      // تصادم على نفس رقم الدور: مريض آخر سبقنا بجزء من الثانية — نعيد الحساب
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }

  throw conflict("QUEUE_CONTENTION", "الضغط عالٍ على هذه الفترة. حاول مرة أخرى");
}

export async function cancelBooking(
  appointmentId: string,
  cancelledBy: "PATIENT" | "CLINIC",
  actorUserId: string,
  reason: string | null,
  client: PrismaClient = defaultPrisma,
): Promise<void> {
  const appointment = await client.appointment.findUnique({
    where: { id: appointmentId },
    include: { doctorClinic: { select: { cancelCutoffMinutes: true } } },
  });
  if (!appointment) throw notFound("APPOINTMENT_NOT_FOUND", "الحجز غير موجود");
  if (appointment.lockKey === null) throw conflict("ALREADY_CANCELLED", "هذا الحجز ملغى أصلاً");

  if (cancelledBy === "PATIENT") {
    const cutoff = new Date(
      appointment.sessionStart.getTime() - appointment.doctorClinic.cancelCutoffMinutes * 60_000,
    );
    if (new Date() > cutoff) {
      throw forbidden("CANCEL_TOO_LATE", "انتهت مهلة الإلغاء. اتصل بالعيادة");
    }
  }

  await client.$transaction(async (tx) => {
    // lockKey = null هو ما يحرّر المكان لغيره مع بقاء صف الحجز في السجل
    await tx.appointment.update({
      where: { id: appointmentId },
      data: {
        status: cancelledBy === "PATIENT" ? "CANCELLED_BY_PATIENT" : "CANCELLED_BY_CLINIC",
        lockKey: null,
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "APPOINTMENT_CANCELLED",
        entity: "Appointment",
        entityId: appointmentId,
        after: { cancelledBy, reason },
      },
    });
  });

  try {
    await notifyDoctorOfCancellation(appointmentId, cancelledBy, client);
  } catch {
    // الإلغاء تم؛ تعذّر إشعار الطبيب لا يُبطله
  }
}
