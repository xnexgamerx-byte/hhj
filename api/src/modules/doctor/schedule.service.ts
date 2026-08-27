/**
 * إدارة الطبيب لأوقاته.
 *
 * الطبيب يملك جدوله: يحدد أيام دوامه وساعاتها، ويعطّل يوماً أو فترة عند الحاجة.
 * كل دالة هنا تتحقق أولاً أن الممارسة تخص الطبيب الطالب — الاعتماد على واجهة
 * المستخدم في إخفاء ما لا يملكه ليس حماية.
 */
import type { AppointmentStatus, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/prisma.js";
import { badRequest, forbidden, notFound } from "../../lib/errors.js";
import { WEEKDAY_NAMES_AR, timeToMinutes } from "../../lib/timezone.js";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type ScheduleEntry = {
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes?: number | null;
  capacity?: number | null;
};

/** يتحقق أن الممارسة تخص هذا الطبيب ويُرجعها. */
async function ownedPractice(userId: string, practiceId: string, client: PrismaClient) {
  const practice = await client.doctorClinic.findUnique({
    where: { id: practiceId },
    include: { doctor: { select: { userId: true } }, clinic: { select: { nameAr: true, timezone: true } } },
  });
  if (!practice) throw notFound("PRACTICE_NOT_FOUND", "العيادة غير موجودة");
  if (practice.doctor.userId !== userId) {
    throw forbidden("NOT_YOUR_PRACTICE", "هذه العيادة لا تخصك");
  }
  return practice;
}

export async function getMyPractices(userId: string, client: PrismaClient = defaultPrisma) {
  const doctor = await client.doctor.findUnique({
    where: { userId },
    include: {
      practices: {
        where: { isActive: true },
        include: {
          clinic: {
            select: {
              nameAr: true,
              landmark: true,
              timezone: true,
              governorate: { select: { nameAr: true } },
              district: { select: { nameAr: true } },
            },
          },
          schedules: { where: { isActive: true }, orderBy: [{ weekday: "asc" }, { startTime: "asc" }] },
        },
      },
    },
  });
  if (!doctor) throw notFound("DOCTOR_NOT_FOUND", "لا يوجد ملف طبيب لهذا الحساب");

  return doctor.practices.map((practice) => ({
    id: practice.id,
    clinicName: practice.clinic.nameAr,
    landmark: practice.clinic.landmark,
    governorate: practice.clinic.governorate.nameAr,
    district: practice.clinic.district.nameAr,
    feeAmount: practice.feeAmount,
    depositAmount: practice.depositAmount,
    bookingMode: practice.bookingMode,
    slotMinutes: practice.slotMinutes,
    capacityPerSession: practice.capacityPerSession,
    autoConfirm: practice.autoConfirm,
    cancelCutoffMinutes: practice.cancelCutoffMinutes,
    bookingHorizonDays: practice.bookingHorizonDays,
    schedules: practice.schedules.map((s) => ({
      id: s.id,
      weekday: s.weekday,
      weekdayName: WEEKDAY_NAMES_AR[s.weekday],
      startTime: s.startTime,
      endTime: s.endTime,
      slotMinutes: s.slotMinutes,
      capacity: s.capacity,
    })),
  }));
}

/**
 * يستبدل جدول الأسبوع كاملاً بما أرسله الطبيب.
 * الاستبدال الكامل أوضح من التعديل الجزئي: ما يراه الطبيب على الشاشة هو ما يُحفظ،
 * ولا تبقى بقايا فترات قديمة تظهر للمرضى دون أن ينتبه.
 */
export async function setWeeklySchedule(
  userId: string,
  practiceId: string,
  entries: ScheduleEntry[],
  client: PrismaClient = defaultPrisma,
) {
  await ownedPractice(userId, practiceId, client);

  const byWeekday = new Map<number, ScheduleEntry[]>();
  for (const entry of entries) {
    if (!Number.isInteger(entry.weekday) || entry.weekday < 0 || entry.weekday > 6) {
      throw badRequest("INVALID_WEEKDAY", "يوم الأسبوع غير صحيح");
    }
    if (!TIME_PATTERN.test(entry.startTime) || !TIME_PATTERN.test(entry.endTime)) {
      throw badRequest("INVALID_TIME", "صيغة الوقت غير صحيحة. استعمل مثل 16:00");
    }
    if (timeToMinutes(entry.endTime) <= timeToMinutes(entry.startTime)) {
      throw badRequest("INVALID_RANGE", `فترة ${WEEKDAY_NAMES_AR[entry.weekday]}: وقت الانتهاء قبل البداية`);
    }
    const list = byWeekday.get(entry.weekday) ?? [];
    list.push(entry);
    byWeekday.set(entry.weekday, list);
  }

  // فترتان متداخلتان في يوم واحد تنتجان فترات مكررة يراها المريض مرتين
  for (const [weekday, list] of byWeekday) {
    const sorted = [...list].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      if (timeToMinutes(sorted[i].startTime) < timeToMinutes(sorted[i - 1].endTime)) {
        throw badRequest(
          "OVERLAPPING_SESSIONS",
          `فترتان متداخلتان يوم ${WEEKDAY_NAMES_AR[weekday]}`,
        );
      }
    }
  }

  await client.$transaction(async (tx) => {
    await tx.scheduleTemplate.deleteMany({ where: { doctorClinicId: practiceId } });
    if (entries.length > 0) {
      await tx.scheduleTemplate.createMany({
        data: entries.map((entry) => ({
          doctorClinicId: practiceId,
          weekday: entry.weekday,
          startTime: entry.startTime,
          endTime: entry.endTime,
          slotMinutes: entry.slotMinutes ?? null,
          capacity: entry.capacity ?? null,
        })),
      });
    }
    await tx.auditLog.create({
      data: {
        actorUserId: userId,
        action: "SCHEDULE_UPDATED",
        entity: "DoctorClinic",
        entityId: practiceId,
        after: { sessions: entries.length },
      },
    });
  });

  return getMyPractices(userId, client);
}

