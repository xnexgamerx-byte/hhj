import { Tabs } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icons";
import { font, shadow, usePalette } from "@/theme";

/**
 * أربعة تبويبات كما في الكيت المرجعي: بحث، عيادات، مواعيد، حساب.
 * لكل واحد شاشة بمحتوى حقيقي — تبويب فارغ يعِد بما لا يوجد.
 */
export default function TabsLayout() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();

  // المتاح للأيقونة والتسمية هو CONTENT_HEIGHT ناقص حشوَي ٦ بكسل.
  // القرص ٣٨ + سطر التسمية ١٩ = ٥٧، فـ٧٨ تترك فسحة بدل التلاصق.
  const CONTENT_HEIGHT = 78;

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
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
          ...shadow(2, palette.shadowTint),
        },
        // ارتفاع السطر يتّسع لنزول الحروف العربية — «مواعيدي» تُقصّ بدونه
        tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 11, lineHeight: 17, paddingBottom: 2 },
        tabBarIconStyle: { marginTop: 0, marginBottom: 0 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "احجز",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused}>
              <Icon.search size={20} color={focused ? palette.onPrimary : palette.faint} weight={focused ? 2 : 1.7} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="clinics"
        options={{
          title: "العيادات",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused}>
              <Icon.pin size={20} color={focused ? palette.onPrimary : palette.faint} weight={focused ? 2 : 1.7} />
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
              <Icon.calendar size={20} color={focused ? palette.onPrimary : palette.faint} weight={focused ? 2 : 1.7} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "حسابي",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused}>
              <Icon.user size={20} color={focused ? palette.onPrimary : palette.faint} weight={focused ? 2 : 1.7} />
            </TabIcon>
          ),
        }}
      />
    </Tabs>
  );
}

/** التبويب النشط قرص ممتلئ بالكحلي — أوضح من تغيير اللون وحده */
function TabIcon({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  const palette = usePalette();
  return (
    <View
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: focused ? palette.primary : "transparent",
      }}
    >
      {children}
    </View>
  );
}
