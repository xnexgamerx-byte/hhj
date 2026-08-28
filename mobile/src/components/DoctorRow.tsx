import { View } from "react-native";
import { Icon } from "@/components/icons";
import { Avatar, Badge, Button, Card, Stars, T } from "@/components/ui";
import type { DoctorCard } from "@/lib/api";
import { formatFee } from "@/lib/format";
import { space, usePalette } from "@/theme";

/**
 * بطاقة الطبيب في القوائم: صورة، اسم، تخصص، موقع، تقييم، سعر، وأقرب موعد.
 * أقرب موعد في الأسفل عمداً — هو ما يقرّر الضغطة، فيبقى بجانب الزر.
 */
export function DoctorRow({ doctor, onPress }: { doctor: DoctorCard; onPress: () => void }) {
  const palette = usePalette();
  const practice = doctor.practices[0];
  const name = `${doctor.title} ${doctor.fullName}`.trim();

  return (
    <Card onPress={onPress} padded={false} style={{ padding: space(3.5) }}>
      <View style={{ flexDirection: "row", gap: space(3.5), alignItems: "center" }}>
        <Avatar name={doctor.fullName} size={58} ring />

        <View style={{ flex: 1, gap: space(1) }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
            <T size={15} weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
              {name}
            </T>
            {doctor.ratingCount >= 3 && doctor.ratingAvg >= 4.5 ? (
              <Badge label="مميّز" tone="gold" solid icon={(c, s) => <Icon.star size={s} color={c} filled />} />
            ) : null}
          </View>

          <T size={12.5} tone="primary" weight="semibold" numberOfLines={1}>
            {doctor.specialties.join(" · ")}
          </T>

          {practice ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Icon.pin size={13} color={palette.faint} />
              <T size={12} tone="faint" numberOfLines={1} style={{ flex: 1 }}>
                {practice.district}، {practice.clinicName}
              </T>
            </View>
          ) : null}

          <View style={{ flexDirection: "row", alignItems: "center", gap: space(3), marginTop: space(0.5) }}>
            {doctor.ratingCount > 0 ? (
              <Stars value={doctor.ratingAvg} size={12} count={doctor.ratingCount} />
            ) : (
              <T size={11.5} tone="faint">
                جديد
              </T>
            )}
            <View style={{ flex: 1 }} />
            {practice ? (
              <T size={12.5} weight="semibold" tone="ink">
                {formatFee(practice.feeAmount)}
              </T>
            ) : null}
          </View>
        </View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: space(2), marginTop: space(3) }}>
        <View style={{ flex: 1, flexDirection: "row", flexShrink: 1 }}>
          {doctor.nextAvailable ? (
            <Badge
              label={`أقرب موعد ${doctor.nextAvailable.weekdayName}`}
              tone="ok"
              icon={(c, s) => <Icon.clock size={s} color={c} />}
            />
          ) : (
            <Badge label="لا مواعيد معروضة" tone="muted" />
          )}
        </View>
        <Button label="حجز موعد" size="sm" onPress={onPress} />
      </View>
    </Card>
  );
}

