/** خطأ يحمل رسالة عربية صالحة للعرض على المستخدم ورمز حالة HTTP. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const unauthorized = (code: string, message: string) => new AppError(401, code, message);
export const forbidden = (code: string, message: string) => new AppError(403, code, message);
export const notFound = (code: string, message: string) => new AppError(404, code, message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const tooMany = (code: string, message: string) => new AppError(429, code, message);

/**
 * يقرأ حقلاً نصّياً من جسم الطلب.
 *
 * أجسام الطلبات لا تُتحقّق من شكلها في هذا الخادم — أنواع TypeScript تصف ما
 * ينبغي أن يصل، لا ما يصل فعلاً. فجسمٌ ناقصٌ أو بحقلٍ من نوعٍ آخر يمضي حتى
 * يصطدم بأوّل ‎.trim()‎ فيرمي TypeError، ويُبلَّغ عنه بـ٥٠٠: خطأُ خادمٍ على
 * خطأ طالب. و٥٠٠ يدعو العميل إلى إعادة المحاولة على ما لن ينجح أبداً،
 * ويغرق سجلّ الأخطاء بضجيجٍ يخفي الأعطال الحقيقية.
 *
 * تُستعمل على المسارات المفتوحة بلا رمز — هي المكشوفة لمن يصوغ الطلبات بيده.
 */
export function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw badRequest("INVALID_INPUT", `الحقل «${field}» مطلوب`);
  }
  return value;
}

/** مثلها، لكن يقبل الغياب ويعيد undefined */
export function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requireText(value, field);
}
