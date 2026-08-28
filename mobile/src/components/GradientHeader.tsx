import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { headerGradient, radius, space, usePalette } from "@/theme";
import { Icon } from "@/components/icons";
import { T } from "@/components/ui";

/**
 * ترويسة زمرّدية متدرّجة بحافة سفلية منحنية.
 *
 * المنحنى كبير عمداً (٣٤) — الحافة المستقيمة تقطع الشاشة نصفين، والمنحنى
 * يجعل المحتوى يبدو خارجاً منها. والبطاقات التي تليها تعلو عليه بهامش سالب.
 */
export function GradientHeader({
  children,
  back,
  title,
  right,
  /** كم ينزل المحتوى تحت الترويسة ليعلو عليها (بطاقة بحث مثلاً) */
  overlap = 0,
}: {
  children?: ReactNode;
  back?: boolean;
  title?: string;
  right?: ReactNode;
  overlap?: number;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <LinearGradient
      colors={headerGradient(palette)}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{
        paddingTop: insets.top + space(2),
        paddingHorizontal: space(4),
        paddingBottom: overlap > 0 ? overlap + space(4) : space(5),
        borderBottomLeftRadius: radius.xxl,
        borderBottomRightRadius: radius.xxl,
        gap: space(3),
      }}
    >
      {back || title || right ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space(3), minHeight: 40 }}>
          {back ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="رجوع"
              onPress={() => router.back()}
              hitSlop={10}
              style={{
                width: 40,
                height: 40,
                borderRadius: radius.md,
                backgroundColor: "rgba(255,255,255,0.16)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* في الواجهة العربية الرجوع يشير يميناً */}
              <Icon.chevronRight size={20} color="#FFFFFF" />
            </Pressable>
          ) : null}
          {title ? (
            <T size={18} weight="bold" tone="onPrimary" numberOfLines={1} style={{ flex: 1 }}>
              {title}
            </T>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {right}
        </View>
      ) : null}
      {children}
    </LinearGradient>
  );
}

/** زر دائري شفّاف يوضع في ترويسة متدرّجة */
export function HeaderButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress?: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: pressed ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.16)",
        alignItems: "center",
        justifyContent: "center",
      })}
    >
      {children}
    </Pressable>
  );
}
