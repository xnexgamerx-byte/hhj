/**
 * تسجيل الأطباء — لا يوجد تسجيل ذاتي.
 *
 * المالك وحده ينشئ حساب كل طبيب: رقم هاتفه وباسوورد أوليّ. الرقم لا الإيميل
 * لأنّ طبيب العيادة في العراق يحمل هاتفه ولا يفتح بريده — وحسابٌ مفتاحه شيء
 * لا يستعمله صاحبه حسابٌ لا يُدخل إليه.
 * الباسوورد النصي يظهر **مرة واحدة فقط** في ردّ هذه الدالة ليسلّمه المالك للطبيب،
 * ولا يُخزَّن ولا يُكتب في أي سجل. بعدها يُلزَم الطبيب بتغييره أول دخول.
 */
import { Prisma, type Gender, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/prisma.js";
import { generateTemporaryPassword, hashPassword } from "../../lib/password.js";
import { normalizeIraqiPhone } from "../../lib/phone.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { checkAmount } from "../../lib/money.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** صفحة الطبيب على الهاتف تعرض النبذة كاملةً، ونصٌّ طويل يُلصق بالخطأ يدفع مواعيده إلى الأسفل */
const BIO_MAX = 600;
const EXPERIENCE_MAX = 60;

/**
 * يقع هذا حين يكون الطبيب قد استعمل التطبيق مريضاً برقمه نفسه — ولا
 * نحوّل حسابه بأثرٍ رجعيّ: مواعيده كمريض تبقى له، والرسالة تقول للمالك
 * ما يفعل بدل أن تتركه أمام خطأٍ مبهم
 */
const phoneTaken = () =>
  conflict(
    "PHONE_TAKEN",
    "هذا الرقم مسجَّل بحسابٍ آخر في التطبيق. استعمل رقماً آخر للطبيب، أو احذف الحساب القديم أولاً",
  );

function cleanBio(raw: string | null | undefined): string | null {
  const bio = raw?.trim() || null;
  if (bio && bio.length > BIO_MAX) {
    throw badRequest("BIO_TOO_LONG", `النبذة أطول من ${BIO_MAX} حرف — اختصرها`);
  }
  return bio;
}

function checkExperience(years: number | null | undefined) {
  if (years === undefined || years === null) return;
  if (!Number.isInteger(years) || years < 0 || years > EXPERIENCE_MAX) {
    throw badRequest("INVALID_EXPERIENCE", `سنوات الخبرة رقمٌ بين 0 و${EXPERIENCE_MAX}`);
  }
}

export type CreateDoctorInput = {
  fullName: string;
  /** رقمه الذي يدخل به — وهو هويّة الحساب بدل الإيميل */
  phone: string;
  /**
   * رقم واتساب الطبيب الذي تصله تفاصيل الحجوزات. يُترك فارغاً في الغالب
   * فيصير رقم دخوله نفسه: هو رقمه الذي يحمله، وسؤاله مرّتين عن رقمٍ واحد
   * يدعو إلى الخطأ في أحدهما.
   */
  whatsappNumber?: string | null;
  /** اختياريّ تماماً — يبقى للمالك ولمن يريده، ولا يُطلب من الطبيب */
  email?: string | null;
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
  /** ما يدخل به: رقم هاتفه */
  phone: string;
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
  const fullName = input.fullName.trim();
  if (fullName.length < 3) throw badRequest("INVALID_NAME", "اسم الطبيب قصير جداً");

  const phone = normalizeIraqiPhone(input.phone);
  // بلا رقم واتساب منفصل: رقم دخوله هو رقمه
  const whatsappNumber = input.whatsappNumber ? normalizeIraqiPhone(input.whatsappNumber) : phone;
  const email = input.email?.trim() ? normalizeEmail(input.email) : null;
  const bio = cleanBio(input.bio);
  checkExperience(input.yearsOfExperience);

  if (await client.user.findUnique({ where: { phone }, select: { id: true } })) throw phoneTaken();
  if (email && (await client.user.findUnique({ where: { email }, select: { id: true } }))) {
    throw conflict("EMAIL_TAKEN", "هذا الإيميل مستعمل لحساب آخر");
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
        bio,
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
      phone,
      fullName,
      whatsappNumber,
    });

    return { created, user };
  });

  return {
    doctorId: doctor.created.id,
    userId: doctor.user.id,
    fullName,
    phone,
    temporaryPassword,
  };
}

