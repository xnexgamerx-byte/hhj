import { useCallback, useRef, useState } from "react";
import { FlatList, Pressable, View, type ViewToken } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Icon } from "@/components/icons";
import { T } from "@/components/ui";
import { radius, space, usePalette } from "@/theme";

export type Slide = { title: string; body: string; icon: (color: string, size: number) => React.ReactNode };

/**
 * لافتة منزلقة بنقاط أسفلها — عنصر الكيت الأبرز في الرئيسية.
 *
 * القائمة FlatList لا ScrollView: اشتقاق رقم الشريحة من contentOffset.x
 * يحتاج حسابَ اتجاه في الواجهة العربية لأن المتصفّحات تختلف في إشارة
 * scrollLeft، بينما onViewableItemsChanged يعطي الشريحة الظاهرة مباشرة.
 *
 * ولا تبديل تلقائي: يقطع القراءة، ويسرق الضغطة إن بدّل تحت الإصبع.
 */
export function Banner({ slides, onPress }: { slides: Slide[]; onPress: () => void }) {
  const palette = usePalette();
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);

  // FlatList يرفض تبديل هوية onViewableItemsChanged أثناء التشغيل، فتبقى ثابتة
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const reported = viewableItems[0]?.index;
    if (reported != null) setIndex(reported);
  }).current;

  const renderItem = useCallback(
    ({ item }: { item: Slide }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.title}
        onPress={onPress}
        style={{ width: width || undefined }}
      >
        <LinearGradient
          colors={[palette.heroFrom, palette.heroTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: radius.lg,
            padding: space(5),
            flexDirection: "row",
            alignItems: "center",
            gap: space(3),
            overflow: "hidden",
            minHeight: 132,
          }}
        >
          <View style={{ flex: 1, gap: space(1.5) }}>
            <T size={17.5} weight="bold" tone="onHero" lineHeight={26}>
              {item.title}
            </T>
            <T size={12.5} tone="onHeroMuted" lineHeight={19}>
              {item.body}
            </T>
          </View>
          {/* الأيقونة الكبيرة تملأ الفراغ الذي تشغله صورة الطبيب في الكيت */}
          <View style={{ opacity: 0.18 }}>{item.icon(palette.onHero, 88)}</View>
        </LinearGradient>
      </Pressable>
    ),
    [onPress, palette, width],
  );

  return (
    <View style={{ gap: space(2.5) }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <FlatList
        data={slides}
        keyExtractor={(slide) => slide.title}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
      />

      <View style={{ flexDirection: "row", justifyContent: "center", gap: 5 }}>
        {slides.map((slide, i) => (
          <View
            key={slide.title}
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

export const DEFAULT_SLIDES = (): Slide[] => [
  {
    title: "تدور على طبيب اختصاص؟",
    body: "أوقات محدّثة من الطبيب نفسه، وحجز مثبّت برقم مرجعي.",
    icon: (c, s) => <Icon.search size={s} color={c} weight={1.4} />,
  },
  {
    title: "بلا اتصال ولا انتظار",
    body: "تشوف الأوقات الشاغرة وتحجز بضغطة — والعيادة تستلم حجزك فوراً.",
    icon: (c, s) => <Icon.calendar size={s} color={c} weight={1.4} />,
  },
  {
    title: "احجز لأهلك أيضاً",
    body: "من حساب واحد تحجز لك ولأفراد عائلتك، وكل موعد بورقته.",
    icon: (c, s) => <Icon.user size={s} color={c} weight={1.4} />,
  },
];
