import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { font, radius, shadow, space, usePalette, type Palette } from "@/theme";
import { toArabic } from "@/lib/format";
import { Icon } from "@/components/icons";

/* ── النص ────────────────────────────────────────────────────── */

export type Tone = Extract<keyof Palette, string>;

export function T({
  children,
  size = 15,
  weight = "regular",
  tone = "ink",
  align,
  style,
  numberOfLines,
  lineHeight,
}: {
  children: ReactNode;
  size?: number;
  weight?: keyof typeof font;
  tone?: Tone;
  align?: "right" | "center" | "left";
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  lineHeight?: number;
}) {
  const palette = usePalette();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: font[weight],
          fontSize: size,
          lineHeight: lineHeight ?? Math.round(size * 1.55),
          color: palette[tone],
          textAlign: align ?? "right",
          writingDirection: "rtl",
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/* ── الأزرار ─────────────────────────────────────────────────── */

type Variant = "primary" | "gold" | "soft" | "outline" | "ghost" | "danger";

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  full,
  icon,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  icon?: (color: string, size: number) => ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = usePalette();
  const height = size === "sm" ? 38 : size === "lg" ? 54 : 46;
  const fontSize = size === "sm" ? 13 : size === "lg" ? 16 : 14.5;
  const off = disabled || loading;

  const flat: Record<Exclude<Variant, "primary">, { bg: string; fg: string; border?: string }> = {
    gold: { bg: palette.goldBright, fg: palette.onGold },
    soft: { bg: palette.primarySoft, fg: palette.primary },
    outline: { bg: "transparent", fg: palette.primary, border: palette.lineStrong },
    ghost: { bg: "transparent", fg: palette.muted },
    danger: { bg: palette.dangerSoft, fg: palette.danger },
  };

  const fg = variant === "primary" ? palette.onPrimary : flat[variant].fg;
  const body = (
    <>
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon?.(fg, size === "sm" ? 16 : 18)}
      <Text style={{ fontFamily: font.semibold, fontSize, color: fg }}>{label}</Text>
    </>
  );

  const shell: ViewStyle = {
    height,
    paddingHorizontal: size === "sm" ? space(3.5) : space(5),
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: space(2),
    alignSelf: full ? "stretch" : "flex-start",
    // بلا هذا ينكمش الزر إلى دائرة حين يزاحمه نصّ طويل في نفس الصف
    flexShrink: 0,
    overflow: "hidden",
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        variant === "primary"
          ? { ...shell, ...shadow(1, palette.shadowTint) }
          : {
              ...shell,
              backgroundColor: flat[variant].bg,
              borderWidth: flat[variant].border ? 1.4 : 0,
              borderColor: flat[variant].border,
            },
        { opacity: off ? 0.45 : pressed ? 0.88 : 1 },
        style,
      ]}
    >
      {/* التدرّج طبقة خلفية مستقلّة: لو حمل النصّ داخله لخرج المحتوى من مجرى
          التخطيط وانهار عرض الزر إلى مقدار حشوته */}
      {variant === "primary" ? (
        <LinearGradient
          colors={[palette.primaryLift, palette.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
        />
      ) : null}
      {body}
    </Pressable>
  );
}

/* ── البطاقة ─────────────────────────────────────────────────── */

export function Card({
  children,
  style,
  onPress,
  padded = true,
  level = 1,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
  level?: 1 | 2;
}) {
  const palette = usePalette();
  // بلا حدّ ظاهر: الظل الملوّن يفصل البطاقة عن الخلفية، والحدّ فوقه يجعلها ثقيلة
  const base: ViewStyle = {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: padded ? space(4) : 0,
    ...shadow(level, palette.shadowTint),
  };

  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [base, { opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }, style]}
    >
      {children}
    </Pressable>
  );
}

/* ── مربّع الأيقونة ──────────────────────────────────────────── */

/** الخلفية الملوّنة الدائرية التي تحمل أيقونة التخصص أو أي رمز آخر */
export function IconTile({
  children,
  size = 46,
  bg,
  round,
}: {
  children: ReactNode;
  size?: number;
  bg?: string;
  round?: boolean;
}) {
  const palette = usePalette();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: round ? size / 2 : size * 0.32,
        backgroundColor: bg ?? palette.primarySoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </View>
  );
}

/* ── الصورة الشخصية ─────────────────────────────────────────── */

export function Avatar({ name, uri, size = 56, ring }: { name: string; uri?: string | null; size?: number; ring?: boolean }) {
  const palette = usePalette();
  const initials = name.replace(/^(د\.|الدكتورة?|د)\s*/u, "").trim().charAt(0) || "د";
  const frame: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: ring ? 2 : 0,
    borderColor: palette.primarySoft,
    overflow: "hidden",
    backgroundColor: palette.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  };

  if (uri) return <Image source={{ uri }} style={frame as ImageStyle} accessibilityLabel={name} />;
  return (
    <View style={frame}>
      <Text style={{ fontFamily: font.bold, fontSize: size * 0.4, color: palette.primary }}>{initials}</Text>
    </View>
  );
}

/* ── الشارة ──────────────────────────────────────────────────── */

