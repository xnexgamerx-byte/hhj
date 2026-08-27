import { Tabs } from "expo-router";
import { Text, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, usePalette } from "@/theme";

/**
 * تبويبان فقط: البحث والحجوزات.
 * تبويب لكل شيء يجعل الشريط مزدحماً وبلا معنى — والمريض يفعل شيئين لا أكثر:
 * يبحث عن طبيب، ويتابع مواعيده.
 */
export default function TabsLayout() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();

  // ارتفاع المحتوى ثابت، والمنطقة الآمنة تُضاف فوقه.
  // تثبيت الارتفاع الكلي يبتلع المنطقة الآمنة فيقع الشريط تحت شريط الإيماءات،
  // وتركه للحساب التلقائي يعطي شريطاً يضغط التسمية العربية حتى تختفي.
  const CONTENT_HEIGHT = 70;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.faint,
        // بلا ارتفاع ثابت: React Navigation يضيف المنطقة الآمنة من تلقائه،
        // وتثبيت الارتفاع يلغيها فيقع الشريط تحت شريط الإيماءات في الآيفون
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.line,
          borderTopWidth: 1,
          height: CONTENT_HEIGHT + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
        },
        // ارتفاع السطر يتّسع لنزول الحروف العربية — «مواعيدي» تُقصّ بدونه
        tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 12, lineHeight: 18, paddingBottom: 2 },
        tabBarIconStyle: { marginTop: 0, marginBottom: 0 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "احجز",
          tabBarIcon: ({ color, focused }) => <TabGlyph glyph="⌕" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "مواعيدي",
          tabBarIcon: ({ color, focused }) => <TabGlyph glyph="◷" color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

/** رمز نصي بدل مكتبة أيقونات — أخفّ، ويكفي لتبويبين. */
function TabGlyph({ glyph, color, focused }: { glyph: string; color: ColorValue; focused: boolean }) {
  return (
    <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: focused ? 20 : 18, color, lineHeight: 24 }}>{glyph}</Text>
    </View>
  );
}
