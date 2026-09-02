import { Platform } from "react-native";

import { useThemeMode } from "./theme-mode";

/**
 * هوية «موعد» على نظام كيت فيغما المرجعي.
 *
 * الأساس كحلي داكن #1C2A3A مع سلّم رمادي محايد — هذا ما يعطي الشاشات مظهر
 * الكيت. والزمرّدي بقي علامةً فقط: الأيقونة والشعار وشاشة البداية، فالهوية
 * لا تُبنى على لون الأزرار وحده.
 */
const light = {
  bg: "#F9FAFB",
  surface: "#FFFFFF",
  surface2: "#F3F4F6",
  surface3: "#E5E7EB",
  ink: "#1C2A3A",
  muted: "#4B5563",
  faint: "#78828F",
  line: "#E5E7EB",
  /** حدٌّ يُرى: يحمل معنًى — إطار زر، نجمة فارغة، يوم مغلق، نقطة غير نشطة */
  lineStrong: "#848E9B",

  /** الكحلي: الأزرار والعناوين وكل فعل أساسي */
  primary: "#1C2A3A",
  primaryDeep: "#101A24",
  primaryLift: "#2E4257",
  primarySoft: "#EEF1F4",
  primaryTint: "#F5F7F8",
  onPrimary: "#FFFFFF",

  /**
   * لوحة اللافتة: تبقى داكنة في الوضعين.
   *
   * لا تُشتقّ من primary: ذاك ينقلب فاتحاً في الوضع الداكن ليصلح لوناً
   * للأزرار على سطحٍ داكن — وهو صواب هناك وخطأ هنا، إذ يصير مستطيلٌ بحجم
   * ثلث الشاشة كتلةً ساطعة تشدّ العين عن كل ما حولها.
   */
  heroFrom: "#2E4257",
  heroTo: "#101A24",
  onHero: "#FFFFFF",
  onHeroMuted: "#C6D0DA",

  /**
   * بلاطة رسمة التخصص.
   *
   * الرسمات صارت ملوّنةً كاملة، فخلفيةٌ مختلفة لكل تخصص تجعل الشبكة ثماني
   * لوحاتٍ متنافرة. لونٌ واحدٌ محايدٌ دافئ يترك الرسمة هي التي تميّز.
   */
  artTile: "#FBF7F0",

  /** الزمرّدي: العلامة وحدها — الأيقونة والشعار وشاشة البداية */
  brand: "#0E5140",
  brandSoft: "#E3EFE9",

  /** الذهبي: التمييز — طبيب مميّز، تقييم، نظام أدوار */
  gold: "#8B6316",
  goldBright: "#E7C069",
  goldSoft: "#FBF3E2",
  onGold: "#3A2A06",

  ok: "#15803D",
  okSoft: "#DCFCE7",
  warn: "#92580A",
  warnSoft: "#FEF3C7",
  danger: "#B91C1C",
  dangerSoft: "#FEE2E2",

  overlay: "rgba(17, 24, 39, 0.5)",
  /** ظل رمادي محايد كما في الكيت — الظل الملوّن يشدّ الخلفية نحو لونه */
  shadowTint: "#111827",
};

const dark: typeof light = {
  bg: "#0B1116",
  surface: "#141C24",
  surface2: "#1B242E",
  surface3: "#26313D",
  ink: "#E7ECF1",
  muted: "#9FADBC",
  faint: "#7D8B9A",
  line: "#26313D",
  lineStrong: "#5C6B7B",

  primary: "#7FA3C4",
  primaryDeep: "#0E161D",
  primaryLift: "#9BB9D4",
  primarySoft: "#18242F",
  primaryTint: "#131C24",
  onPrimary: "#0B1116",

  heroFrom: "#22303D",
  heroTo: "#0E161D",
  onHero: "#E7ECF1",
  onHeroMuted: "#A8B6C4",

  artTile: "#1B242E",

  brand: "#3FA383",
  brandSoft: "#12291F",

  gold: "#E7C069",
  goldBright: "#F0D18C",
  goldSoft: "#2A2213",
  onGold: "#241A04",

  ok: "#4ADE80",
  okSoft: "#0F2A1B",
  warn: "#FBBF24",
  warnSoft: "#2A2113",
  danger: "#F87171",
  dangerSoft: "#2C1615",

  overlay: "rgba(0, 0, 0, 0.65)",
  shadowTint: "#000000",
};

