/**
 * مساران للدخول:
 *   المريض  → رقم هاتف + رمز تحقق، بلا باسوورد
 *   الطبيب والسكرتير والمالك → إيميل + باسوورد أنشأهما المالك
 */
import { createHash, randomInt } from "node:crypto";
import type { PrismaClient, UserRole } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/prisma.js";
import { hashPassword, validatePasswordStrength, verifyPassword } from "../../lib/password.js";
import { normalizeIraqiPhone } from "../../lib/phone.js";
import { createRefreshToken, hashRefreshToken, signAccessToken } from "../../lib/tokens.js";
import { badRequest, forbidden, unauthorized, tooMany } from "../../lib/errors.js";

const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
// خمسة رموز في الساعة تكفي من نسي أو تأخّرت رسالته، ولا تكفي من يقصف رقماً
const OTP_MAX_PER_HOUR = 5;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCK_MINUTES = 15;

export type Session = {
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
  /** الهاتف للمريض وحده — تملأ به شاشة الحجز حقلها فلا يكتبه مرّتين */
  user: { id: string; fullName: string; role: UserRole; phone: string | null };
};

async function issueSession(
  userId: string,
  fullName: string,
  role: UserRole,
  phone: string | null,
  mustChangePassword: boolean,
  client: PrismaClient,
): Promise<Session> {
  const refresh = createRefreshToken();
  await client.refreshToken.create({
    data: { userId, tokenHash: refresh.tokenHash, expiresAt: refresh.expiresAt },
  });
  const accessToken = await signAccessToken({ sub: userId, role, mustChangePassword });
  return {
    accessToken,
    refreshToken: refresh.token,
    mustChangePassword,
    user: { id: userId, fullName, role, phone },
  };
}

// ── دخول الطبيب والسكرتير والمالك ────────────────────────────────

export async function loginWithPassword(
  rawEmail: string,
  password: string,
  client: PrismaClient = defaultPrisma,
): Promise<Session> {
  const email = rawEmail.trim().toLowerCase();
  const user = await client.user.findUnique({ where: { email } });

  // رسالة واحدة للإيميل الخاطئ وللباسوورد الخاطئ، حتى لا يُستدل على الحسابات الموجودة
  const invalid = unauthorized("INVALID_CREDENTIALS", "الإيميل أو الباسوورد غير صحيح");
  if (!user || !user.passwordHash) throw invalid;

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw forbidden("ACCOUNT_LOCKED", "الحساب مقفل مؤقتاً بسبب محاولات دخول فاشلة. حاول بعد قليل");
  }
  if (!user.isActive) throw forbidden("ACCOUNT_DISABLED", "هذا الحساب موقوف. راجع إدارة المنصة");

  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLoginCount + 1;
    await client.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil:
          failed >= LOGIN_MAX_FAILURES ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60_000) : null,
      },
    });
    throw invalid;
  }

  await client.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  return issueSession(user.id, user.fullName, user.role, user.phone, user.mustChangePassword, client);
}

/** تغيير الباسوورد — إلزامي بعد أول دخول بباسوورد أنشأه المالك. */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  client: PrismaClient = defaultPrisma,
): Promise<void> {
  const user = await client.user.findUnique({ where: { id: userId } });
  if (!user?.passwordHash) throw unauthorized("INVALID_CREDENTIALS", "حساب غير صالح");
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw unauthorized("INVALID_CREDENTIALS", "الباسوورد الحالي غير صحيح");
  }

  const weakness = validatePasswordStrength(newPassword);
  if (weakness) throw badRequest("WEAK_PASSWORD", weakness);
  if (await verifyPassword(newPassword, user.passwordHash)) {
    throw badRequest("SAME_PASSWORD", "الباسوورد الجديد مطابق للحالي");
  }

  await client.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
    });
    // بعد تغيير الباسوورد تُقطع الجلسات الأخرى — لو كان الباسوورد الأولي قد تسرّب
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
}

// ── دخول المريض برمز تحقق ────────────────────────────────────────

