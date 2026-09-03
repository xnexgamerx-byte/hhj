/**
 * تطبيع أرقام الهواتف العراقية إلى صيغة E.164 الموحّدة: ‎+9647XXXXXXXXX
 *
 * المستخدم يكتب رقمه بصيغ كثيرة، ومنها الأرقام العربية-الهندية (٠٧٧٠…) التي
 * يكتبها كثير من مستخدمي لوحات المفاتيح العربية. تخزين الصيغة الموحّدة وحدها
 * هو ما يمنع تكرار الحساب الواحد بأشكال مختلفة.
 */
import { badRequest } from "./errors.js";

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";

/** يحوّل ٠١٢٣ و۰۱۲۳ إلى 0123 */
export function toLatinDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (char) => {
    const arabic = ARABIC_INDIC.indexOf(char);
    if (arabic >= 0) return String(arabic);
    return String(EXTENDED_ARABIC_INDIC.indexOf(char));
  });
}

/**
 * يقبل: 07701234567 · 7701234567 · +9647701234567 · 009647701234567 · ٠٧٧٠١٢٣٤٥٦٧
 * ويرفض ما عداها. شبكات الجوال العراقية كلها تبدأ بـ 7 بعد رمز الدولة،
 * والرقم الوطني تسع خانات بعدها.
 */
export function normalizeIraqiPhone(raw: string): string {
  let digits = toLatinDigits(raw).replace(/[\s()\-.]/g, "");

  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("964")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);

  if (!/^7\d{9}$/.test(digits)) {
    throw badRequest("INVALID_PHONE", "رقم الهاتف غير صحيح. مثال: ٠٧٧٠١٢٣٤٥٦٧");
  }
  return `+964${digits}`;
}

/** صيغة واتساب: رقم بلا علامة + ولا فواصل — 9647701234567 */
export function toWhatsAppAddress(e164: string): string {
  return e164.replace(/^\+/, "");
}

/**
 * للعرض: ‎0770-123-4567
 *
 * يقبل الشكلين لأن كليهما يصلها فعلاً: حساب المستخدم يخزّن الدولي
 * ‎+9647701234567‎، وحقل الهاتف في نموذج الحجز يخزّن المحلّي ‎07701234567‎،
 * ورسالة الواتساب تأخذ الثاني إن وُجد وإلا الأول. وافتراضُ الدولي وحده كان
 * يضيف صفراً إلى رقمٍ يبدأ بصفر فيخرج «0077 326 50315» — رقمٌ لا يُتّصل به.
 *
 * والفواصل شرطات لا مسافات: الرقم يُكتب داخل رسالةٍ عربية، ومجموعات الأرقام
 * اللاتينية المفصولة بمسافات يعكس محرّك ثنائي الاتجاه ترتيبها فيقرأ الطبيب
 * «4567 123 0770». والشرطة بين رقمين تُضمّ إليهما فيصير الرقم كتلةً واحدة لا
 * تُعاد ترتيبها — بلا حاجة إلى محارف تحكّمٍ قد لا تنجو من وسيط الرسائل.
 */
export function formatIraqiPhoneForDisplay(phone: string): string {
  const digits = toLatinDigits(phone).replace(/\D/g, "");
  const national = digits.startsWith("964")
    ? `0${digits.slice(3)}`
    : digits.startsWith("0")
      ? digits
      : `0${digits}`;

  // ما ليس أحد عشر رقماً ليس رقماً عراقياً — يُعرض كما هو بدل أن يُقصّ خطأً
  if (national.length !== 11) return national;
  return `${national.slice(0, 4)}-${national.slice(4, 7)}-${national.slice(7)}`;
}
