/**
 * السكرتير — المستخدم اليومي الحقيقي للوحة التحكم.
 *
 * الطبيب قد لا يفتح لوحته أسبوعاً، بينما السكرتير يفتحها عشرين مرة في اليوم.
 * لذلك أهم ما هنا هو **الحجز اليدوي**: مريض حضر أو اتصل بلا تطبيق. بدونه
 * يتضارب جدول التطبيق مع واقع العيادة خلال أسبوع، ويصل مريضان لنفس الوقت.
 */
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/prisma.js";
import { generateTemporaryPassword, hashPassword } from "../../lib/password.js";
import { normalizeIraqiPhone } from "../../lib/phone.js";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.js";
import { createBooking } from "../booking/booking.service.js";
import { resolveScope, assertOwns } from "./access.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** المالك ينشئ حساب السكرتير — كما ينشئ حساب الطبيب تماماً. */
export async function createStaffAccount(
  ownerId: string,
  input: {
    fullName: string;
    email: string;
    phone?: string | null;
    clinicId?: string | null;
    doctorClinicId?: string | null;
    canManageSchedule?: boolean;
  },
  client: PrismaClient = defaultPrisma,
) {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw badRequest("INVALID_EMAIL", "صيغة الإيميل غير صحيحة");
  if (input.fullName.trim().length < 3) throw badRequest("INVALID_NAME", "الاسم قصير جداً");
  if (!input.clinicId && !input.doctorClinicId) {
    throw badRequest("SCOPE_REQUIRED", "حدّد العيادة أو الطبيب الذي يتبعه السكرتير");
  }

  if (await client.user.findUnique({ where: { email }, select: { id: true } })) {
    throw conflict("EMAIL_TAKEN", "هذا الإيميل مستعمل لحساب آخر");
  }

  const phone = input.phone ? normalizeIraqiPhone(input.phone) : null;
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const created = await client.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        phone,
        fullName: input.fullName.trim(),
        role: "STAFF",
        passwordHash,
        mustChangePassword: true,
        createdByUserId: ownerId,
      },
    });

    const staff = await tx.staffMember.create({
      data: {
        userId: user.id,
        clinicId: input.clinicId ?? null,
        doctorClinicId: input.doctorClinicId ?? null,
        // السكرتير لا يعدّل السعر ولا ملف الطبيب — هذا للطبيب وحده
        canManageSchedule: input.canManageSchedule ?? false,
        canManageProfile: false,
      },
    });

    await tx.auditLog.create({
      data: { actorUserId: ownerId, action: "STAFF_CREATED", entity: "StaffMember", entityId: staff.id, after: { email } },
    });

    return { staffId: staff.id, userId: user.id };
  });

  return { ...created, fullName: input.fullName.trim(), email, temporaryPassword };
}

export async function listStaff(client: PrismaClient = defaultPrisma) {
  const rows = await client.staffMember.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { fullName: true, email: true, isActive: true, mustChangePassword: true, lastLoginAt: true } },
      clinic: { select: { nameAr: true } },
      doctorClinic: { include: { clinic: { select: { nameAr: true } }, doctor: { include: { user: { select: { fullName: true } } } } } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    fullName: row.user.fullName,
    email: row.user.email,
    isActive: row.isActive && row.user.isActive,
    mustChangePassword: row.user.mustChangePassword,
    lastLoginAt: row.user.lastLoginAt?.toISOString() ?? null,
    canManageSchedule: row.canManageSchedule,
    scope: row.doctorClinic
      ? `${row.doctorClinic.doctor.title} ${row.doctorClinic.doctor.user.fullName} — ${row.doctorClinic.clinic.nameAr}`
      : (row.clinic?.nameAr ?? "—"),
  }));
}