export type UpdateDoctorInput = {
  title?: string;
  fullName?: string;
  /**
   * رقم الدخول. تغييره لا يمسّ الباسوورد ولا يقطع جلسات الطبيب: الرقم ما
   * يُعرَّف به، والباسوورد سرّه — وتغيير الأول لا يعني أنّ الثاني تسرّب.
   */
  phone?: string;
  /** فارغٌ يعني رقم هاتفه نفسه — القاعدة نفسها التي في التسجيل */
  whatsappNumber?: string | null;
  whatsappEnabled?: boolean;
  specialtyIds?: number[];
  yearsOfExperience?: number | null;
  /** تظهر للمرضى في صفحة الطبيب */
  bio?: string | null;
};

/**
 * تعديل بيانات الطبيب بعد تسجيله: ما يراه المرضى، ورقم دخوله، وواتساب حجوزاته.
 *
 * الحقل الغائب لا يُمسّ — كتعديل بيانات المريض — فطلبٌ يغيّر الاسم وحده لا
 * يمحو التخصص ولا النبذة. والتخصصات إن أُرسلت تُستبدل كلّها، والأول رئيسيّها.
 */
export async function updateDoctorProfile(
  ownerId: string,
  doctorId: string,
  input: UpdateDoctorInput,
  client: PrismaClient = defaultPrisma,
): Promise<{ doctorId: string; fullName: string; phone: string | null; whatsappNumber: string | null }> {
  const doctor = await client.doctor.findUnique({
    where: { id: doctorId },
    select: { userId: true, user: { select: { phone: true } } },
  });
  if (!doctor) throw notFound("DOCTOR_NOT_FOUND", "الطبيب غير موجود");

  const fullName = input.fullName?.trim();
  if (fullName !== undefined && fullName.length < 3) throw badRequest("INVALID_NAME", "اسم الطبيب قصير جداً");

  const phone = input.phone === undefined ? undefined : normalizeIraqiPhone(input.phone);
  if (
    phone !== undefined &&
    phone !== doctor.user.phone &&
    (await client.user.findUnique({ where: { phone }, select: { id: true } }))
  ) {
    throw phoneTaken();
  }

  // الرقم الجديد إن تغيّر: واتسابٌ يتبع الهاتف ينتقل معه ولا يبقى على رقمٍ تركه الطبيب
  const whatsappNumber =
    input.whatsappNumber === undefined
      ? undefined
      : input.whatsappNumber?.trim()
        ? normalizeIraqiPhone(input.whatsappNumber)
        : (phone ?? doctor.user.phone);

  const bio = input.bio === undefined ? undefined : cleanBio(input.bio);
  checkExperience(input.yearsOfExperience);

  const specialtyIds = input.specialtyIds === undefined ? undefined : [...new Set(input.specialtyIds)];
  if (specialtyIds?.length) {
    const known = await client.specialty.count({ where: { id: { in: specialtyIds } } });
    if (known !== specialtyIds.length) throw badRequest("INVALID_SPECIALTY", "تخصص غير معروف");
  }

  const changes = {
    title: input.title === undefined ? undefined : input.title?.trim() || "د.",
    bio,
    yearsOfExperience: input.yearsOfExperience,
    whatsappNumber,
    whatsappEnabled: input.whatsappEnabled,
  };

  try {
    return await client.$transaction(async (tx) => {
      if (fullName !== undefined || phone !== undefined) {
        await tx.user.update({ where: { id: doctor.userId }, data: { fullName, phone } });
      }
      if (specialtyIds !== undefined) {
        await tx.doctorSpecialty.deleteMany({ where: { doctorId } });
        await tx.doctorSpecialty.createMany({
          data: specialtyIds.map((specialtyId, index) => ({ doctorId, specialtyId, isPrimary: index === 0 })),
        });
      }
      const updated = await tx.doctor.update({
        where: { id: doctorId },
        data: changes,
        select: { whatsappNumber: true, user: { select: { fullName: true, phone: true } } },
      });

      const after = Object.fromEntries(
        Object.entries({ ...changes, fullName, phone, specialtyIds }).filter(([, value]) => value !== undefined),
      );
      await writeAudit(tx, ownerId, "DOCTOR_UPDATED", "Doctor", doctorId, after);

      return { doctorId, ...updated.user, whatsappNumber: updated.whatsappNumber };
    });
  } catch (error) {
    // الفحص أعلاه يسبق الكتابة، فحسابٌ يُنشأ بالرقم نفسه بينهما يصطدم بالقيد هنا
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      String(error.meta?.target ?? "").includes("phone")
    ) {
      throw phoneTaken();
    }
    throw error;
  }
}

