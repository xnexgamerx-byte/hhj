import { Platform, useColorScheme } from "react-native";

/**
 * نفس هوية الويب: فيروزي عميق للهوية، ومرجاني دافئ لأفعال الحجز.
 * ألوان الحالة منفصلة عن لون الهوية عمداً — وإلا اختلط «زر أساسي» بـ«حالة سليمة».
 */
const light = {
  bg: "#F4F7F7",
  surface: "#FFFFFF",
  surface2: "#EEF3F3",
  surface3: "#E3EBEB",
  ink: "#10201F",
  muted: "#5B6B6A",
  faint: "#849695",
  line: "#DDE5E5",
  lineStrong: "#C6D2D2",

  primary: "#0A6C72",
  primarySoft: "#E0EFEF",
  onPrimary: "#FFFFFF",

  accent: "#C74B28",
  accentSoft: "#FBE9E3",
  onAccent: "#FFFFFF",

  ok: "#1C7A52",
  okSoft: "#E2F2EA",
  warn: "#8A5D0C",
  warnSoft: "#FBEFD9",
  danger: "#A82F23",
  dangerSoft: "#FBE6E3",

  overlay: "rgba(8, 22, 21, 0.45)",
};

const dark: typeof light = {
  bg: "#0C1413",
  surface: "#121C1B",
  surface2: "#182524",
  surface3: "#21302F",
  ink: "#E6EEED",
  muted: "#9AA9A8",
  faint: "#7B8A89",
  line: "#263433",
  lineStrong: "#364645",

  primary: "#4FB3B8",
  primarySoft: "#102A2C",
  onPrimary: "#06201F",

  accent: "#F0805C",
  accentSoft: "#2C1810",
  onAccent: "#2A1008",

  ok: "#56C08D",
  okSoft: "#10261D",
  warn: "#DFAE54",
  warnSoft: "#2A2113",
  danger: "#EF8A7C",
  dangerSoft: "#2C1714",

  overlay: "rgba(0, 0, 0, 0.6)",
};

export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}

export const font = {
  regular: "PlexArabic400",
  medium: "PlexArabic500",
  semibold: "PlexArabic600",
  bold: "PlexArabic700",
} as const;

export const radius = { sm: 8, md: 10, lg: 14, xl: 18, pill: 999 } as const;

export const space = (n: number) => n * 4;

/** ظل موحّد — الأندرويد يستعمل elevation والآيفون يستعمل الظل */
export const shadow = (level: 1 | 2 = 1) =>
  Platform.select({
    android: { elevation: level === 1 ? 1 : 6 },
    default: {
      shadowColor: "#0B1A19",
      shadowOpacity: level === 1 ? 0.06 : 0.18,
      shadowRadius: level === 1 ? 3 : 18,
      shadowOffset: { width: 0, height: level === 1 ? 1 : 8 },
    },
  })!;
