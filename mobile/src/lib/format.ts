/** تنسيق عربي عراقي — نفس قواعد الويب. */
const TZ = "Asia/Baghdad";

const dayFull = new Intl.DateTimeFormat("ar-IQ", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const clock = new Intl.DateTimeFormat("ar-IQ", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });

export function toArabic(value: string | number): string {
  return String(value).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

/**
 * صيغة المعدود في العربية تتبع العدد، ولا تكفيها إضافة رقمٍ إلى اسمٍ مفرد.
 *
 *   واحد   ⇐ «وقت شاغر»            بلا رقم، فالمفرد يقوله بنفسه
 *   اثنان  ⇐ «وقتان شاغران»        المثنّى كذلك
 *   ٣–١٠   ⇐ «٣ أوقات شاغرة»       جمعٌ بعد العدد
 *   ١١+    ⇐ «١١ وقتاً شاغراً»      مفردٌ منصوب بعد العدد
 *
 * والقواعد من Intl لا من شرطٍ نكتبه بأيدينا: هي نفسها في كل مكان يقرأ العربية.
 */
const arabicPlural = new Intl.PluralRules("ar-IQ");

export type CountForms = {
  /** ما يُكتب عند الصفر. افتراضه «لا» والجمعُ، فلا يظهر «٠» وحيداً */
  zero?: string;
  one: string;
  two: string;
  /** ٣–١٠ */
  few: string;
  /** ١١ فأكثر */
  many: string;
};

export function countLabel(value: number, forms: CountForms): string {
  switch (arabicPlural.select(value)) {
    case "zero":
      // «٠ طبيباً» ليست عربية، و«٠» وحدها نقطةٌ تبدو كعطل عرض
      return forms.zero ?? `لا ${forms.few}`;
    case "one":
      return forms.one;
    case "two":
      return forms.two;
    case "few":
      return `${toArabic(value)} ${forms.few}`;
    default:
      return `${toArabic(value)} ${forms.many}`;
  }
}

/**
 * المعدودات المتكرّرة في الواجهة، بأشكالها الأربعة.
 *
 * المفرد والمثنّى يحملان العدد في صيغتهما فلا يُسبقان برقم: «طبيب واحد» لا
 * «١ طبيب». والجمع بعد ٣–١٠، ثم المفرد المنصوب من ١١ فأكثر.
 */
export const COUNTS = {
  doctor: { one: "طبيب واحد", two: "طبيبان", few: "أطباء", many: "طبيباً" },
  clinic: { one: "عيادة واحدة", two: "عيادتان", few: "عيادات", many: "عيادة" },
  seat: { one: "مكان واحد", two: "مكانان", few: "أماكن", many: "مكاناً" },
  slot: { one: "وقت شاغر", two: "وقتان شاغران", few: "أوقات شاغرة", many: "وقتاً شاغراً" },
  year: { zero: "أقل من سنة", one: "سنة واحدة", two: "سنتان", few: "سنوات", many: "سنة" },
  minute: { one: "دقيقة واحدة", two: "دقيقتان", few: "دقائق", many: "دقيقة" },
  visit: { one: "زيارة واحدة", two: "زيارتان", few: "زيارات", many: "زيارة" },
  message: { one: "رسالة واحدة", two: "رسالتان", few: "رسائل", many: "رسالة" },
} as const satisfies Record<string, CountForms>;

/** الصفر المفرد «٠» نقطةٌ تبدو كعطل عرض في خانات الإحصاء */
export function statNumber(value: number): string {
  return value === 0 ? "—" : toArabic(value);
}

export function formatDay(iso: string): string {
  return dayFull.format(new Date(`${iso}T12:00:00Z`));
}

export function formatClock(iso: string): string {
  return clock.format(new Date(iso));
}

/** "16:20" ⇐ "٤:٢٠ م" */
export function formatTimeLabel(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  const period = hour < 12 ? "ص" : "م";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${toArabic(display)}:${toArabic(String(minute).padStart(2, "0"))} ${period}`;
}

export function formatFee(amount: number): string {
  return `${toArabic(amount.toLocaleString("en-US"))} د.ع`;
}

export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

export const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export const STATUS_LABELS: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "muted" }> = {
  CONFIRMED: { label: "مؤكَّد", tone: "ok" },
  PENDING: { label: "بانتظار الموافقة", tone: "warn" },
  HELD: { label: "محجوز مؤقتاً", tone: "warn" },
  COMPLETED: { label: "تم الكشف", tone: "muted" },
  NO_SHOW: { label: "لم يحضر", tone: "danger" },
  CANCELLED_BY_PATIENT: { label: "ألغيتَه", tone: "muted" },
  CANCELLED_BY_CLINIC: { label: "ألغته العيادة", tone: "danger" },
};

/**
 * ‎+9647701110001 ⇐ ‎0770 111 0001.
 *
 * بأرقام لاتينية لا عربية-هندية: الرقم يُقرأ ليُطلَب، ولوحة الاتصال في
 * الهاتف لاتينية — وقارئه في العيادة يقارن ما يرى بما يكتب.
 *
 * ومحاطٌ بعازل اتجاهٍ (U+2066 … U+2069): ثلاث مجموعاتٍ لاتينية تفصلها مسافات
 * داخل فقرةٍ عربية يعكس محرّك ثنائيّ الاتجاه ترتيبها، فيُعرض ٠٧٧٠ ١١١ ٠٠٠١
 * مقلوباً «0001 111 0770» — رقمٌ خاطئٌ يُطلَب فيردّ غريب. رأيتها على الشاشة.
 * والعازل يفعل ذلك في أي واجهة تعرض النصّ، فلا يُنسى في موضعٍ ويُذكر في آخر.
 */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("964") ? `0${digits.slice(3)}` : digits;
  const spaced = local.length === 11 ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : local;
  return `\u2066${spaced}\u2069`;
}
