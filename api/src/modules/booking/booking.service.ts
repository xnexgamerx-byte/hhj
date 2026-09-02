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
import { getAvailability } from "../availability/availability.service.js";
import { addDaysISO, utcToZonedDateISO } from "../../lib/timezone.js";

/** محاولات إعادة الحساب عند تصادم رقمين — التصادم لحظيّ ونادر */
const MAX_NUMBER_RETRIES = 10;

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
  /**
   * نمط الوقت المحدد: الفترة التي اختارها المريض.
   * نمط رقم الدور: بداية فترة الدوام.
   * فترة الدوام تُشتق من جدول الطبيب لا من طلب العميل — وإلا اخترع المريض
   * فترة دوام غير موجودة وحجز خارج أوقات الطبيب.
   */
  startAt: Date;
  patientNote?: string | null;
  /** موجود إن أضاف السكرتير الحجز يدوياً لمريض حضر بلا تطبيق */
  createdByStaffId?: string | null;
};

export type CreateBookingResult = {
  appointmentId: string;
  reference: string;
  queueNumber: number;
  /** رقم المريض ذلك اليوم — هو ما يحفظه ويُنادى به */
  dailyNumber: number;
  serviceDate: string;
  slotStart: Date;
  status: string;
  whatsapp: { queued: boolean; delivered: boolean; reason?: string };
};


const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * أيّ قيدٍ فريد انكسر؟ قيدان على الجدول: المكان المحجوز، والرقم اليومي.
 * الأول يعني «سبقك أحد إلى هذا الوقت» فيُبلَّغ المريض، والثاني يعني «سبقك أحد
 * إلى الرقم» فيُعاد الحساب صامتاً. الخلط بينهما يعطي المريض رسالةً كاذبة.
 */
const isDailyNumberClash = (error: unknown) => {
  if (!isUniqueViolation(error)) return false;
  const target = (error as Prisma.PrismaClientKnownRequestError).meta?.target;
  const fields = Array.isArray(target) ? target.join(",") : String(target ?? "");
  return fields.includes("dailyNumber");
};

/**
 * الرقم التالي في ذلك اليوم عند تلك العيادة.
 *
 * يُحسب على كل الصفوف لا على القائمة منها: الرقم في يد المريض، ولو أعدنا
 * استعماله بعد إلغاءٍ لحمله اثنان في يومٍ واحد ونادت العيادة فأتى الاثنان.
 */
async function nextDailyNumber(practiceId: string, serviceDate: string, client: PrismaClient): Promise<number> {
  const top = await client.appointment.aggregate({
    where: { doctorClinicId: practiceId, serviceDate },
    _max: { dailyNumber: true },
  });
  return (top._max.dailyNumber ?? 0) + 1;
}

