import { Tabs } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icons";
import { font, radius, shadow, usePalette } from "@/theme";

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
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopWidth: 0,
          height: CONTENT_HEIGHT + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 6,
          ...shadow(2, palette.shadowTint),
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
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused}>
              <Icon.search size={21} color={focused ? palette.primary : palette.faint} weight={focused ? 2.1 : 1.7} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "مواعيدي",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused}>
              <Icon.calendar size={21} color={focused ? palette.primary : palette.faint} weight={focused ? 2.1 : 1.7} />
            </TabIcon>
          ),
        }}
      />
    </Tabs>
  );
}

/** التبويب النشط يجلس على وسادة خضراء — أوضح من تغيير اللون وحده */
function TabIcon({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  const palette = usePalette();
  return (
    <View
      style={{
        width: 54,
        height: 32,
        borderRadius: radius.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: focused ? palette.primarySoft : "transparent",
      }}
    >
      {children}
    </View>
  );
}
