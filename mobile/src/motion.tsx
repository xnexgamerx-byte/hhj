/**
 * الحركة في التطبيق: ظهورٌ متدرّج للقوائم، ونبضةٌ لما يستحقّ الانتباه.
 *
 * القاعدة التي بُني عليها هذا الملف: الحركة تشرح ولا تزيّن. القائمة التي
 * تظهر عناصرها واحداً بعد واحد تقول «هذه عناصر منفصلة وهذا ترتيبها»، والرقم
 * الذي ينبض عند تثبيت الحجز يقول «هذا ما يجب أن تحفظه». وما لا يقول شيئاً
 * لا يتحرّك — الحركة بلا معنى تؤخّر القراءة وتُتعب العين.
 *
 * وAnimated المدمج لا Reanimated: ما نحتاجه شفافيةٌ وإزاحةٌ وحجم، وهذه
 * يؤدّيها المدمج بلا إضافة Babel ولا worklets ولا اختلافٍ في السلوك بين
 * الجوال والويب — وأقلُّ الطرق أجزاءً أقلُّها عطباً.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, type StyleProp, type ViewStyle } from "react-native";

/**
 * المشغّل الأصلي على الجوال وحده.
 *
 * على الويب لا وحدة أصلية، فتطلبها react-native-web يعني تحذيراً في السجلّ
 * ثم سقوطاً إلى JavaScript على أي حال. نطلبها حيث تُلبّى فقط.
 */
const NATIVE_DRIVER = Platform.OS !== "web";

/* ── تقليل الحركة ─────────────────────────────────────────────── */

/**
 * جواب النظام محفوظٌ على مستوى الوحدة لا في كل مكوّن.
 *
 * السؤال غير متزامن، ولو سألته كل بطاقةٍ عند تركيبها لبدأت البطاقات تتحرّك
 * ثم تتجمّد حين يصل الجواب — وهو أسوأ ما يمكن أن يراه من طلب ألّا تتحرّك
 * الشاشة. فنسأل مرّةً واحدة عند أول استعمال، ويقرأ الباقون الجواب المحفوظ
 * فوراً. والاشتراك في تغيّر الإعداد يبقى ما بقي التطبيق: مستمعٌ واحد لا
 * يُنزع، لأن الوحدة نفسها لا تُفرَغ.
 */
let cached = false;
let asked = false;
const listeners = new Set<(value: boolean) => void>();

function publish(value: boolean) {
  if (value === cached) return;
  cached = value;
  for (const listener of listeners) listener(value);
}

export function useReduceMotion(): boolean {
  const [value, setValue] = useState(cached);

  useEffect(() => {
    listeners.add(setValue);
    if (!asked) {
      asked = true;
      AccessibilityInfo.isReduceMotionEnabled().then(publish).catch(() => {});
      AccessibilityInfo.addEventListener("reduceMotionChanged", publish);
    }
    // ربما وصل الجواب بين أول رسمٍ وهذا الأثر
    setValue(cached);
    return () => {
      listeners.delete(setValue);
    };
  }, []);

  return value;
}

/* ── الظهور المتدرّج ──────────────────────────────────────────── */

/** الفارق بين بطاقةٍ وتاليتها */
const STEP_MS = 45;

/**
 * سقفُ التدرّج.
 *
 * بلا سقف تنتظر البطاقة الأربعون ثانيتين قبل أن تظهر — وهذا ليس تدرّجاً بل
 * تحميلٌ بطيء. الغاية أن تُدرك العين أن العناصر متتابعة، وستّ خطواتٍ تكفي.
 */
const MAX_STEPS = 6;

const RISE = 10;

/**
 * بطاقةٌ تظهر صاعدةً بعد سابقتها.
 *
 * يعمل عند التركيب وحده، فإعادة ترتيب القائمة أو تحديث حالة بطاقة لا تعيد
 * الحركة — البطاقات تبقى بمفاتيحها فلا تُركَّب من جديد. وهذا مقصود: قائمةٌ
 * تُعيد الرقص كلما ضغط الطبيب «حضر» مزعجة.
 */
export function Appear({
  index = 0,
  children,
  style,
}: {
  index?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(cached ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    const run = Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      delay: Math.min(index, MAX_STEPS) * STEP_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: NATIVE_DRIVER,
    });
    run.start();
    // الإيقاف عند الإزالة: بطاقةٌ خرجت من الشاشة قبل أن تكمل ظهورها لا يجوز
    // أن تُبقي مؤقّتاً يكتب في حالةٍ زالت
    return () => run.stop();
  }, [index, progress, reduceMotion]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/* ── النبضة ──────────────────────────────────────────────────── */

/**
 * يكبر من الصغر إلى حجمه بارتدادةٍ خفيفة.
 *
 * للرقم الذي يُعطى للمريض عند تثبيت حجزه: هو الشيء الوحيد في تلك الشاشة
 * الذي عليه أن يحفظه، والحركة تدلّ عليه قبل أن يقرأ كلمةً واحدة.
 */
export function Pop({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(cached ? 1 : 0.7)).current;

  useEffect(() => {
    if (reduceMotion) {
      scale.setValue(1);
      return;
    }
    const run = Animated.spring(scale, {
      toValue: 1,
      delay,
      friction: 5,
      tension: 90,
      useNativeDriver: NATIVE_DRIVER,
    });
    run.start();
    return () => run.stop();
  }, [delay, reduceMotion, scale]);

  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}
