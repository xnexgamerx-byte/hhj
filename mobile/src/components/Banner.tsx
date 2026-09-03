import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Image, Platform, Pressable, View, type ViewToken } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Icon } from "@/components/icons";
import { T } from "@/components/ui";
import { mediaUrl, type BannerItem } from "@/lib/api";
import { useReduceMotion } from "@/motion";
import { radius, space, usePalette } from "@/theme";

export type Slide = {
  key: string;
  title: string | null;
  body: string | null;
  imageUrl?: string | null;
  icon?: (color: string, size: number) => React.ReactNode;
};

/** بعد أن يرفع المستخدم إصبعه، تعود اللافتة إلى التبديل بعد هذه المهلة */
const RESUME_AFTER_MS = 6000;

/**
 * لافتة منزلقة بنقاط أسفلها — عنصر الواجهة الأبرز في الرئيسية.
 *
 * القائمة FlatList لا ScrollView: اشتقاق رقم الشريحة من contentOffset.x
 * يحتاج حسابَ اتجاه في الواجهة العربية لأن المتصفّحات تختلف في إشارة
 * scrollLeft، بينما onViewableItemsChanged يعطي الشريحة الظاهرة مباشرة.
 *
 * وتبدّل تلقائياً بالمدّة التي يضبطها المالك. كان التبديل ممتنعاً هنا لأنه
 * يقطع القراءة ويسرق الضغطة إن تحرّك تحت الإصبع — وهذا اعتراضٌ صحيح لا
 * يُلغى بإضافة مؤقّت، بل بثلاثة قيود:
 *   • يتوقّف فور لمس المريض اللافتة، ولا يعود إلا بعد ست ثوانٍ من رفع إصبعه.
 *   • يقف تماماً لمن فعّل «تقليل الحركة» في إعدادات هاتفه.
 *   • ينتقل بانزلاقٍ لا بقفزة، فالعين تلحق أين ذهبت الشريحة.
 */
