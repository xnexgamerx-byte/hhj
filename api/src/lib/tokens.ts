/**
 * رموز الدخول. رمز وصول قصير العمر يحمل الدور، ورمز تجديد طويل العمر
 * لتطبيق الجوال حتى لا يعيد المستخدم تسجيل الدخول كل ساعة.
 * رمز التجديد يُخزَّن مجزّأً في قاعدة البيانات ليمكن إبطاله.
 */
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@prisma/client";
import { unauthorized } from "./errors.js";

const ACCESS_TOKEN_TTL = "2h";
const REFRESH_TOKEN_DAYS = 60;

function secret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error("JWT_SECRET مفقود أو أقصر من ٣٢ خانة — لا يمكن تشغيل الخادم بدونه");
  }
  return new TextEncoder().encode(value);
}

export type AccessTokenClaims = {
  sub: string;
  role: UserRole;
  mustChangePassword: boolean;
  /**
   * هل تفتح هذه الجلسة بيانات صاحبها؟
   *
   * جلسة المريض تُبنى على رقم هاتفه وحده، والرقم يعرفه غيره — فجلسةٌ من
   * جهازٍ لم يحجز منه قبلاً تحجز ولا تقرأ. ومن يدخل بباسوورد (طبيب أو
   * سكرتير أو مالك) موثوقٌ دائماً: الباسوورد سرٌّ لا يُعرف بالصدفة.
   *
   * وغيابُها في رمزٍ قديم يعني «غير موثوق» — الافتراض الآمن عند الترقية.
   */
  trusted: boolean;
};

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({
    role: claims.role,
    mustChangePassword: claims.mustChangePassword,
    trusted: claims.trusted,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(secret());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      sub: payload.sub as string,
      role: payload.role as UserRole,
      mustChangePassword: Boolean(payload.mustChangePassword),
      trusted: Boolean(payload.trusted),
    };
  } catch {
    throw unauthorized("INVALID_TOKEN", "الجلسة منتهية أو غير صالحة، سجّل الدخول من جديد");
  }
}

/** بصمة الجهاز تُخزَّن مجزّأة لا خاماً — كرمز التجديد. */
export function hashDeviceId(deviceId: string): string {
  return createHash("sha256").update(deviceId.trim()).digest("hex");
}

export function createRefreshToken() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
  };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