/** يُرجع الرمز نصاً في بيئة التطوير فقط؛ في الإنتاج يُرسل بالرسائل النصية. */
export async function requestOtp(
  rawPhone: string,
  client: PrismaClient = defaultPrisma,
): Promise<{ phone: string; expiresAt: Date; devCode?: string }> {
  const phone = normalizeIraqiPhone(rawPhone);

  // الحدّ هنا على الرقم لا على عنوان الشبكة، ومن جهتين:
  //
  // الأولى أنّ كل طلب يرسل رسالة لها ثمن، وبلا حدٍّ يستطيع أيّ أحد أن يغرق
  // هاتف غيره برسائل ويستنزف الرصيد معاً.
  //
  // والثانية أنّ الحدّ على العنوان وحده لا يصلح هنا: شبكات الهاتف في العراق
  // تُخرج آلاف المشتركين من عناوين عامة قليلة، فحدٌّ ضيّق على العنوان يحجب
  // شبكة بأكملها عن الدخول.
  const now = new Date();
  const [sinceMinute, sinceHour] = await Promise.all([
    client.otpCode.count({ where: { phone, createdAt: { gt: new Date(now.getTime() - 60_000) } } }),
    client.otpCode.count({ where: { phone, createdAt: { gt: new Date(now.getTime() - 3_600_000) } } }),
  ]);
  if (sinceMinute > 0) {
    throw tooMany("OTP_COOLDOWN", "أرسلنا رمزاً للتو. انتظر دقيقة قبل طلب رمز جديد.");
  }
  if (sinceHour >= OTP_MAX_PER_HOUR) {
    throw tooMany("OTP_LIMIT", "طلبت رموزاً كثيرة لهذا الرقم. حاول بعد ساعة.");
  }

  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60_000);

  await client.otpCode.create({
    data: { phone, codeHash: createHash("sha256").update(code).digest("hex"), expiresAt },
  });

  return {
    phone,
    expiresAt,
    devCode: process.env.NODE_ENV === "production" ? undefined : code,
  };
}

export async function verifyOtp(
  rawPhone: string,
  code: string,
  fullName: string | undefined,
  client: PrismaClient = defaultPrisma,
): Promise<Session> {
  const phone = normalizeIraqiPhone(rawPhone);
  const codeHash = createHash("sha256").update(code.trim()).digest("hex");

  const record = await client.otpCode.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!record) throw unauthorized("OTP_EXPIRED", "الرمز منتهي أو غير موجود. اطلب رمزاً جديداً");
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    throw forbidden("OTP_ATTEMPTS_EXCEEDED", "تجاوزت عدد المحاولات. اطلب رمزاً جديداً");
  }
  if (record.codeHash !== codeHash) {
    await client.otpCode.update({ where: { id: record.id }, data: { attempts: record.attempts + 1 } });
    throw unauthorized("OTP_INVALID", "الرمز غير صحيح");
  }

  await client.otpCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });

  let user = await client.user.findUnique({ where: { phone } });
  if (!user) {
    // أول دخول ينشئ الحساب ومعه سجل المريض لصاحب الحساب نفسه
    const name = fullName?.trim() || "مستخدم جديد";
    user = await client.user.create({
      data: {
        phone,
        fullName: name,
        role: "PATIENT",
        patients: { create: { fullName: name, isSelf: true } },
      },
    });
  } else {
    if (!user.isActive) throw forbidden("ACCOUNT_DISABLED", "هذا الحساب موقوف");
    await client.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  }

  return issueSession(user.id, user.fullName, user.role, user.phone, false, client);
}

// ── تجديد الجلسة والخروج ─────────────────────────────────────────

export async function refreshSession(
  refreshToken: string,
  client: PrismaClient = defaultPrisma,
): Promise<Session> {
  const tokenHash = hashRefreshToken(refreshToken);
  const stored = await client.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw unauthorized("INVALID_REFRESH_TOKEN", "الجلسة منتهية، سجّل الدخول من جديد");
  }
  if (!stored.user.isActive) throw forbidden("ACCOUNT_DISABLED", "هذا الحساب موقوف");

  // تدوير الرمز: القديم يُبطل فور استعماله
  await client.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

  return issueSession(
    stored.user.id,
    stored.user.fullName,
    stored.user.role,
    stored.user.phone,
    stored.user.mustChangePassword,
    client,
  );
}

export async function logout(refreshToken: string, client: PrismaClient = defaultPrisma): Promise<void> {
  await client.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
