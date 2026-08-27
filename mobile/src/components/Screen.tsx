import type { ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { font, radius, space, usePalette } from "@/theme";
import { T } from "./ui";
import { Text } from "react-native";

/** إطار الشاشة: شريط علوي، ومساحة آمنة، وتمرير. */
export function Screen({
  title,
  subtitle,
  back,
  children,
  scroll = true,
  footer,
  onRefresh,
  refreshing,
}: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  /** السحب للتحديث — يتوقّعه المستخدم في أي قائمة على الجوال */
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const body = (
    <View style={{ paddingHorizontal: space(4), paddingBottom: space(8), gap: space(4) }}>{children}</View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg, paddingTop: insets.top }}>
      {(title || back) && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space(3),
            paddingHorizontal: space(4),
            paddingVertical: space(3),
            borderBottomWidth: 1,
            borderBottomColor: palette.line,
            backgroundColor: palette.surface,
          }}
        >
          {back && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="رجوع"
              onPress={() => router.back()}
              hitSlop={12}
              style={{
                width: 34,
                height: 34,
                borderRadius: radius.md,
                backgroundColor: palette.surface2,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* السهم يشير يميناً لأن الرجوع في الواجهة العربية يمين */}
              <Text style={{ fontSize: 18, color: palette.ink, lineHeight: 22 }}>›</Text>
            </Pressable>
          )}
          <View style={{ flex: 1 }}>
            {title ? (
              <Text style={{ fontFamily: font.bold, fontSize: 17, color: palette.ink, textAlign: "right" }}>
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <T size={12.5} tone="faint" numberOfLines={1}>
                {subtitle}
              </T>
            ) : null}
          </View>
        </View>
      )}

      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingTop: space(4) }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
            ) : undefined
          }
        >
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingTop: space(4) }}>{body}</View>
      )}

      {footer ? (
        <View
          style={{
            paddingHorizontal: space(4),
            paddingTop: space(3),
            paddingBottom: insets.bottom + space(3),
            borderTopWidth: 1,
            borderTopColor: palette.line,
            backgroundColor: palette.surface,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}
