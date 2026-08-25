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
