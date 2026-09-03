/**
 * التحويل بين توقيت العيادة والتوقيت العالمي.
 *
 * قوالب الدوام تُخزَّن بتوقيت العيادة نصاً ("16:00")، والمواعيد تُخزَّن بتوقيت عالمي.
 * الجسر بينهما هو هذا الملف. الخلط بين التوقيتين أكثر مصدر أخطاء يصعب تتبّعه في
 * أنظمة الحجز — يظهر متأخراً وعلى شكل مواعيد بفارق ساعات.
 */

/**
 * المنسّقات محفوظة بمفتاح المنطقة الزمنية.
 *
 * بناء Intl.DateTimeFormat عمليةٌ ثقيلة — يقرأ قواعد المنطقة الزمنية ويبني
 * جدولها. وحساب أوقات خمسين عيادةً لأسبوعين يستدعي التحويل عشرات الآلاف من
 * المرّات، فبناؤه في كل نداء كان يأكل معظم زمن صفحة البحث. والمنسّق لا حالة
 * له بعد الإنشاء فحفظه آمن.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(key: string, build: () => Intl.DateTimeFormat): Intl.DateTimeFormat {
  const cached = formatters.get(key);
  if (cached) return cached;
  const made = build();
  formatters.set(key, made);
  return made;
}

/** فرق المنطقة الزمنية بالمللي ثانية عند لحظة معيّنة. */
function offsetMsAt(instant: Date, timeZone: string): number {
  const parts = formatter(
    `offset:${timeZone}`,
    () =>
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
  ).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const hour = get("hour") === 24 ? 0 : get("hour");

  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return asUtc - instant.getTime();
}

/**
 * «٢٠٢٦-٠٩-٠٦ الساعة ١٦:٠٠ بتوقيت بغداد» ⇐ لحظة بالتوقيت العالمي.
 *
 * تمريرتان: الأولى تقدّر الفرق، والثانية تصحّحه. العراق بلا توقيت صيفي منذ ٢٠٠٨
 * فالتمريرة الأولى تكفيه، لكن التصحيح يبقي الدالة صحيحة لأي منطقة أخرى لاحقاً.
 */
export function zonedToUtc(dateISO: string, time: string, timeZone: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  const naive = new Date(`${dateISO}T00:00:00.000Z`);
  naive.setUTCHours(hour, minute, 0, 0);

  let result = new Date(naive.getTime() - offsetMsAt(naive, timeZone));
  result = new Date(naive.getTime() - offsetMsAt(result, timeZone));
  return result;
}

/** التاريخ بصيغة YYYY-MM-DD كما يقع في المنطقة الزمنية المعطاة. */
export function utcToZonedDateISO(instant: Date, timeZone: string): string {
  const parts = formatter(
    `date:${timeZone}`,
    () => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }),
  ).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** الوقت بصيغة HH:MM كما يقع في المنطقة الزمنية المعطاة. */
export function utcToZonedTime(instant: Date, timeZone: string): string {
  return formatter(
    `time:${timeZone}`,
    () => new Intl.DateTimeFormat("en-GB", { timeZone, hour12: false, hour: "2-digit", minute: "2-digit" }),
  ).format(instant);
}

/** رقم اليوم في الأسبوع بتوقيت العيادة: ٠ = الأحد … ٦ = السبت. */
export function zonedWeekday(dateISO: string, timeZone: string): number {
  const noon = zonedToUtc(dateISO, "12:00", timeZone);
  const name = formatter(`weekday:${timeZone}`, () => new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" })).format(noon);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** يضيف أياماً إلى تاريخ YYYY-MM-DD دون المرور بالمناطق الزمنية. */
export function addDaysISO(dateISO: string, days: number): string {
  const date = new Date(`${dateISO}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "16:00" ⇐ ٩٦٠ دقيقة من منتصف الليل. */
export function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

/** ٩٦٠ ⇐ "16:00" */
export function minutesToTime(total: number): string {
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** اختصارات صحيحة — قصّ «الثلاثاء» إلى ثلاثة أحرف يعطي شظية بلا معنى */
export const WEEKDAY_SHORT_AR = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"] as const;

export const WEEKDAY_NAMES_AR = [
  "الأحد",
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
] as const;
