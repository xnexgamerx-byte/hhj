import { Platform, useColorScheme } from "react-native";

/**
 * هوية «موعد»: زمرّدي عميق للثقة، وذهبي دافئ للفخامة.
 *
 * الزمرّدي بدل الفيروزي السابق لأنه أعمق وأهدأ للعين في شاشة يفتحها المريض
 * وهو قلق. والذهبي محصور في التمييز (طبيب مميّز، تقييم، شارة) — لو دخل في
 * الأزرار لفقد معناه.
 *
 * لكل لون درجتان: واحدة تُقرأ على الفاتح وأخرى على الزمرّدي الداكن. خلطهما
 * يعطي نصاً باهتاً على أحد السطحين دائماً.
 */
const light = {
  bg: "#F3F7F4",
  surface: "#FFFFFF",
  surface2: "#EDF3EF",
  surface3: "#E0EAE4",
  ink: "#0C1F19",
  muted: "#576B63",
  faint: "#7F918A",
  line: "#E3EBE6",
  lineStrong: "#C8D6CF",

  /** الزمرّدي: عميق للأزرار، وطرفا التدرّج للترويسات */
  primary: "#0E5140",
  primaryDeep: "#073328",
  primaryLift: "#1A7C61",
  primarySoft: "#E3EFE9",
  primaryTint: "#F0F7F3",
  onPrimary: "#FFFFFF",

  /** الذهبي: درجة داكنة للنص على الأبيض، وفاتحة للنص على الزمرّدي */
  gold: "#8B6316",
  goldBright: "#E7C069",
  goldSoft: "#F8EFDA",
  onGold: "#3A2A06",

  ok: "#186B49",
  okSoft: "#DFF0E7",
  warn: "#8A5D0C",
  warnSoft: "#FBEFD9",
  danger: "#A82F23",
  dangerSoft: "#FBE6E3",

  overlay: "rgba(6, 26, 20, 0.5)",
  /** ظل ملوّن بالهوية بدل الأسود — الأسود يجعل البطاقة متّسخة على خلفية خضراء */
  shadowTint: "#0A2E24",
};

const dark: typeof light = {
  bg: "#081310",
  surface: "#0F1D18",
  surface2: "#152722",
  surface3: "#1E332C",
  ink: "#E7EFEA",
  muted: "#9BACA5",
  faint: "#7C8D87",
  line: "#22352E",
  lineStrong: "#33473F",

  primary: "#3FA383",
  primaryDeep: "#0B241C",
  primaryLift: "#4FB994",
  primarySoft: "#12291F",
  primaryTint: "#0E211A",
  onPrimary: "#04170F",

  gold: "#E7C069",
  goldBright: "#F0D18C",
  goldSoft: "#2A2213",
  onGold: "#241A04",

  ok: "#4FBB8B",
  okSoft: "#0F2A1F",
  warn: "#DFAE54",
  warnSoft: "#2A2113",
  danger: "#EF8A7C",
  dangerSoft: "#2C1714",

  overlay: "rgba(0, 0, 0, 0.62)",
  shadowTint: "#000000",
};

export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}

export function useIsDark(): boolean {
  return useColorScheme() === "dark";
}

/** تدرّج الترويسة — ثلاث محطات كي لا يظهر شريط حادّ في المنتصف */
export const headerGradient = (p: Palette) => [p.primaryLift, p.primary, p.primaryDeep] as const;

export const font = {
  regular: "PlexArabic400",
  medium: "PlexArabic500",
  semibold: "PlexArabic600",
  bold: "PlexArabic700",
} as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 26, xxl: 34, pill: 999 } as const;

export const space = (n: number) => n * 4;

/**
 * ثلاث درجات ظل: ١ للبطاقات الساكنة، ٢ للعائمة، ٣ للنوافذ.
 * أندرويد لا يعرف لون الظل قبل ٢٨، فيبقى elevation وحده.
 */
export const shadow = (level: 1 | 2 | 3 = 1, tint = "#0A2E24") =>
  Platform.select({
    android: { elevation: level === 1 ? 2 : level === 2 ? 7 : 14 },
    default: {
      shadowColor: tint,
      shadowOpacity: level === 1 ? 0.07 : level === 2 ? 0.13 : 0.22,
      shadowRadius: level === 1 ? 10 : level === 2 ? 22 : 34,
      shadowOffset: { width: 0, height: level === 1 ? 3 : level === 2 ? 10 : 16 },
    },
  })!;
