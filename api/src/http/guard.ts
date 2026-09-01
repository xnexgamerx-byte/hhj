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

/** يحوّل أخطاء التطبيق إلى ردود عربية مفهومة، ويخفي تفاصيل الأخطاء غير المتوقعة. */
export function errorHandler(error: Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  }
  // تجاوز حدّ المعدّل يصل إلى هنا كخطأ عاديّ بحالة ٤٢٩، فبلا هذا الفرع يُبلَّغ
  // العميل بـ٥٠٠ فيظنّه عطلاً في الخادم ويعيد المحاولة فوراً — وهو آخر ما يُراد
  if ((error as { statusCode?: number }).statusCode === 429) {
    return reply.status(429).send({
      error: "RATE_LIMITED",
      message: "طلبات كثيرة في وقت قصير. انتظر قليلاً ثم أعد المحاولة.",
    });
  }
  if ((error as { validation?: unknown }).validation) {
    return reply.status(400).send({ error: "INVALID_INPUT", message: "البيانات المرسلة غير مكتملة أو غير صحيحة" });
  }
  request.log.error(error);
  return reply.status(500).send({ error: "INTERNAL", message: "حدث خطأ غير متوقع. حاول مرة أخرى" });
}
