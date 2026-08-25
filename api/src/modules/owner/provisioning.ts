/**
 * تسجيل الأطباء — لا يوجد تسجيل ذاتي.
 *
 * المالك وحده ينشئ حساب كل طبيب ويولّد له إيميلاً وباسووردًا أولياً.
 * الباسوورد النصي يظهر **مرة واحدة فقط** في ردّ هذه الدالة ليسلّمه المالك للطبيب،
 * ولا يُخزَّن ولا يُكتب في أي سجل. بعدها يُلزَم الطبيب بتغييره أول دخول.
 */
import type { Gender, Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/prisma.js";
import { generateTemporaryPassword, hashPassword } from "../../lib/password.js";
import { normalizeIraqiPhone } from "../../lib/phone.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type CreateDoctorInput = {
  fullName: string;
  email: string;
  /** رقم واتساب الطبيب الذي تصله تفاصيل الحجوزات */
  whatsappNumber?: string | null;
  phone?: string | null;
  title?: string;
  bio?: string | null;
  yearsOfExperience?: number | null;
  gender?: Gender | null;
  licenseNumber?: string | null;
  specialtyIds?: number[];
  /** يترك فارغاً ليولَّد باسوورد عشوائي، أو يحدده المالك بنفسه */
  temporaryPassword?: string;
};

export type CreatedDoctor = {
  doctorId: string;
  userId: string;
  fullName: string;
  email: string;
  /** يُعرض للمالك مرة واحدة ثم يختفي — غير مخزَّن في أي مكان */
  temporaryPassword: string;
};

function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw badRequest("INVALID_EMAIL", "صيغة الإيميل غير صحيحة");
  return email;
}

export async function createDoctorAccount(
  ownerId: string,
  input: CreateDoctorInput,
  client: PrismaClient = defaultPrisma,
): Promise<CreatedDoctor> {
  const email = normalizeEmail(input.email);
  const fullName = input.fullName.trim();
  if (fullName.length < 3) throw badRequest("INVALID_NAME", "اسم الطبيب قصير جداً");

  const whatsappNumber = input.whatsappNumber ? normalizeIraqiPhone(input.whatsappNumber) : null;
  const phone = input.phone ? normalizeIraqiPhone(input.phone) : null;

  if (await client.user.findUnique({ where: { email }, select: { id: true } })) {
    throw conflict("EMAIL_TAKEN", "هذا الإيميل مستعمل لحساب آخر");
  }
  if (phone && (await client.user.findUnique({ where: { phone }, select: { id: true } }))) {
    throw conflict("PHONE_TAKEN", "رقم الهاتف مستعمل لحساب آخر");
  }

  const temporaryPassword = input.temporaryPassword?.trim() || generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const doctor = await client.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        phone,
        fullName,
        role: "DOCTOR",
        passwordHash,
        mustChangePassword: true,
        createdByUserId: ownerId,
      },
    });

    const created = await tx.doctor.create({
      data: {
        userId: user.id,
        title: input.title?.trim() || "د.",
        bio: input.bio ?? null,
        yearsOfExperience: input.yearsOfExperience ?? null,
        gender: input.gender ?? null,
        licenseNumber: input.licenseNumber ?? null,
        whatsappNumber,
        registeredByUserId: ownerId,
        specialties: input.specialtyIds?.length
          ? {
              create: input.specialtyIds.map((specialtyId, index) => ({
                specialtyId,
                isPrimary: index === 0,
              })),
            }
          : undefined,
      },
    });

    await writeAudit(tx, ownerId, "DOCTOR_CREATED", "Doctor", created.id, {
      email,
      fullName,
      whatsappNumber,
    });

    return { created, user };
  });

  return {
    doctorId: doctor.created.id,
    userId: doctor.user.id,
    fullName,
    email,
    temporaryPassword,
  };
}

/** يولّد باسووردًا جديداً ويبطل كل جلسات الطبيب القائمة. */
export async function resetDoctorPassword(
  ownerId: string,
  doctorId: string,
  client: PrismaClient = defaultPrisma,
): Promise<{ email: string; temporaryPassword: string }> {
  const doctor = await client.doctor.findUnique({
    where: { id: doctorId },
    select: { userId: true, user: { select: { email: true } } },
  });
  if (!doctor?.user.email) throw notFound("DOCTOR_NOT_FOUND", "الطبيب غير موجود");

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  await client.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: doctor.userId },
      data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
    });
    // تغيير الباسوورد يجب أن يقطع الجلسات القائمة، وإلا بقي الوصول القديم صالحاً
    await tx.refreshToken.updateMany({
      where: { userId: doctor.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeAudit(tx, ownerId, "DOCTOR_PASSWORD_RESET", "Doctor", doctorId, null);
  });

  return { email: doctor.user.email, temporaryPassword };
}

/** إيقاف طبيب أو إعادة تفعيله — يخفيه من البحث ويمنع دخوله. */
export async function setDoctorActive(
  ownerId: string,
  doctorId: string,
  isActive: boolean,
  client: PrismaClient = defaultPrisma,
): Promise<void> {
  const doctor = await client.doctor.findUnique({ where: { id: doctorId }, select: { userId: true } });
  if (!doctor) throw notFound("DOCTOR_NOT_FOUND", "الطبيب غير موجود");

  await client.$transaction(async (tx) => {
    await tx.doctor.update({ where: { id: doctorId }, data: { isActive, isPublished: isActive } });
    await tx.user.update({ where: { id: doctor.userId }, data: { isActive } });
    if (!isActive) {
      await tx.refreshToken.updateMany({
        where: { userId: doctor.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await writeAudit(tx, ownerId, isActive ? "DOCTOR_ENABLED" : "DOCTOR_DISABLED", "Doctor", doctorId, null);
  });
}

/** تحديث رقم واتساب الطبيب الذي تصله الحجوزات. */
export async function setDoctorWhatsApp(
  ownerId: string,
  doctorId: string,
  whatsappNumber: string | null,
  enabled: boolean,
  client: PrismaClient = defaultPrisma,
): Promise<{ whatsappNumber: string | null }> {
  const normalized = whatsappNumber ? normalizeIraqiPhone(whatsappNumber) : null;
  const doctor = await client.doctor.findUnique({ where: { id: doctorId }, select: { id: true } });
  if (!doctor) throw notFound("DOCTOR_NOT_FOUND", "الطبيب غير موجود");

  await client.$transaction(async (tx) => {
    await tx.doctor.update({
      where: { id: doctorId },
      data: { whatsappNumber: normalized, whatsappEnabled: enabled },
    });
    await writeAudit(tx, ownerId, "DOCTOR_WHATSAPP_UPDATED", "Doctor", doctorId, {
      whatsappNumber: normalized,
      enabled,
    });
  });

  return { whatsappNumber: normalized };
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  action: string,
  entity: string,
  entityId: string,
  after: Prisma.InputJsonValue | null,
) {
  await tx.auditLog.create({
    data: { actorUserId, action, entity, entityId, after: after ?? undefined },
  });
}