export async function setStaffActive(
  ownerId: string,
  staffId: string,
  isActive: boolean,
  client: PrismaClient = defaultPrisma,
) {
  const staff = await client.staffMember.findUnique({ where: { id: staffId }, select: { userId: true } });
  if (!staff) throw notFound("STAFF_NOT_FOUND", "السكرتير غير موجود");

  await client.$transaction(async (tx) => {
    await tx.staffMember.update({ where: { id: staffId }, data: { isActive } });
    await tx.user.update({ where: { id: staff.userId }, data: { isActive } });
    if (!isActive) {
      await tx.refreshToken.updateMany({ where: { userId: staff.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await tx.auditLog.create({
      data: { actorUserId: ownerId, action: isActive ? "STAFF_ENABLED" : "STAFF_DISABLED", entity: "StaffMember", entityId: staffId },
    });
  });
}

/** العيادات التي يديرها هذا السكرتير أو الطبيب. */
export async function getMyClinics(userId: string, client: PrismaClient = defaultPrisma) {
  const scope = await resolveScope(userId, client);

  const practices = await client.doctorClinic.findMany({
    where: { id: { in: scope.practiceIds } },
    include: {
      clinic: { select: { nameAr: true, landmark: true } },
      doctor: { include: { user: { select: { fullName: true } } } },
    },
  });

  return {
    role: scope.role,
    canManageSchedule: scope.canManageSchedule,
    practices: practices.map((practice) => ({
      id: practice.id,
      clinicName: practice.clinic.nameAr,
      landmark: practice.clinic.landmark,
      doctorName: `${practice.doctor.title} ${practice.doctor.user.fullName}`,
      bookingMode: practice.bookingMode,
      feeAmount: practice.feeAmount,
    })),
  };
}

/**
 * حجز يدوي لمريض حضر أو اتصل بلا تطبيق.
 * ينشئ له حساباً برقم هاتفه إن لم يكن موجوداً، فيصله التذكير وتُحفظ زياراته.
 */
export async function createWalkInBooking(
  userId: string,
  input: {
    doctorClinicId: string;
    fullName: string;
    phone: string;
    startAt: string;
    note?: string | null;
  },
  client: PrismaClient = defaultPrisma,
) {
  const scope = await resolveScope(userId, client);
  assertOwns(scope, input.doctorClinicId);

  const fullName = input.fullName.trim();
  if (fullName.length < 3) throw badRequest("INVALID_NAME", "اسم المريض قصير جداً");
  const phone = normalizeIraqiPhone(input.phone);

  // نربطه بحسابه إن كان مسجَّلاً، وإلا ننشئ له واحداً — فيرى حجزه في التطبيق
  let account = await client.user.findUnique({ where: { phone }, include: { patients: true } });
  if (!account) {
    account = await client.user.create({
      data: { phone, fullName, role: "PATIENT", patients: { create: { fullName, isSelf: true } } },
      include: { patients: true },
    });
  }

  const patient =
    account.patients.find((p) => p.fullName.trim() === fullName) ??
    account.patients.find((p) => p.isSelf) ??
    (await client.patient.create({ data: { accountId: account.id, fullName, isSelf: false } }));

  return createBooking(
    {
      doctorClinicId: input.doctorClinicId,
      patientId: patient.id,
      bookedByUserId: account.id,
      startAt: new Date(input.startAt),
      patientNote: input.note ?? null,
      createdByStaffId: scope.staffId,
    },
    client,
  );
}

/** تأجيل جماعي: الطبيب تأخر، فتُزاح مواعيد الفترة كلها. */
export async function shiftSessionAppointments(
  userId: string,
  input: { doctorClinicId: string; sessionStart: string; minutes: number },
  client: PrismaClient = defaultPrisma,
) {
  const scope = await resolveScope(userId, client);
  assertOwns(scope, input.doctorClinicId);

  if (!Number.isInteger(input.minutes) || input.minutes === 0 || Math.abs(input.minutes) > 480) {
    throw badRequest("INVALID_SHIFT", "الإزاحة بين ١ و٤٨٠ دقيقة");
  }

  const sessionStart = new Date(input.sessionStart);
  const shift = input.minutes * 60_000;

  const appointments = await client.appointment.findMany({
    where: { doctorClinicId: input.doctorClinicId, sessionStart, lockKey: true },
    select: { id: true, slotStart: true, sessionEnd: true },
  });
  if (appointments.length === 0) throw notFound("NO_APPOINTMENTS", "لا توجد حجوزات في هذه الفترة");

  // الإزاحة تُنفَّذ بمعاملة واحدة: إما تُزاح كلها أو لا شيء.
  // إزاحة نصف الفترة تترك مرضى في الوقت القديم وآخرين في الجديد.
  await client.$transaction(
    appointments.map((appointment) =>
      client.appointment.update({
        where: { id: appointment.id },
        data: {
          slotStart: new Date(appointment.slotStart.getTime() + shift),
          sessionStart: new Date(sessionStart.getTime() + shift),
          sessionEnd: new Date(appointment.sessionEnd.getTime() + shift),
          clinicNote: `أُزيح ${input.minutes} دقيقة`,
        },
      }),
    ),
  );

  return { shifted: appointments.length };
}

/** حجوزات اليوم لكل عيادات المستخدم — يعمل للطبيب والسكرتير معاً. */
export async function getScopedAppointments(
  userId: string,
  dateISO: string,
  client: PrismaClient = defaultPrisma,
) {
  const scope = await resolveScope(userId, client);
  if (scope.practiceIds.length === 0) return [];

  // نافذة واسعة ثم تصفية بتوقيت العيادة: اليوم في بغداد ليس اليوم بالتوقيت العالمي
  const windowStart = new Date(`${dateISO}T00:00:00.000Z`);
  windowStart.setUTCHours(windowStart.getUTCHours() - 12);
  const windowEnd = new Date(windowStart.getTime() + 48 * 3_600_000);

  const appointments = await client.appointment.findMany({
    where: {
      doctorClinicId: { in: scope.practiceIds },
      sessionStart: { gte: windowStart, lt: windowEnd },
    },
    orderBy: [{ slotStart: "asc" }, { queueNumber: "asc" }],
    include: {
      patient: { select: { fullName: true, phone: true, account: { select: { phone: true } } } },
      createdByStaff: { select: { id: true } },
      doctorClinic: {
        include: {
          clinic: { select: { nameAr: true, timezone: true } },
          doctor: { include: { user: { select: { fullName: true } } } },
        },
      },
    },
  });

  return appointments
    .filter(
      (appointment) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: appointment.doctorClinic.clinic.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(appointment.slotStart) === dateISO,
    )
    .map((appointment) => ({
      id: appointment.id,
      reference: appointment.reference,
      status: appointment.status,
      paymentStatus: appointment.paymentStatus,
      depositAmount: appointment.depositAmount,
      bookingMode: appointment.bookingMode,
      queueNumber: appointment.queueNumber,
      slotStart: appointment.slotStart.toISOString(),
      sessionStart: appointment.sessionStart.toISOString(),
      sessionEnd: appointment.sessionEnd.toISOString(),
      patientName: appointment.patient.fullName,
      patientPhone: appointment.patient.phone ?? appointment.patient.account.phone,
      patientNote: appointment.patientNote,
      clinicName: appointment.doctorClinic.clinic.nameAr,
      doctorName: `${appointment.doctorClinic.doctor.title} ${appointment.doctorClinic.doctor.user.fullName}`,
      practiceId: appointment.doctorClinicId,
      arrivedAt: appointment.arrivedAt?.toISOString() ?? null,
      isWalkIn: appointment.createdByStaff !== null,
    }));
}

/** تأشير الحضور — للطبيب والسكرتير معاً. */
export async function setScopedAppointmentStatus(
  userId: string,
  appointmentId: string,
  status: "CONFIRMED" | "NO_SHOW" | "COMPLETED",
  client: PrismaClient = defaultPrisma,
) {
  const scope = await resolveScope(userId, client);

  const appointment = await client.appointment.findUnique({
    where: { id: appointmentId },
    select: { doctorClinicId: true, lockKey: true, arrivedAt: true },
  });
  if (!appointment) throw notFound("APPOINTMENT_NOT_FOUND", "الحجز غير موجود");
  assertOwns(scope, appointment.doctorClinicId);
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

export { resolveScope, assertOwns };