export function Banner({
  slides,
  rotateSeconds,
  onPress,
}: {
  slides: Slide[];
  rotateSeconds: number;
  onPress: (slide: Slide) => void;
}) {
  const palette = usePalette();
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const reduceMotion = useReduceMotion();
  const listRef = useRef<FlatList<Slide>>(null);

  // مهلةٌ يُؤجَّل إليها استئناف التبديل بعد تدخّل المريض
  const heldUntil = useRef(0);
  const indexRef = useRef(0);
  indexRef.current = index;

  /**
   * ينتقل إلى شريحةٍ بعينها.
   *
   * على الهاتف: `scrollToIndex` وكفى، فـReact Native يعرف اتجاه واجهته.
   *
   * على الويب المسألة أدقّ. اتجاه هذا التطبيق عربيٌّ بالـCSS (dir="rtl" على
   * الوثيقة)، بينما `I18nManager.isRTL` في react-native-web يبقى false — فلا
   * تُطبّق VirtualizedList تحويلَها للاتجاه المعكوس وتمرّر الإزاحة كما هي، ثم
   * يصطدم الرقم الموجب بحاويةٍ يبدأ فيها scrollLeft من صفر ويهبط إلى السالب،
   * فيُقصَر إلى صفر ولا يتحرّك شيء: مؤقّتٌ يعمل ولافتةٌ ساكنة.
   *
   * لذلك نمرّر على عنصر الويب مباشرةً، ونستنبط الإشارة من اتجاهه المحسوب لا
   * من افتراض: القياس يصحّ في الحالتين، والافتراض يصحّ في واحدة.
   */
  const jumpTo = useCallback(
    (target: number) => {
      const list = listRef.current;
      if (!list || width === 0) return;

      if (Platform.OS !== "web") {
        list.scrollToIndex({ index: target, animated: true });
        return;
      }

      const node = list.getScrollableNode() as unknown as HTMLElement | null;
      if (!node?.scroll) return;
      const rtl = typeof getComputedStyle === "function" && getComputedStyle(node).direction === "rtl";
      node.scroll({ left: (rtl ? -1 : 1) * width * target, behavior: "smooth" });
      // النقاط تتبع onViewableItemsChanged، وهو لا يستيقظ لتمريرٍ برمجيّ على
      // الويب. فنقدّم الرقم بأنفسنا هنا، ويصحّحه الحدث حين يمرّر المريض بيده.
      setIndex(target);
    },
    [width],
  );

  useEffect(() => {
    if (reduceMotion || slides.length < 2 || width === 0) return;
    const every = Math.max(2, rotateSeconds) * 1000;
    const timer = setInterval(() => {
      if (Date.now() < heldUntil.current) return;
      jumpTo((indexRef.current + 1) % slides.length);
    }, every);
    return () => clearInterval(timer);
  }, [jumpTo, reduceMotion, rotateSeconds, slides.length, width]);

  // FlatList يرفض تبديل هوية onViewableItemsChanged أثناء التشغيل، فتبقى ثابتة
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const reported = viewableItems[0]?.index;
    if (reported != null) setIndex(reported);
  }).current;

  const hold = useCallback(() => {
    heldUntil.current = Date.now() + RESUME_AFTER_MS;
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Slide }) => {
      const image = mediaUrl(item.imageUrl);
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.title ?? "لافتة"}
          onPress={() => onPress(item)}
          style={{ width: width || undefined }}
        >
          <View
            style={{
              borderRadius: radius.lg,
              overflow: "hidden",
              minHeight: 132,
              backgroundColor: palette.heroTo,
            }}
          >
            {image ? (
              <Image
                source={{ uri: image }}
                style={{ position: "absolute", inset: 0 }}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            ) : null}

            {/* تعتيمٌ متدرّج فوق الصورة: صورةُ المالك قد تكون فاتحةً، والنصّ
                الأبيض عليها يختفي. وبلا نصّ لا حاجة إليه فتظهر الصورة كما هي */}
            {image && (item.title || item.body) ? (
              <LinearGradient
                colors={["rgba(9,14,20,0.78)", "rgba(9,14,20,0.30)"]}
                start={{ x: 1, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={{ position: "absolute", inset: 0 }}
              />
            ) : null}

            {!image ? (
              <LinearGradient
                colors={[palette.heroFrom, palette.heroTo]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ position: "absolute", inset: 0 }}
              />
            ) : null}

            <View
              style={{
                padding: space(5),
                flexDirection: "row",
                alignItems: "center",
                gap: space(3),
                minHeight: 132,
              }}
            >
              <View style={{ flex: 1, gap: space(1.5) }}>
                {item.title ? (
                  <T size={17.5} weight="bold" tone="onHero" lineHeight={26}>
                    {item.title}
                  </T>
                ) : null}
                {item.body ? (
                  <T size={12.5} tone="onHeroMuted" lineHeight={19}>
                    {item.body}
                  </T>
                ) : null}
              </View>
              {/* الأيقونة الكبيرة تملأ الفراغ في اللافتات النصّية وحدها */}
              {!image && item.icon ? <View style={{ opacity: 0.18 }}>{item.icon(palette.onHero, 88)}</View> : null}
            </View>
          </View>
        </Pressable>
      );
    },
    [onPress, palette, width],
  );

  return (
    <View style={{ gap: space(2.5) }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(slide) => slide.key}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        onScrollBeginDrag={hold}
        onScrollEndDrag={hold}
        onTouchStart={hold}
        // العرض معلومٌ سلفاً فلا داعي لقياس كل عنصر — وبدونه يفشل scrollToIndex
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
      />

      <View style={{ flexDirection: "row", justifyContent: "center", gap: 5 }}>
        {slides.map((slide, i) => (
          <View
            key={slide.key}
            style={{
              width: i === index ? 18 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i === index ? palette.primary : palette.lineStrong,
            }}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * اللافتات المدمجة — تظهر قبل أن يضيف المالك لافتاته، وحين يتعذّر جلبها.
 * شاشةٌ رئيسيةٌ بفراغٍ مكان اللافتة تبدو معطوبة، وهذه تشرح التطبيق أيضاً.
 */
export const DEFAULT_SLIDES = (): Slide[] => [
  {
    key: "search",
    title: "تدور على طبيب اختصاص؟",
    body: "أوقات محدّثة من الطبيب نفسه، وحجز مثبّت برقم تحفظه.",
    icon: (c, s) => <Icon.search size={s} color={c} weight={1.4} />,
  },
  {
    key: "calendar",
    title: "بلا اتصال ولا انتظار",
    body: "تشوف الأوقات الشاغرة وتحجز بضغطة — والعيادة تستلم حجزك فوراً.",
    icon: (c, s) => <Icon.calendar size={s} color={c} weight={1.4} />,
  },
  {
    key: "family",
    title: "احجز لأهلك أيضاً",
    body: "من حساب واحد تحجز لك ولأفراد عائلتك، وكل موعد برقمه.",
    icon: (c, s) => <Icon.user size={s} color={c} weight={1.4} />,
  },
];

/** يحوّل ما يعيده الخادم إلى شرائح، ويقع على المدمجة إن كانت القائمة فارغة */
export function slidesFrom(items: BannerItem[] | undefined): Slide[] {
  if (!items || items.length === 0) return DEFAULT_SLIDES();
  return items.map((item) => ({
    key: item.id,
    title: item.title,
    body: item.body,
    imageUrl: item.imageUrl,
  }));
}
