/**
 * رسائل الواتساب المرسلة للطبيب.
 *
 * كل رسالة تُنتج شيئين معاً:
 *   params  — الوسائط بالترتيب، لقالب معتمد لدى ميتا (Cloud API)
 *   body    — النص المقروء كاملاً، للسجل ولرابط wa.me الاحتياطي
 *
 * السبب: واتساب لا يسمح بإرسال نص حر لمن لم يراسلك خلال آخر ٢٤ ساعة، والطبيب
 * لن يراسل المنصة أصلاً. لذلك كل رسالة تبدأ بها المنصة يجب أن تكون قالباً
 * معتمداً مسبقاً من ميتا، ووسائطه تُملأ عند الإرسال.
 */
import { formatIraqiPhoneForDisplay } from "../../lib/phone.js";

export type WhatsAppMessage = {
  templateName: string;
  languageCode: string;
  params: string[];
  body: string;
};

/**
 * واتساب يرفض الوسائط التي تحوي سطراً جديداً أو تبويباً أو أربع مسافات متتالية.
 * تنظيفها هنا يمنع فشل إرسال بسبب اسم مريض كُتب بمسافات زائدة.
 */
function sanitizeParam(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s{4,}/g, "   ").trim();
}

const dateFormatter = new Intl.DateTimeFormat("ar-IQ", {
  timeZone: "Asia/Baghdad",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("ar-IQ", {
  timeZone: "Asia/Baghdad",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** أرقام عربية-هندية للعرض: 12 ⇦ ١٢ */
function toArabicDigits(value: number): string {
  return String(value).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

export type BookingSummary = {
  reference: string;
  patientName: string;
  /** رقم المريض بصيغة E.164 */
  patientPhone: string;
  clinicName: string;
  bookingMode: "SLOT" | "QUEUE";
  slotStart: Date;
  sessionStart: Date;
  sessionEnd: Date;
  queueNumber: number;
  patientNote?: string | null;
};

/** «الأحد، ٣٠ آب ٢٠٢٦ — ٤:٢٠ م» أو «… — الدور ١٢ بين ٤:٠٠ م و٧:٠٠ م» */
export function describeAppointmentTime(booking: BookingSummary): string {
  const day = dateFormatter.format(booking.slotStart);
  if (booking.bookingMode === "SLOT") {
    return `${day} — ${timeFormatter.format(booking.slotStart)}`;
  }
  const from = timeFormatter.format(booking.sessionStart);
  const to = timeFormatter.format(booking.sessionEnd);
  return `${day} — الدور ${toArabicDigits(booking.queueNumber)} بين ${from} و${to}`;
}

/**
 * حجز جديد. اسم القالب لدى ميتا: new_booking
 * وسائطه بالترتيب: اسم المريض · هاتفه · الموعد · العيادة · الرقم المرجعي
 */
export function newBookingMessage(booking: BookingSummary): WhatsAppMessage {
  const when = describeAppointmentTime(booking);
  // الهاتف بأرقام لاتينية ليبقى قابلاً للنقر والاتصال داخل واتساب
  const phone = formatIraqiPhoneForDisplay(booking.patientPhone);

  const params = [booking.patientName, phone, when, booking.clinicName, booking.reference].map(
    sanitizeParam,
  );

  const lines = [
    "🗓 حجز جديد",
    "",
    `المريض: ${params[0]}`,
    `الهاتف: ${params[1]}`,
    `الموعد: ${params[2]}`,
    `العيادة: ${params[3]}`,
    `الرقم المرجعي: ${params[4]}`,
  ];
  if (booking.patientNote) lines.push("", `ملاحظة المريض: ${sanitizeParam(booking.patientNote)}`);

  return { templateName: "new_booking", languageCode: "ar", params, body: lines.join("\n") };
}

/** إلغاء حجز. اسم القالب لدى ميتا: booking_cancelled */
export function bookingCancelledMessage(
  booking: BookingSummary,
  cancelledBy: "PATIENT" | "CLINIC",
): WhatsAppMessage {
  const params = [
    booking.patientName,
    describeAppointmentTime(booking),
    booking.reference,
    cancelledBy === "PATIENT" ? "المريض" : "العيادة",
  ].map(sanitizeParam);

  const body = [
    "❌ إلغاء حجز",
    "",
    `المريض: ${params[0]}`,
    `الموعد: ${params[1]}`,
    `الرقم المرجعي: ${params[2]}`,
    `أُلغي بواسطة: ${params[3]}`,
  ].join("\n");

  return { templateName: "booking_cancelled", languageCode: "ar", params, body };
}
