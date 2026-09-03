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
  /** العمر بالسنين — يُشتقّ من سنة الميلاد كي لا يشيخ الرقم في القاعدة */
  patientAge: number | null;
  patientAddress: string | null;
  /** رقم المريض ذلك اليوم في تلك العيادة — به يُنادى عند الحضور */
  dailyNumber: number | null;
  clinicName: string;
  bookingMode: "SLOT" | "QUEUE";
  slotStart: Date;
  sessionStart: Date;
  sessionEnd: Date;
  queueNumber: number;
  patientNote?: string | null;
};

/** ما تحتاجه صياغة الوقت وحدها — لا الملخّص كاملاً */
export type AppointmentTiming = Pick<
  BookingSummary,
  "bookingMode" | "slotStart" | "sessionStart" | "sessionEnd" | "queueNumber"
>;

/** «الأحد، ٣٠ آب ٢٠٢٦ — ٤:٢٠ م» أو «… — الدور ١٢ بين ٤:٠٠ م و٧:٠٠ م» */
export function describeAppointmentTime(booking: AppointmentTiming): string {
  const day = dateFormatter.format(booking.slotStart);
  if (booking.bookingMode === "SLOT") {
    return `${day} — ${timeFormatter.format(booking.slotStart)}`;
  }
  const from = timeFormatter.format(booking.sessionStart);
  const to = timeFormatter.format(booking.sessionEnd);
  return `${day} — الدور ${toArabicDigits(booking.queueNumber)} بين ${from} و${to}`;
}

/* ── بنية القوالب ────────────────────────────────────────────── */

/**
 * جزءٌ من سطر: نصٌّ ثابت، أو رقم وسيطةٍ صفريّ الأساس.
 *
 * القالب يُوصف بنيةً لا نصّاً، ومن البنية يُشتقّ شيئان: الرسالة المرسلة
 * (بالقيم) والنصّ المقدَّم إلى ميتا (بعلامات {{n}}). فلا يفترقان أبداً.
 *
 * والبديل — كتابة النصّين يدوياً أو استخراج أحدهما بالبحث والاستبدال — جرّبناه
 * فانكسر: قيمتان متطابقتان («—» للعمر و«—» في تنسيق التاريخ) جعلتا الاستبدال
 * يضع علامةً واحدة في ثلاثة مواضع.
 */
type Segment = string | number;
type Line = Segment[];

type TemplateDef = {
  name: string;
  language: string;
  lines: Line[];
  /** قيمٌ مثالية تطلبها ميتا عند المراجعة */
  example: string[];
};

function renderBody(lines: Line[], params: string[]): string {
  return lines.map((line) => line.map((s) => (typeof s === "number" ? params[s] : s)).join("")).join("\n");
}

function renderTemplate(lines: Line[]): string {
  return lines.map((line) => line.map((s) => (typeof s === "number" ? `{{${s + 1}}}` : s)).join("")).join("\n");
}

function placeholderCount(lines: Line[]): number {
  const indexes = lines.flat().filter((s): s is number => typeof s === "number");
  return indexes.length === 0 ? 0 : Math.max(...indexes) + 1;
}

function compose(def: TemplateDef, rawParams: string[]): WhatsAppMessage {
  const params = rawParams.map(sanitizeParam);
  return { templateName: def.name, languageCode: def.language, params, body: renderBody(def.lines, params) };
}

/** ما يُوضع مكان حقلٍ لم يملأه المريض — ميتا ترفض الوسيطة الفارغة */
const BLANK = "—";

/* ── القوالب ─────────────────────────────────────────────────── */

/**
 * حجز جديد إلى واتساب الطبيب.
 *
 * كل تفصيلةٍ وسيطةٌ لا نصٌّ محليّ: ما يخرج من `params` لا يصل الطبيب إطلاقاً،
 * لأن ميتا تركّب الرسالة من قالبها المعتمد ووسائطنا لا من `body` عندنا. وهذا
 * ما كان يحدث لملاحظة المريض — تُكتب في المعاينة ولا تُرسل.
 *
 * وعددها ثابتٌ دائماً: القالب يتوقّع ثمانياً، وإرسال سبعٍ لأن المريض لم يكتب
 * ملاحظةً يُرَدّ بخطأ ٤xx ولا تصل الرسالة أصلاً — لذلك BLANK لا حذف.
 */