export async function createBooking(
  input: CreateBookingInput,
  client: PrismaClient = defaultPrisma,
): Promise<CreateBookingResult> {
  const practice = await client.doctorClinic.findUnique({
    where: { id: input.doctorClinicId },
    include: {
      doctor: { select: { id: true, isActive: true, isPublished: true } },
      clinic: { select: { timezone: true } },
    },
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

  // مصدر الحقيقة لفترة الدوام هو جدول الطبيب، لا ما أرسله العميل
  const resolved = await resolveSession(input.doctorClinicId, input.startAt, practice.bookingMode, client);

  const status = practice.autoConfirm ? "CONFIRMED" : "PENDING";
  // اليوم بتوقيت العيادة لا بتوقيت الخادم: موعد الحادية عشرة ليلاً في بغداد
  // يقع في اليوم التالي بالتوقيت العالمي، فيأخذ رقم الغد ويُنادى به اليوم
  const serviceDate = utcToZonedDateISO(resolved.sessionStart, practice.clinic.timezone);

  const appointment =
    practice.bookingMode === "SLOT"
      ? await createSlotBooking(input, resolved, serviceDate, status, client)
      : await createQueueBooking(input, resolved, serviceDate, practice.capacityPerSession, status, client);

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
    dailyNumber: appointment.dailyNumber ?? 0,
    serviceDate: appointment.serviceDate ?? serviceDate,
    slotStart: appointment.slotStart,
    status: appointment.status,
    whatsapp,
  };
}

type ResolvedSession = { sessionStart: Date; sessionEnd: Date; capacity: number };

/**
 * يجد فترة الدوام التي يقع فيها الوقت المطلوب، ويتحقق أنها ما زالت مفتوحة.
 * يمنع ثلاث حالات دفعة واحدة: الحجز خارج دوام الطبيب، والحجز في يوم عطّله،
 * والحجز في وقت لا يقع على شبكة الفترات (٤:٠٧ بدل ٤:٠٠).
 */
async function resolveSession(
  practiceId: string,
  startAt: Date,
  mode: "SLOT" | "QUEUE",
  client: PrismaClient,
): Promise<ResolvedSession> {
  const dateISO = startAt.toISOString().slice(0, 10);
  const days = await getAvailability(
    practiceId,
    addDaysISO(dateISO, -1),
    addDaysISO(dateISO, 1),
    { includeTaken: true },
    client,
  );

  const target = startAt.toISOString();

  for (const day of days) {
    for (const session of day.sessions) {
      if (mode === "SLOT") {
        const slot = session.slots.find((s) => s.start === target);
        if (!slot) continue;
        if (slot.taken) throw conflict("SLOT_TAKEN", "هذا الوقت محجوز. اختر وقتاً آخر");
        return {
          sessionStart: new Date(session.sessionStart),
          sessionEnd: new Date(session.sessionEnd),
          capacity: session.capacity,
        };
      }
      if (session.sessionStart === target) {
        if (session.remaining <= 0) {
          throw conflict("SESSION_FULL", "اكتمل عدد المرضى في هذه الفترة. اختر يوماً آخر");
        }
        return {
          sessionStart: new Date(session.sessionStart),
          sessionEnd: new Date(session.sessionEnd),
          capacity: session.capacity,
        };
      }
    }
  }

  throw badRequest("NOT_AVAILABLE", "هذا الوقت غير متاح في جدول الطبيب");
}

async function createSlotBooking(
  input: CreateBookingInput,
  resolved: ResolvedSession,
  serviceDate: string,
  status: "CONFIRMED" | "PENDING",
  client: PrismaClient,
) {
  // نفس منطق نمط الدور: «الأعلى + ١» عرضة للتسابق، والقيد الفريد هو الحكم
  for (let attempt = 0; attempt < MAX_NUMBER_RETRIES; attempt++) {
    try {
      return await client.appointment.create({
        data: {
          reference: generateReference(),
          doctorClinicId: input.doctorClinicId,
          patientId: input.patientId,
          bookedByUserId: input.bookedByUserId,
          createdByStaffId: input.createdByStaffId ?? null,
          bookingMode: "SLOT",
          sessionStart: resolved.sessionStart,
          sessionEnd: resolved.sessionEnd,
          slotStart: input.startAt,
          queueNumber: 0,
          serviceDate,
          dailyNumber: await nextDailyNumber(input.doctorClinicId, serviceDate, client),
          status,
          lockKey: true,
          patientNote: input.patientNote ?? null,
          confirmedAt: status === "CONFIRMED" ? new Date() : null,
        },
      });
    } catch (error) {
      if (isDailyNumberClash(error)) continue;
      if (isUniqueViolation(error)) {
        throw conflict("SLOT_TAKEN", "هذا الوقت حُجز للتو. اختر وقتاً آخر");
      }
      throw error;
    }
  }
  throw conflict("NUMBER_CONTENTION", "الضغط عالٍ على هذه العيادة. حاول مرة أخرى");
}

/**
 * نمط رقم الدور: نأخذ الرقم التالي المتاح.
 * حساب «الأكبر + ١» عرضة للتسابق، لذا نعتمد على القيد الفريد ونعيد المحاولة
 * عند التصادم بدل قفل الجدول — أسرع وأقل تعطيلاً تحت الضغط.
 */
async function createQueueBooking(
  input: CreateBookingInput,
  resolved: ResolvedSession,
  serviceDate: string,
  fallbackCapacity: number,
  status: "CONFIRMED" | "PENDING",
  client: PrismaClient,
) {
  const capacity = resolved.capacity || fallbackCapacity;

  for (let attempt = 0; attempt < MAX_NUMBER_RETRIES; attempt++) {
    const highest = await client.appointment.aggregate({
      where: {
        doctorClinicId: input.doctorClinicId,
        slotStart: resolved.sessionStart,
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
          sessionStart: resolved.sessionStart,
          sessionEnd: resolved.sessionEnd,
          slotStart: resolved.sessionStart,
          queueNumber: next,
          serviceDate,
          dailyNumber: await nextDailyNumber(input.doctorClinicId, serviceDate, client),
          status,
          lockKey: true,
          patientNote: input.patientNote ?? null,
          confirmedAt: status === "CONFIRMED" ? new Date() : null,
        },
      });
    } catch (error) {
      // تصادم على رقم الدور أو الرقم اليومي: مريض آخر سبقنا بجزء من الثانية
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