/** إعدادات الحجز: النمط، مدة الكشف، السعة، التأكيد التلقائي. */
export async function updateBookingSettings(
  userId: string,
  practiceId: string,
  settings: {
    bookingMode?: "SLOT" | "QUEUE";
    slotMinutes?: number;
    capacityPerSession?: number;
    autoConfirm?: boolean;
    cancelCutoffMinutes?: number;
    bookingHorizonDays?: number;
    feeAmount?: number;
    depositAmount?: number;
  },
  client: PrismaClient = defaultPrisma,
) {
  await ownedPractice(userId, practiceId, client);

  if (settings.slotMinutes !== undefined && (settings.slotMinutes < 5 || settings.slotMinutes > 120)) {
    throw badRequest("INVALID_SLOT_MINUTES", "مدة الكشف بين ٥ و١٢٠ دقيقة");
  }
  if (settings.capacityPerSession !== undefined && settings.capacityPerSession < 1) {
    throw badRequest("INVALID_CAPACITY", "عدد المرضى في الفترة يجب أن يكون واحداً على الأقل");
  }
  if (settings.depositAmount !== undefined && settings.depositAmount < 0) {
    throw badRequest("INVALID_DEPOSIT", "العربون لا يكون بالسالب");
  }
  if (
    settings.depositAmount !== undefined &&
    settings.feeAmount !== undefined &&
    settings.depositAmount > settings.feeAmount
  ) {
    // العربون يُخصم من أجرة الكشف، فتجاوزه لها يعني دفع المريض أكثر من السعر
    throw badRequest("DEPOSIT_ABOVE_FEE", "العربون لا يتجاوز أجرة الكشف");
  }

  await client.doctorClinic.update({ where: { id: practiceId }, data: settings });
  return getMyPractices(userId, client);
}

/**
 * تعطيل يوم أو فترة.
 * بلا ساعات ⇒ اليوم كله. مع ساعات ⇒ الفترة المحددة فقط (لموعد طارئ مثلاً).
 */
export async function addException(
  userId: string,
  practiceId: string,
  input: { date: string; type: "CLOSED" | "CUSTOM"; startTime?: string; endTime?: string; capacity?: number; reason?: string },
  client: PrismaClient = defaultPrisma,
) {
  await ownedPractice(userId, practiceId, client);

  if (input.startTime && !TIME_PATTERN.test(input.startTime)) {
    throw badRequest("INVALID_TIME", "صيغة وقت البداية غير صحيحة");
  }
  if (input.endTime && !TIME_PATTERN.test(input.endTime)) {
    throw badRequest("INVALID_TIME", "صيغة وقت الانتهاء غير صحيحة");
  }
  if (input.type === "CUSTOM" && (!input.startTime || !input.endTime)) {
    throw badRequest("TIMES_REQUIRED", "الدوام المخصص يحتاج وقت بداية ونهاية");
  }

  return client.scheduleException.create({
    data: {
      doctorClinicId: practiceId,
      date: new Date(`${input.date}T00:00:00.000Z`),
      type: input.type,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      capacity: input.capacity ?? null,
      reason: input.reason ?? null,
    },
  });
}

