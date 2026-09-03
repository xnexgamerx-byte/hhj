/**
 * مساران للدخول:
 *   المريض  → رقم هاتف فقط، بلا رمز تحقق ولا باسوورد
 *   الطبيب والسكرتير والمالك → إيميل + باسوورد أنشأهما المالك
 */
import type { PrismaClient, UserRole } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/prisma.js";
import { hashPassword, validatePasswordStrength, verifyPassword } from "../../lib/password.js";
import { normalizeIraqiPhone } from "../../lib/phone.js";
import { createRefreshToken, hashRefreshToken, signAccessToken } from "../../lib/tokens.js";
import { badRequest, forbidden, unauthorized } from "../../lib/errors.js";

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

// ── دخول المريض برقم الهاتف ───────────────────────────────────────

/**
 * دخولٌ فوريّ بلا تحقق: يكفي الرقم ليُنشأ الحساب أو يُستأنف. القيد الوحيد
 * هو حدّ الطلبات على المسار نفسه (انظر `gate` في routes.ts) — لا حدّ رسائل
 * لأنه لا رسالة تُرسل أصلاً.
 */
export async function loginByPhone(
  rawPhone: string,
  fullName: string | undefined,
  client: PrismaClient = defaultPrisma,
): Promise<Session> {
  const phone = normalizeIraqiPhone(rawPhone);

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
