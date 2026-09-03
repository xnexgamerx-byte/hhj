import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { useReduceMotion } from "@/motion";

/** نفس لون شاشة البداية في app.json — أي فرقٍ هنا يظهر ومضةً عند التسليم */
const BRAND_BG = "#0E5140";
/** نفس imageWidth في إعداد expo-splash-screen، فلا تقفز العلامة حجماً */
const IMAGE_WIDTH = 320;

const NATIVE_DRIVER = Platform.OS !== "web";

/**
 * الانتقال من شاشة البداية إلى التطبيق.
 *
 * شاشة البداية الأصلية صورةٌ ساكنة يرسمها النظام قبل أن يبدأ جافاسكربت، ولا
 * سبيل إلى تحريكها. فنضع فوقها طبقةً تطابقها تماماً — اللون نفسه والصورة
 * نفسها بالعرض نفسه — ثم نُخفي شاشة النظام تحتها. التسليم غير مرئي: ما يراه
 * المريض صورةٌ واحدة لم تتغيّر، ثم تبدأ بالحركة.
 *
 * والحركة نبضة: تنكمش العلامة قليلاً ثم تتمدّد وتنفتح على التطبيق. اخترتُها
 * لأنها تعني شيئاً في تطبيق طبّي، ولأن الخروج أصدق من الدخول هنا — العلامة
 * كانت معروضةً ساكنةً قبل هذه اللحظة، فحركةُ ظهورٍ عليها تبدو قفزة.
 *
 * وتُلغى كاملةً لمن فعّل «تقليل الحركة»: تُرفع الطبقة فوراً بلا تلاشٍ.
 */
export function SplashGate({ children }: { children: ReactNode }) {
  const reduceMotion = useReduceMotion();
  const [covered, setCovered] = useState(true);
  const scale = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(1)).current;

  // إخفاء شاشة النظام بعد أول إطارٍ تُرسم فيه طبقتنا، لا قبله: العكس يكشف
  // التطبيق للحظةٍ ثم تغطّيه الطبقة — ومضةٌ بيضاء في منتصف الإقلاع
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      SplashScreen.hideAsync().catch(() => {});
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!covered) return;
    if (reduceMotion) {
      setCovered(false);
      return;
    }

    const run = Animated.parallel([
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 0.95,
          duration: 150,
          easing: Easing.in(Easing.quad),
          useNativeDriver: NATIVE_DRIVER,
        }),
        Animated.timing(scale, {
          toValue: 1.14,
          duration: 330,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: NATIVE_DRIVER,
        }),
      ]),
      // التلاشي يبدأ مع التمدّد لا بعده: الطبقة تنفتح على التطبيق بدل أن
      // تكمل حركتها ثم تختفي في خطوةٍ ثانية
      Animated.sequence([
        Animated.delay(260),
        Animated.timing(fade, {
          toValue: 0,
          duration: 320,
          easing: Easing.out(Easing.quad),
          useNativeDriver: NATIVE_DRIVER,
        }),
      ]),
    ]);

    run.start(({ finished }) => {
      if (finished) setCovered(false);
    });
    return () => run.stop();
  }, [covered, fade, reduceMotion, scale]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {covered ? (
        <Animated.View
          // لا تلتقط اللمس: الطبقة تتلاشى وقد يضغط المريض تحتها قبل أن تُرفع
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: BRAND_BG, alignItems: "center", justifyContent: "center", opacity: fade },
          ]}
        >
          <Animated.Image
            source={require("../../assets/splash-icon.png")}
            resizeMode="contain"
            style={{ width: IMAGE_WIDTH, height: IMAGE_WIDTH, transform: [{ scale }] }}
            accessibilityIgnoresInvertColors
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