/**
 * ألوان بطاقات التخصصات — الباستيل الذي يعطي شبكة الكيت حيويتها.
 *
 * التخصصات ٢٨ ولون واحد يجعل الشبكة جداراً رتيباً. الدرجة تُشتقّ من اسم
 * التخصص لا من ترتيبه، كي لا يتبدّل لون «الأسنان» حين يظهر طبيب جديد في
 * تخصص قبله.
 */
const tints = [
  { bg: "#FDE4E9", fg: "#A32F49" },
  { bg: "#D8F0E1", fg: "#1B7440" },
  { bg: "#FCE6D2", fg: "#94530F" },
  { bg: "#E9E2F8", fg: "#553BA3" },
  { bg: "#D2EDEA", fg: "#12706A" },
  { bg: "#DCE6FB", fg: "#25438F" },
  { bg: "#FBEFD0", fg: "#835E0C" },
  { bg: "#D9EBFA", fg: "#155C88" },
] as const;

const tintsDark = [
  { bg: "#2E1B21", fg: "#F0A3B4" },
  { bg: "#13291C", fg: "#7FD3A0" },
  { bg: "#2D2016", fg: "#E5B183" },
  { bg: "#221D33", fg: "#B7A5EA" },
  { bg: "#122A29", fg: "#7FD1CA" },
  { bg: "#161F33", fg: "#9FB8EE" },
  { bg: "#2A2415", fg: "#E0C378" },
  { bg: "#132430", fg: "#8FC4E6" },
] as const;

export type Tint = { bg: string; fg: string };

/** بصمة نصّية ثابتة → فهرس درجة. نفس المفتاح يعطي نفس اللون دائماً. */
export function tintFor(key: string, isDark = false): Tint {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const set = isDark ? tintsDark : tints;
  return set[hash % set.length];
}

export type Palette = typeof light;

export const palettes = { light, dark } as const;

export function usePalette(): Palette {
  return palettes[useThemeMode().resolved];
}

export function useIsDark(): boolean {
  return useThemeMode().resolved === "dark";
}

export const font = {
  regular: "PlexArabic400",
  medium: "PlexArabic500",
  semibold: "PlexArabic600",
  bold: "PlexArabic700",
} as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 26, xxl: 34, pill: 999 } as const;

export const space = (n: number) => n * 4;

/** يدمج لوناً ست عشرياً مع شفافية — boxShadow يطلبهما في نصٍّ واحد */
function rgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? [...value].map((c) => c + c).join("") : value;
  const n = Number.parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * ثلاث درجات ظل: ١ للبطاقات الساكنة، ٢ للعائمة، ٣ للنوافذ.
 *
 * أندرويد لا يعرف لون الظل قبل ٢٨، فيبقى elevation وحده. وما عداه يستعمل
 * boxShadow لا خصائص shadow* المنفصلة: تلك مهجورة ويحذّر منها التشغيل، وهي
 * في طريقها إلى الإزالة.
 */
export const shadow = (level: 1 | 2 | 3 = 1, tint = "#0A2E24") => {
  const y = level === 1 ? 3 : level === 2 ? 10 : 16;
  const blur = level === 1 ? 10 : level === 2 ? 22 : 34;
  const alpha = level === 1 ? 0.07 : level === 2 ? 0.13 : 0.22;
  return Platform.select({
    android: { elevation: level === 1 ? 2 : level === 2 ? 7 : 14 },
    default: { boxShadow: `0px ${y}px ${blur}px ${rgba(tint, alpha)}` },
  })!;
};
