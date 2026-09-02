import { View } from "react-native";
import { Icon } from "@/components/icons";
import { Badge, Card, T } from "@/components/ui";
import type { DoctorCard } from "@/lib/api";
import { formatFee, toArabic } from "@/lib/format";
import { font, radius, space, tintFor, useIsDark, usePalette } from "@/theme";
import { Text } from "react-native";

/**
 * بطاقة الطبيب في القوائم — بنية الكيت المرجعي: مربّع ملوّن، اسم، خطّ فاصل،
 * ثم التخصص والموقع والتقييم. البطاقة كلّها قابلة للضغط فلا حاجة لزر داخلها.
 * لون المربّع مشتقّ من اسم التخصص، فأطباء التخصص الواحد يتشاركون لوناً.
 */
export function DoctorRow({ doctor, onPress }: { doctor: DoctorCard; onPress: () => void }) {
  const palette = usePalette();
  const isDark = useIsDark();
  const practice = doctor.practices[0];
  const specialty = doctor.specialties[0] ?? "طب عام";
  const tint = tintFor(specialty, isDark);
  const initial = doctor.fullName.trim().charAt(0);

  return (
    <Card onPress={onPress} padded={false} style={{ padding: space(3.5) }}>
      <View style={{ flexDirection: "row", gap: space(3.5) }}>
        <View
          style={{
            width: 86,
            height: 96,
            borderRadius: radius.md,
            backgroundColor: tint.bg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontFamily: font.bold, fontSize: 34, color: tint.fg }}>{initial}</Text>
        </View>

        <View style={{ flex: 1, gap: space(1.5) }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
            <T size={15} weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
              {doctor.title} {doctor.fullName}
            </T>
            {doctor.ratingCount >= 3 && doctor.ratingAvg >= 4.5 ? (
              <Badge label="مميّز" tone="gold" solid icon={(c, s) => <Icon.star size={s} color={c} filled />} />
            ) : null}
          </View>

          <View style={{ height: 1, backgroundColor: palette.line }} />

          <T size={13} tone="muted" numberOfLines={1}>
            {doctor.specialties.join(" · ")}
          </T>

          {practice ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Icon.pin size={13} color={palette.faint} />
              <T size={12.5} tone="faint" numberOfLines={1} style={{ flex: 1 }}>
                {practice.district}، {practice.clinicName}
              </T>
            </View>
          ) : null}

          <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
            {doctor.ratingCount > 0 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Icon.star size={13} color={palette.goldBright} filled />
                <T size={12.5} weight="semibold">
                  {toArabic(doctor.ratingAvg.toFixed(1))}
                </T>
                <T size={12} tone="faint">
                  ({toArabic(doctor.ratingCount)})
                </T>
              </View>
            ) : (
              <T size={12} tone="faint">
                طبيب جديد
              </T>
            )}
            {practice ? (
              <>
                <View style={{ width: 1, height: 11, backgroundColor: palette.line }} />
                <T size={12.5} weight="semibold" tone="muted">
                  {formatFee(practice.feeAmount)}
                </T>
              </>
            ) : null}
          </View>
        </View>
      </View>

      {doctor.nextAvailable ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space(1.5),
            marginTop: space(3),
            paddingTop: space(3),
            borderTopWidth: 1,
            borderTopColor: palette.line,
          }}
        >
          <Icon.clock size={14} color={palette.ok} />
          <T size={12.5} weight="semibold" tone="ok">
            أقرب موعد {doctor.nextAvailable.weekdayName}
          </T>
          <View style={{ flex: 1 }} />
          <T size={12} tone="faint">
            {toArabic(doctor.nextAvailable.freeCount)} مكان
          </T>
        </View>
      ) : null}
    </Card>
  );
}