/** يولّد باسووردًا جديداً ويبطل كل جلسات الطبيب القائمة. */
export async function resetDoctorPassword(
  ownerId: string,
  doctorId: string,
  client: PrismaClient = defaultPrisma,
): Promise<{ phone: string; temporaryPassword: string }> {
  const doctor = await client.doctor.findUnique({
    where: { id: doctorId },
    select: { userId: true, user: { select: { phone: true } } },
  });
  if (!doctor?.user.phone) throw notFound("DOCTOR_NOT_FOUND", "الطبيب غير موجود");

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

  return { phone: doctor.user.phone, temporaryPassword };
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

/**
 * الكشفية وعمولة المنصة عليها — يضعهما المالك عند إعداد العيادة، ويعدّلهما هنا
 * حين يرفع الطبيب أجرته أو يتغيّر الاتفاق مع العيادة.
 *
 * العمولة تُقرأ لحظة تأشير الحضور وتُحفظ مع الزيارة، فالجديدة تسري على من يحضر
 * بعد الحفظ، وما سُجّل قبله يبقى بمبلغه: العيادة لا تُطالَب بأثرٍ رجعيّ.
 */
export async function updatePracticePricing(
  ownerId: string,
  practiceId: string,
  input: { feeAmount?: number; commissionAmount?: number },
  client: PrismaClient = defaultPrisma,
): Promise<{ id: string; feeAmount: number; commissionAmount: number }> {
  const practice = await client.doctorClinic.findUnique({
    where: { id: practiceId },
    select: { feeAmount: true, commissionAmount: true },
  });
  if (!practice) throw notFound("PRACTICE_NOT_FOUND", "العيادة غير موجودة");

  const changes = {
    feeAmount: input.feeAmount === undefined ? undefined : checkAmount(input.feeAmount, "أجرة الكشف"),
    commissionAmount:
      input.commissionAmount === undefined ? undefined : checkAmount(input.commissionAmount, "العمولة"),
  };

  return client.$transaction(async (tx) => {
    const updated = await tx.doctorClinic.update({
      where: { id: practiceId },
      data: changes,
      select: { id: true, feeAmount: true, commissionAmount: true },
    });
    // القيمتان قبل وبعد: حين تعترض عيادةٌ على مبلغٍ طولبت به يُعرف متى تغيّر ومن غيّره
    await writeAudit(
      tx,
      ownerId,
      "PRACTICE_PRICING_UPDATED",
      "DoctorClinic",
      practiceId,
      { feeAmount: updated.feeAmount, commissionAmount: updated.commissionAmount },
      practice,
    );
    return updated;
  });
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  action: string,
  entity: string,
  entityId: string,
  after: Prisma.InputJsonValue | null,
  before?: Prisma.InputJsonValue,
) {
  await tx.auditLog.create({
    data: { actorUserId, action, entity, entityId, before, after: after ?? undefined },
  });
}
