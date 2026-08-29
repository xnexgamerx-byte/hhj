import { View, useColorScheme } from "react-native";
import { Icon } from "@/components/icons";
import { Card, T } from "@/components/ui";
import type { ClinicCard as Clinic } from "@/lib/api";
import { formatFee, toArabic } from "@/lib/format";
import { font, radius, space, tintFor, usePalette } from "@/theme";
import { Text } from "react-native";

/**
 * بطاقة عيادة — أفقية في شريط الرئيسية، وعمودية في شاشة العيادات.
 * لون الرأس مشتقّ من اسم العيادة، فتبقى معروفة بلونها بين الزيارات.
 */
export function ClinicCard({
  clinic,
  onPress,
  wide,
}: {
  clinic: Clinic;
  onPress: () => void;
  /** أفقية بعرض ثابت للشريط المنزلق */
  wide?: boolean;
}) {
  const palette = usePalette();
  const isDark = useColorScheme() === "dark";
  const tint = tintFor(clinic.nameAr, isDark);

  return (
    <Card onPress={onPress} padded={false} style={wide ? { width: 244, overflow: "hidden" } : { overflow: "hidden" }}>
      {/* شريط لوني بدل الصورة. أقصر في البطاقة العمودية: بلا صورة يصير الفراغ
          الطويل مساحة ضائعة لا رأس بطاقة */}
      <View
        style={{
          height: wide ? 92 : 72,
          backgroundColor: tint.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon.pin size={34} color={tint.fg} weight={1.5} />
        {clinic.ratingCount > 0 ? (
          <View
            style={{
              position: "absolute",
              top: space(2.5),
              right: space(2.5),
              flexDirection: "row",
              alignItems: "center",
              gap: 3,
              backgroundColor: palette.surface,
              borderRadius: radius.pill,
              paddingHorizontal: space(2),
              paddingVertical: 3,
            }}
          >
            <Icon.star size={11} color={palette.goldBright} filled />
            <Text style={{ fontFamily: font.semibold, fontSize: 11, color: palette.ink }}>
              {toArabic(clinic.ratingAvg.toFixed(1))}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ padding: space(3.5), gap: space(1.5) }}>
        <T size={14.5} weight="bold" numberOfLines={1}>
          {clinic.nameAr}
        </T>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Icon.pin size={12} color={palette.faint} />
          <T size={12} tone="faint" numberOfLines={1} style={{ flex: 1 }}>
            {clinic.district}
            {clinic.landmark ? ` · ${clinic.landmark}` : ""}
          </T>
        </View>
        <T size={12} tone="muted" numberOfLines={1}>
          {clinic.specialties.join(" · ")}
        </T>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space(2), marginTop: 2 }}>
          <T size={12} weight="semibold" tone="primary">
            {toArabic(clinic.doctorCount)} طبيب
          </T>
          <View style={{ width: 1, height: 10, backgroundColor: palette.line }} />
          <T size={12} tone="muted">
            من {formatFee(clinic.minFee)}
          </T>
        </View>
      </View>
    </Card>
  );
}
