import type { ReactNode } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Icon } from "@/components/icons";
import { T } from "@/components/ui";
import { font, radius, space, usePalette } from "@/theme";

/**
 * ترويسة بيضاء بعنوان في الوسط — نمط الكيت المرجعي.
 * التدرّج الملوّن يبقى للترويسة البطلة وحدها؛ استعماله في كل شاشة يُتعب العين
 * ويسحب الانتباه من المحتوى.
 */
export function PlainHeader({
  title,
  back,
  right,
  children,
}: {
  title?: string;
  back?: boolean;
  right?: ReactNode;
  children?: ReactNode;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      style={{
        paddingTop: insets.top + space(2),
        paddingHorizontal: space(4),
        paddingBottom: space(3),
        backgroundColor: palette.surface,
        gap: space(3),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", minHeight: 42 }}>
        <View style={{ width: 42 }}>
          {back ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="رجوع"
              onPress={() => router.back()}
              hitSlop={12}
              style={({ pressed }) => ({
                width: 42,
                height: 42,
                borderRadius: 21,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? palette.surface2 : "transparent",
              })}
            >
              {/* في الواجهة العربية سهم الرجوع يشير يميناً */}
              <Icon.chevronRight size={22} color={palette.ink} />
            </Pressable>
          ) : null}
        </View>

        {title ? (
          <T size={18} weight="bold" align="center" numberOfLines={1} style={{ flex: 1 }}>
            {title}
          </T>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        <View style={{ width: 42, alignItems: "flex-end" }}>{right}</View>
      </View>
      {children}
    </View>
  );
}

/** حقل البحث الرمادي الفاتح — نفس الشكل في الرئيسية وقائمة الأطباء */
export function SearchField({
  value,
  onChangeText,
  onSubmit,
  placeholder = "ابحث باسم الطبيب أو التخصص",
  onClear,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  onClear?: () => void;
}) {
  const palette = usePalette();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space(2.5),
        backgroundColor: palette.surface2,
        borderRadius: radius.md,
        paddingHorizontal: space(4),
        height: 50,
      }}
    >
      <Icon.search size={19} color={palette.faint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        placeholder={placeholder}
        placeholderTextColor={palette.faint}
        style={{
          flex: 1,
          fontFamily: font.regular,
          fontSize: 14.5,
          color: palette.ink,
          textAlign: "right",
          height: "100%",
        }}
      />
      {value && onClear ? (
        <Pressable accessibilityRole="button" accessibilityLabel="مسح البحث" hitSlop={8} onPress={onClear}>
          <Icon.close size={17} color={palette.faint} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** الشريط السفلي الثابت للفعل الأساسي — الزر لا يُبحَث عنه بالتمرير */
export function BottomBar({ children }: { children: ReactNode }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingHorizontal: space(4),
        paddingTop: space(3),
        paddingBottom: insets.bottom + space(3),
        backgroundColor: palette.surface,
        borderTopWidth: 1,
        borderTopColor: palette.line,
      }}
    >
      {children}
    </View>
  );
}
