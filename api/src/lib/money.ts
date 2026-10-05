/**
 * المبالغ بالدينار العراقي: أعدادٌ صحيحة بلا كسور — الفلس خرج من التداول،
 * والكسر في أجرة كشفٍ خطأٌ مطبعيّ لا سعر.
 */
import { badRequest } from "./errors.js";

/**
 * سقفٌ يرفض المبلغ العبثيّ برسالة، بدل أن يتجاوز سعة العمود فيسقط الطلب
 * بخطأ خادم. ولا كشفية في العراق تقارب مليون دينار.
 */
export const AMOUNT_MAX = 1_000_000;

export function checkAmount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > AMOUNT_MAX) {
    throw badRequest("INVALID_AMOUNT", `${label}: رقمٌ صحيح بالدينار بين 0 و${AMOUNT_MAX.toLocaleString("en-US")}`);
  }
  return value;
}
