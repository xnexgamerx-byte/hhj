import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { font, radius, shadow, space, usePalette, type Palette } from "@/theme";
import { toArabic } from "@/lib/format";

/* ── النص ────────────────────────────────────────────────────── */

type TextTone = "ink" | "muted" | "faint" | "primary" | "accent" | "ok" | "warn" | "danger" | "onPrimary" | "onAccent";

export function T({
  children,
  size = 15,
  weight = "regular",
  tone = "ink",
  align,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  size?: number;
  weight?: keyof typeof font;
  tone?: TextTone;
  align?: "right" | "center" | "left";
  style?: StyleProp<ViewStyle> | object;
  numberOfLines?: number;
}) {
  const palette = usePalette();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: font[weight],
          fontSize: size,
          lineHeight: Math.round(size * 1.6),
          color: palette[tone],
          textAlign: align ?? "right",
          writingDirection: "rtl",
        },
        style as object,
      ]}
    >
      {children}
    </Text>
  );
}

/* ── الأزرار ─────────────────────────────────────────────────── */

type Variant = "primary" | "accent" | "outline" | "ghost" | "danger";

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  full,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = usePalette();
  const height = size === "sm" ? 36 : size === "lg" ? 52 : 44;
  const fontSize = size === "sm" ? 13 : size === "lg" ? 16 : 14.5;

  const styles: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: palette.primary, fg: palette.onPrimary },
    accent: { bg: palette.accent, fg: palette.onAccent },
    outline: { bg: "transparent", fg: palette.ink, border: palette.lineStrong },
    ghost: { bg: "transparent", fg: palette.muted },
    danger: { bg: palette.dangerSoft, fg: palette.danger },
  };
  const s = styles[variant];
  const off = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        {
          height,
          paddingHorizontal: size === "sm" ? space(3) : space(4),
          backgroundColor: s.bg,
          borderRadius: radius.md,
          borderWidth: s.border ? 1 : 0,
          borderColor: s.border,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: space(2),
          opacity: off ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: full ? "stretch" : "flex-start",
        },
        style,
      ]}
    >
      {loading && <ActivityIndicator size="small" color={s.fg} />}
      <Text style={{ fontFamily: font.semibold, fontSize, color: s.fg }}>{label}</Text>
    </Pressable>
  );
}

/* ── البطاقة ─────────────────────────────────────────────────── */

export function Card({
  children,
  style,
  onPress,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
}) {
  const palette = usePalette();
  const base: ViewStyle = {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    padding: padded ? space(4) : 0,
    ...shadow(1),
  };

  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.9 : 1 }, style]}>
      {children}
    </Pressable>
  );
}

/* ── الشارة ──────────────────────────────────────────────────── */

const toneColors = (palette: Palette) => ({
  ok: { bg: palette.okSoft, fg: palette.ok },
  warn: { bg: palette.warnSoft, fg: palette.warn },
  danger: { bg: palette.dangerSoft, fg: palette.danger },
  primary: { bg: palette.primarySoft, fg: palette.primary },
  accent: { bg: palette.accentSoft, fg: palette.accent },
  muted: { bg: palette.surface3, fg: palette.muted },
});

export type Tone = keyof ReturnType<typeof toneColors>;

export function Badge({ label, tone = "muted" }: { label: string; tone?: Tone }) {
  const palette = usePalette();
  const c = toneColors(palette)[tone];
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: 3 }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 12, color: c.fg }}>{label}</Text>
    </View>
  );
}

/* ── الحقول ──────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: space(1.5) }}>
      <T size={13} weight="semibold">
        {label}
      </T>
      {children}
      {hint ? (
        <T size={12} tone="faint">
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export function Input(props: TextInputProps) {
  const palette = usePalette();
  return (
    <TextInput
      placeholderTextColor={palette.faint}
      {...props}
      style={[
        {
          backgroundColor: palette.surface2,
          borderWidth: 1,
          borderColor: palette.line,
          borderRadius: radius.md,
          paddingHorizontal: space(3),
          paddingVertical: space(2.5),
          fontFamily: font.regular,
          fontSize: 15,
          color: palette.ink,
          textAlign: "right",
        },
        props.style,
      ]}
    />
  );
}

/* ── الحالات ─────────────────────────────────────────────────── */

export function Alert({ message, tone = "danger" }: { message: string; tone?: Tone }) {
  const palette = usePalette();
  const c = toneColors(palette)[tone];
  return (
    <View
      accessibilityRole="alert"
      style={{ backgroundColor: c.bg, borderRadius: radius.md, paddingHorizontal: space(4), paddingVertical: space(3) }}
    >
      <Text style={{ fontFamily: font.medium, fontSize: 14, color: c.fg, textAlign: "right" }}>{message}</Text>
    </View>
  );
}

export function Loading({ label = "جارٍ التحميل…" }: { label?: string }) {
  const palette = usePalette();
  return (
    <View style={{ paddingVertical: space(12), alignItems: "center", gap: space(2) }}>
      <ActivityIndicator color={palette.primary} />
      <T size={14} tone="muted">
        {label}
      </T>
    </View>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <View style={{ paddingVertical: space(10), paddingHorizontal: space(5), alignItems: "center", gap: space(2) }}>
      <T size={15} weight="semibold" align="center">
        {title}
      </T>
      {hint ? (
        <T size={13.5} tone="muted" align="center">
          {hint}
        </T>
      ) : null}
      {action ? <View style={{ marginTop: space(2) }}>{action}</View> : null}
    </View>
  );
}

/** النجوم: الممتلئة بلون الإبراز والفارغة بلون الخطوط، فيقرأ التقييم بلمحة. */
export function Stars({ value, size = 13, count }: { value: number; size?: number; count?: number }) {
  const palette = usePalette();
  const filled = Math.round(value);
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
      accessibilityLabel={`التقييم ${value} من ٥${count !== undefined ? ` من ${count} تقييم` : ""}`}
    >
      <Text style={{ fontSize: size, color: palette.accent, letterSpacing: 1 }}>
        {"★".repeat(filled)}
        <Text style={{ color: palette.lineStrong }}>{"★".repeat(5 - filled)}</Text>
      </Text>
      {count !== undefined ? (
        <Text style={{ fontFamily: font.regular, fontSize: size - 1, color: palette.muted }}>
          {toArabic(value.toFixed(1))} ({toArabic(count)})
        </Text>
      ) : null}
    </View>
  );
}

export function Divider() {
  const palette = usePalette();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.line }} />;
}
