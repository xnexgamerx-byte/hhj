import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@prisma/client";
import { verifyAccessToken, type AccessTokenClaims } from "../lib/tokens.js";
import { AppError, forbidden, unauthorized } from "../lib/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    auth?: AccessTokenClaims;
  }
}

/** يتحقق من الرمز ويعلّق هوية المستخدم على الطلب. */
export async function authenticate(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw unauthorized("NO_TOKEN", "سجّل الدخول أولاً");
  }
  request.auth = await verifyAccessToken(header.slice(7));
}

/**
 * يحصر الوصول بأدوار معيّنة، ويمنع الطبيب من استعمال المنصة قبل تغيير
 * الباسوورد الأولي الذي أنشأه له المالك — وإلا بقي باسوورد يعرفه شخصان.
 */
export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest) => {
    await authenticate(request);
    const auth = request.auth!;
    if (auth.mustChangePassword) {
      throw forbidden("PASSWORD_CHANGE_REQUIRED", "غيّر الباسوورد الأولي قبل المتابعة");
    }
    if (!roles.includes(auth.role)) {
      throw forbidden("FORBIDDEN", "ليس لديك صلاحية لهذا الإجراء");
    }
  };
}

/**
 * كـrequireRole، ويشترط فوقها جلسةً من جهازٍ يعرفه الحساب.
 *
 * جلسة المريض تُفتح برقم هاتفه وحده — والرقم يعرفه أهله وزملاؤه ومن رآه
 * مرّة. فالحجز يُترك مفتوحاً (غايتُه أن يصل الموعد للعيادة)، أمّا قراءة
 * المواعيد والعنوان وأفراد العائلة، وإلغاء موعدٍ قائم، فتُشترط لها معرفةُ
 * الجهاز: هاتفٌ حجز منه صاحب الحساب قبلاً.
 */
export function requireTrusted(...roles: UserRole[]) {
  const role = requireRole(...roles);
  return async (request: FastifyRequest) => {
    await role(request);
    if (!request.auth!.trusted) {
      throw forbidden(
        "DEVICE_NOT_TRUSTED",
        "لعرض بياناتك افتح التطبيق من الهاتف الذي حجزت منه. تستطيع الحجز من هنا عادةً.",
      );
    }
  };
}

/**
 * أخطاء Fastify التي تقع قبل أن يبلغ الطلبُ مسارَه، برسائل عربية.
 *
 * الرسالة تقول ما يُفعل: «اضغطها أو اختر أصغر» لا «تجاوز الحدّ» — من يرفع
 * صورةً كبيرة يحتاج مخرجاً لا توصيفاً.
 */
const FASTIFY_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  FST_REQ_FILE_TOO_LARGE: {
    status: 413,
    code: "FILE_TOO_LARGE",
    message: "الصورة أكبر من ٤ ميغابايت. اضغطها أو اختر أصغر",
  },
  FST_ERR_CTP_BODY_TOO_LARGE: {
    status: 413,
    code: "BODY_TOO_LARGE",
    message: "البيانات المرسلة أكبر من المسموح",
  },
  FST_ERR_CTP_INVALID_JSON_BODY: {
    status: 400,
    code: "INVALID_INPUT",
    message: "البيانات المرسلة غير مكتملة أو غير صحيحة",
  },
  FST_ERR_CTP_EMPTY_JSON_BODY: {
    status: 400,
    code: "INVALID_INPUT",
    message: "البيانات المرسلة غير مكتملة أو غير صحيحة",
  },
  FST_ERR_CTP_INVALID_MEDIA_TYPE: {
    status: 415,
    code: "UNSUPPORTED_MEDIA_TYPE",
    message: "نوع المحتوى غير مدعوم",
  },
};

/** يحوّل أخطاء التطبيق إلى ردود عربية مفهومة، ويخفي تفاصيل الأخطاء غير المتوقعة. */
export function errorHandler(error: Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  }
  const status = (error as { statusCode?: number }).statusCode;

  // خدمة الملفات الثابتة ترمي ForbiddenError على محاولات الخروج من المجلّد
  // (‎%2e%2e%2f). المحاولة محجوبة أصلاً، لكن ٤٠٣ يؤكّد لمن يجرّب أنّ هناك ما
  // يُحمى — والجواب الصحيح لمسارٍ لا وجود له هو ٤٠٤
  if (request.url.startsWith("/uploads/") && (status === 403 || status === 404)) {
    return reply.status(404).send({ error: "NOT_FOUND", message: "الملف غير موجود" });
  }

  if (status === 429) {
    return reply.status(429).send({
      error: "RATE_LIMITED",
      message: "طلبات كثيرة في وقت قصير. انتظر قليلاً ثم أعد المحاولة.",
    });
  }

  const known = FASTIFY_ERRORS[(error as { code?: string }).code ?? ""];
  if (known) return reply.status(known.status).send({ error: known.code, message: known.message });

  if ((error as { validation?: unknown }).validation) {
    return reply.status(400).send({ error: "INVALID_INPUT", message: "البيانات المرسلة غير مكتملة أو غير صحيحة" });
  }

  // أي خطأ ٤xx آخر وضعه Fastify قبل أن يبلغ الطلبُ مسارَه: خطأُ الطالب لا
  // الخادم. و٥٠٠ عليه يدعوه إلى إعادة المحاولة على ما لن ينجح أبداً، ويُدخل
  // في سجلّ الأخطاء ضجيجاً يخفي الأعطال الحقيقية.
  if (typeof status === "number" && status >= 400 && status < 500) {
    return reply.status(status).send({ error: "BAD_REQUEST", message: "الطلب غير صالح" });
  }

  request.log.error(error);
  return reply.status(500).send({ error: "INTERNAL", message: "حدث خطأ غير متوقع. حاول مرة أخرى" });
}
