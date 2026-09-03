/** تنسيق التواريخ والأرقام بالصيغة العراقية. */

const TZ = "Asia/Baghdad";

export const dayFull = new Intl.DateTimeFormat("ar-IQ", {
  timeZone: TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
});

export const dayShort = new Intl.DateTimeFormat("ar-IQ", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
});

export const weekdayShort = new Intl.DateTimeFormat("ar-IQ", { timeZone: TZ, weekday: "short" });

export const clockFormat = new Intl.DateTimeFormat("ar-IQ", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatDay(iso: string): string {
  return dayFull.format(new Date(`${iso}T12:00:00Z`));
}

export function formatClock(iso: string): string {
  return clockFormat.format(new Date(iso));
}

/** "16:20" ⇐ "٤:٢٠ م" */
export function formatTimeLabel(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  const period = hour < 12 ? "ص" : "م";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${toArabic(display)}:${toArabic(String(minute).padStart(2, "0"))} ${period}`;
}

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

/**
 * للأرقام في لوحات الإحصاء: الصفر المفرد في العربية «٠» نقطةٌ صغيرة تبدو
 * كعطل عرض لا كقيمة. الشرطة أوضح وهي عُرف متعارف عليه في لوحات البيانات.
 */
export function statNumber(value: number): string {
  return value === 0 ? "—" : toArabic(value);
}

/** ٢٥٠٠٠ ⇐ «٢٥,٠٠٠ د.ع» */
export function formatFee(amount: number): string {
  return `${toArabic(amount.toLocaleString("en-US"))} د.ع`;
}

export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export const STATUS_LABELS: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "muted" }> = {
  CONFIRMED: { label: "مؤكَّد", tone: "ok" },
  PENDING: { label: "بانتظار الموافقة", tone: "warn" },
  HELD: { label: "محجوز مؤقتاً", tone: "warn" },
  COMPLETED: { label: "تم الكشف", tone: "muted" },
  NO_SHOW: { label: "لم يحضر", tone: "danger" },
  CANCELLED_BY_PATIENT: { label: "ألغاه المريض", tone: "muted" },
  CANCELLED_BY_CLINIC: { label: "ألغته العيادة", tone: "danger" },
};
