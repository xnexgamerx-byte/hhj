import { useEffect } from "react";
import { I18nManager } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { font, usePalette } from "@/theme";
import { ThemeProvider, useThemeMode } from "@/theme-mode";

/**
 * التطبيق عربي بالكامل، فنفرض اتجاه اليمين إلى اليسار قبل أي رسم.
 * على أندرويد وآيفون يحتاج التبديل إعادة تشغيل مرة واحدة عند أول فتح، لذلك
 * يُستدعى على مستوى الوحدة لا داخل مكوّن. وعلى الويب يكمله dir="rtl"
 * في ملف ‎+html.tsx لأن التخطيط هناك يتبع اتجاه المستند.
 */
if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

// مع مخرَج الويب أحادي الصفحة يُبنى index.html مسبقاً ولا يمرّ عبر ‎+html.tsx،
// فنضبط الاتجاه على المستند وقت الإقلاع قبل أول رسم.
if (typeof document !== "undefined") {
  document.documentElement.dir = "rtl";
  document.documentElement.lang = "ar";
}

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    [font.regular]: require("../assets/fonts/IBMPlexSansArabic-400.ttf"),
    [font.medium]: require("../assets/fonts/IBMPlexSansArabic-500.ttf"),
    [font.semibold]: require("../assets/fonts/IBMPlexSansArabic-600.ttf"),
    [font.bold]: require("../assets/fonts/IBMPlexSansArabic-700.ttf"),
  });

  useEffect(() => {
    // نُخفي شاشة البداية عند جهوزية الخطوط، أو عند فشلها حتى لا يعلق التطبيق
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  // المزوّد يلفّ كل ما يقرأ اللوحة، وهذا يشمل هذه الشاشة نفسها — فالمحتوى
  // في مكوّن داخلي لا في الجذر
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <Shell />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

function Shell() {
  const palette = usePalette();
  const { resolved } = useThemeMode();

  return (
    <>
      {/* صريحاً لا "auto": الأخير يتبع سمة النظام، فيبقى فاتحاً على ثيمٍ داكن ثبّته المستخدم */}
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.bg },
          animation: "slide_from_left",
        }}
      />
    </>
  );
}