const toneColors = (palette: Palette) => ({
  ok: { bg: palette.okSoft, fg: palette.ok },
  warn: { bg: palette.warnSoft, fg: palette.warn },
  danger: { bg: palette.dangerSoft, fg: palette.danger },
  primary: { bg: palette.primarySoft, fg: palette.primary },
  gold: { bg: palette.goldSoft, fg: palette.gold },
  muted: { bg: palette.surface3, fg: palette.muted },
  onDark: { bg: "rgba(255,255,255,0.16)", fg: "#FFFFFF" },
});

export type BadgeTone = keyof ReturnType<typeof toneColors>;

export function Badge({
  label,
  tone = "muted",
  icon,
  solid,
}: {
  label: string;
  tone?: BadgeTone;
  icon?: (color: string, size: number) => ReactNode;
  solid?: boolean;
}) {
  const palette = usePalette();
  const c = toneColors(palette)[tone];
  const bg = solid && tone === "gold" ? palette.goldBright : c.bg;
  const fg = solid && tone === "gold" ? palette.onGold : c.fg;
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingHorizontal: space(2.5),
        paddingVertical: 4,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
      }}
    >
      {icon?.(fg, 12)}
      <Text style={{ fontFamily: font.semibold, fontSize: 11.5, color: fg }}>{label}</Text>
    </View>
  );
}

/* ── عنوان القسم ─────────────────────────────────────────────── */

export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
      <T size={17} weight="bold">
        {title}
      </T>
      <View style={{ flex: 1 }} />
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
          <T size={13} weight="semibold" tone="primary">
            {actionLabel}
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ── الاختيار من بين خيارات قليلة ────────────────────────────── */

/**
 * شريط خيارات: بديل القائمة المنسدلة حين تكون الخيارات قليلة ومعروفة.
 *
 * أفضل منها هنا لأنّ الخيارات كلّها مرئية بلا فتح، والإصبع يصلها بضغطة
 * واحدة — وهذا يهمّ في شاشة حجز يُراد لها أن تكون أقصر ما يمكن.
 */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
}) {
  const palette = usePalette();
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: palette.surface2,
        borderRadius: radius.md,
        padding: space(1),
        gap: space(1),
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: space(2.25),
              borderRadius: radius.sm,
              backgroundColor: active ? palette.surface : "transparent",
              ...(active ? shadow(1, palette.shadowTint) : null),
            }}
          >
            <T size={13} weight={active ? "bold" : "medium"} tone={active ? "ink" : "muted"}>
              {option.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * أزرارٌ تُنتقى بلمسة — للحالات الشائعة التي يشقّ كتابتها على لوحة مفاتيح الهاتف.
 *
 * الكتابة بالعربية على الهاتف أبطأ من الإنجليزية، ومريضٌ في الخمسين يكتب
 * «سكري» بثلاث محاولات. اللمسة الواحدة تسبق الحقل الحرّ ولا تلغيه.
 */
export function Chips({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[];
  selected: readonly string[];
  onToggle: (value: string) => void;
}) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onToggle(option)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space(1.5),
              paddingHorizontal: space(3.5),
              paddingVertical: space(2.25),
              borderRadius: radius.pill,
              backgroundColor: active ? palette.primary : palette.surface2,
              borderWidth: 1.4,
              borderColor: active ? palette.primary : palette.lineStrong,
            }}
          >
            {active ? <Icon.check size={13} color={palette.onPrimary} weight={2.4} /> : null}
            <T size={13.5} weight={active ? "bold" : "medium"} tone={active ? "onPrimary" : "ink"}>
              {option}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── الحقول ──────────────────────────────────────────────────── */

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
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
          borderWidth: 1.4,
          borderColor: palette.line,
          borderRadius: radius.md,
          paddingHorizontal: space(4),
          paddingVertical: space(3),
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

export function Alert({ message, tone = "danger" }: { message: string; tone?: BadgeTone }) {
  const palette = usePalette();
  const c = toneColors(palette)[tone];
  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: c.bg,
        borderRadius: radius.md,
        paddingHorizontal: space(4),
        paddingVertical: space(3.5),
      }}
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

export function EmptyState({
  title,
  hint,
  action,
  icon,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: (color: string, size: number) => ReactNode;
}) {
  const palette = usePalette();
  return (
    <View style={{ paddingVertical: space(9), paddingHorizontal: space(5), alignItems: "center", gap: space(2) }}>
      {icon ? (
        <IconTile size={58} round bg={palette.primaryTint}>
          {icon(palette.primary, 26)}
        </IconTile>
      ) : null}
      <T size={15.5} weight="semibold" align="center" style={{ marginTop: icon ? space(1) : 0 }}>
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

/** النجوم: ذهبية ممتلئة بعدد التقييم، وباقيها خطوط باهتة */
export function Stars({ value, size = 13, count }: { value: number; size?: number; count?: number }) {
  const palette = usePalette();
  const filled = Math.round(value);
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
      accessibilityLabel={`التقييم ${value} من ٥${count !== undefined ? ` من ${count} تقييم` : ""}`}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <Icon.star key={i} size={size} filled={i < filled} color={i < filled ? palette.goldBright : palette.lineStrong} />
      ))}
      {count !== undefined ? (
        <Text style={{ fontFamily: font.medium, fontSize: size - 0.5, color: palette.muted, marginRight: 3 }}>
          {toArabic(value.toFixed(1))} ({toArabic(count)})
        </Text>
      ) : null}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const palette = usePalette();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.line, marginHorizontal: inset }} />;
}