export async function listExceptions(
  userId: string,
  practiceId: string,
  client: PrismaClient = defaultPrisma,
) {
  await ownedPractice(userId, practiceId, client);
  return client.scheduleException.findMany({
    where: { doctorClinicId: practiceId, date: { gte: new Date(new Date().toISOString().slice(0, 10)) } },
    orderBy: { date: "asc" },
  });
}

export async function removeException(
  userId: string,
  exceptionId: string,
  client: PrismaClient = defaultPrisma,
) {
  const exception = await client.scheduleException.findUnique({
    where: { id: exceptionId },
    select: { doctorClinicId: true },
  });
  if (!exception) throw notFound("EXCEPTION_NOT_FOUND", "الاستثناء غير موجود");
  await ownedPractice(userId, exception.doctorClinicId, client);
  await client.scheduleException.delete({ where: { id: exceptionId } });
}

/** حجوزات الطبيب في يوم معيّن، مرتبة كما يستقبلهم. */
export async function getMyAppointments(
  userId: string,
  dateISO: string,
  client: PrismaClient = defaultPrisma,
) {
  const doctor = await client.doctor.findUnique({ where: { userId }, select: { id: true } });
  if (!doctor) throw notFound("DOCTOR_NOT_FOUND", "لا يوجد ملف طبيب لهذا الحساب");

  const dayStart = new Date(`${dateISO}T00:00:00.000Z`);
  dayStart.setUTCHours(dayStart.getUTCHours() - 12);
  const dayEnd = new Date(dayStart.getTime() + 48 * 3_600_000);

  const appointments = await client.appointment.findMany({
    where: {
      doctorClinic: { doctorId: doctor.id },
      sessionStart: { gte: dayStart, lt: dayEnd },
    },
    orderBy: [{ slotStart: "asc" }, { queueNumber: "asc" }],
    include: {
      patient: { select: { fullName: true, phone: true, birthYear: true, gender: true, account: { select: { phone: true } } } },
      doctorClinic: { select: { clinic: { select: { nameAr: true, timezone: true } } } },
    },
  });

  return appointments
    .filter((a) => a.slotStart.toISOString().slice(0, 10) === dateISO || sameZonedDate(a, dateISO))
    .map((a) => ({
      id: a.id,
      reference: a.reference,
      status: a.status,
      bookingMode: a.bookingMode,
      queueNumber: a.queueNumber,
      slotStart: a.slotStart.toISOString(),
      sessionStart: a.sessionStart.toISOString(),
      sessionEnd: a.sessionEnd.toISOString(),
      patientName: a.patient.fullName,
      patientPhone: a.patient.phone ?? a.patient.account.phone,
      patientNote: a.patientNote,
      clinicName: a.doctorClinic.clinic.nameAr,
      arrivedAt: a.arrivedAt?.toISOString() ?? null,
    }));
}

function sameZonedDate(
  appointment: { slotStart: Date; doctorClinic: { clinic: { timezone: string } } },
  dateISO: string,
): boolean {
  return (
    new Intl.DateTimeFormat("en-CA", {
      timeZone: appointment.doctorClinic.clinic.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(appointment.slotStart) === dateISO
  );
}

const ALLOWED_STATUSES: AppointmentStatus[] = ["CONFIRMED", "NO_SHOW", "COMPLETED"];

/** تأشير الحضور — هذه البيانات هي ما يبني سمعة المريض والطبيب معاً. */
export async function setAppointmentStatus(
  userId: string,
  appointmentId: string,
  status: AppointmentStatus,
  client: PrismaClient = defaultPrisma,
) {
  if (!ALLOWED_STATUSES.includes(status)) {
    throw badRequest("INVALID_STATUS", "حالة غير مسموحة. للإلغاء استعمل مسار الإلغاء");
  }

  const appointment = await client.appointment.findUnique({
    where: { id: appointmentId },
    include: { doctorClinic: { select: { doctor: { select: { userId: true } } } } },
  });
  if (!appointment) throw notFound("APPOINTMENT_NOT_FOUND", "الحجز غير موجود");
  if (appointment.doctorClinic.doctor.userId !== userId) {
    throw forbidden("NOT_YOUR_APPOINTMENT", "هذا الحجز لا يخصك");
  }
  if (appointment.lockKey === null) throw badRequest("ALREADY_CANCELLED", "هذا الحجز ملغى");

  const now = new Date();
  return client.appointment.update({
    where: { id: appointmentId },
    data: {
      status,
      arrivedAt: status === "CONFIRMED" ? (appointment.arrivedAt ?? now) : appointment.arrivedAt,
      completedAt: status === "COMPLETED" ? now : null,
    },
    select: { id: true, status: true },
  });
}