const NEW_BOOKING: TemplateDef = {
  name: "new_booking",
  language: "ar",
  lines: [
    ["🗓 حجز جديد"],
    [],
    ["المريض: ", 0],
    ["الهاتف: ", 1],
    ["العمر: ", 2],
    ["العنوان: ", 3],
    ["الموعد: ", 4],
    ["العيادة: ", 5],
    ["رقمه اليوم: ", 6],
    ["ملاحظة: ", 7],
    [],
    ["القائمة كاملة في التطبيق."],
  ],
  example: [
    "أحمد الجبوري",
    "0770 123 4567",
    "٣٢ سنة",
    "الكرخ — حي الجامعة",
    "الأحد، ٦ أيلول ٢٠٢٦ — ٤:٢٠ م",
    "عيادة النور",
    "٧",
    "عنده سكري وضغط",
  ],
};

export function newBookingMessage(booking: BookingSummary): WhatsAppMessage {
  return compose(NEW_BOOKING, [
    booking.patientName,
    // الهاتف بأرقام لاتينية ليبقى قابلاً للنقر والاتصال داخل واتساب
    formatIraqiPhoneForDisplay(booking.patientPhone),
    booking.patientAge ? `${toArabicDigits(booking.patientAge)} سنة` : BLANK,
    booking.patientAddress || BLANK,
    describeAppointmentTime(booking),
    booking.clinicName,
    booking.dailyNumber ? toArabicDigits(booking.dailyNumber) : BLANK,
    booking.patientNote || BLANK,
  ]);
}

const BOOKING_CANCELLED: TemplateDef = {
  name: "booking_cancelled",
  language: "ar",
  lines: [
    ["❌ إلغاء حجز"],
    [],
    ["المريض: ", 0],
    ["الموعد: ", 1],
    ["الرقم المرجعي: ", 2],
    ["أُلغي بواسطة: ", 3],
  ],
  example: ["أحمد الجبوري", "الأحد، ٦ أيلول ٢٠٢٦ — ٤:٢٠ م", "QJK-TAF", "المريض"],
};

export function bookingCancelledMessage(
  booking: BookingSummary,
  cancelledBy: "PATIENT" | "CLINIC",
): WhatsAppMessage {
  return compose(BOOKING_CANCELLED, [
    booking.patientName,
    describeAppointmentTime(booking),
    booking.reference,
    cancelledBy === "PATIENT" ? "المريض" : "العيادة",
  ]);
}

/**
 * تذكير المريض قبل موعده.
 *
 * العنوان وسيطةٌ ثابتة لا سطرٌ يظهر ويغيب: جسم القالب لدى ميتا واحدٌ لكل
 * الرسائل، فسطرٌ يُضاف لبعضها يعني قالبين لا قالباً — وقد كان يسقط صامتاً.
 */
const APPOINTMENT_REMINDER: TemplateDef = {
  name: "appointment_reminder",
  language: "ar",
  lines: [
    ["⏰ تذكير: موعدك ", 0],
    [],
    ["الطبيب: ", 1],
    ["الموعد: ", 2],
    ["العيادة: ", 3],
    ["العنوان: ", 4],
    ["الرقم المرجعي: ", 5],
    [],
    ["إن تعذّر حضورك، ألغِ الحجز من التطبيق ليستفيد غيرك."],
  ],
  example: ["غداً", "د. سارة العبيدي", "الأحد، ٦ أيلول ٢٠٢٦ — ٤:٢٠ م", "عيادة النور", "قرب مستشفى ابن البيطار", "QJK-TAF"],
};

export function patientReminderMessage(
  booking: {
    patientName: string;
    doctorName: string;
    clinicName: string;
    landmark: string | null;
    reference: string;
    bookingMode: "SLOT" | "QUEUE";
    slotStart: Date;
    sessionStart: Date;
    sessionEnd: Date;
    queueNumber: number;
  },
  whenLabel: string,
): WhatsAppMessage {
  return compose(APPOINTMENT_REMINDER, [
    whenLabel,
    booking.doctorName,
    describeAppointmentTime(booking),
    booking.clinicName,
    booking.landmark || BLANK,
    booking.reference,
  ]);
}

/* ── ما يُقدَّم إلى ميتا ──────────────────────────────────────── */

export type TemplateSpec = {
  name: string;
  language: string;
  /** نصّ الجسم كما يُلصق في مدير القوالب، بعلامات {{n}} في مواضع الوسائط */
  body: string;
  placeholders: number;
  example: string[];
};

/** القوالب الواجب اعتمادها لدى ميتا — مشتقّةٌ من بنية الرسائل نفسها */
export function templateSpecs(): TemplateSpec[] {
  return [NEW_BOOKING, BOOKING_CANCELLED, APPOINTMENT_REMINDER].map((def) => ({
    name: def.name,
    language: def.language,
    body: renderTemplate(def.lines),
    placeholders: placeholderCount(def.lines),
    example: def.example,
  }));
}
