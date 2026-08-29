import { useEffect, useState } from "react";
import { Linking, ScrollView, View, useColorScheme } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PlainHeader, BottomBar } from "@/components/PlainHeader";
import { StatRow } from "@/components/Stats";
import { Icon } from "@/components/icons";
import { Alert, Avatar, Badge, Button, Card, IconTile, Loading, SectionHeader, Stars, T } from "@/components/ui";
import { api, type DoctorProfile, type Review } from "@/lib/api";
import { formatTimeLabel, statNumber, toArabic, WEEKDAYS } from "@/lib/format";
import { font, radius, space, tintFor, usePalette } from "@/theme";
import { Text } from "react-native";

/**
 * صفحة الطبيب: تعريف وأرقام وآراء، والحجز في شاشة تالية.
 * دمج الاثنتين كان يعطي صفحة طويلة يضيع فيها زر الحجز تحت التمرير.
 */
export default function DoctorScreen() {
  const palette = usePalette();
  const isDark = useColorScheme() === "dark";
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [practiceId, setPracticeId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DoctorProfile>(`/doctors/${id}`)
      .then((data) => {
        setProfile(data);
        setPracticeId(data.practices[0]?.id ?? null);
      })
      .catch((e) => setError(e.message));
    api.get<Review[]>(`/doctors/${id}/reviews`).then(setReviews).catch(() => {});
  }, [id]);

  const practice = profile?.practices.find((p) => p.id === practiceId);

  if (error && !profile) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <PlainHeader back title="الطبيب" />
        <View style={{ padding: space(4) }}>
          <Alert message={error} />
        </View>
      </View>
    );
  }
  if (!profile || !practice) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <PlainHeader back title="الطبيب" />
        <Loading />
      </View>
    );
  }

  const tint = tintFor(profile.specialties[0] ?? "طب عام", isDark);
  const shownReviews = showAllReviews ? reviews : reviews.slice(0, 2);

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <PlainHeader back title="بيانات الطبيب" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space(4), paddingBottom: space(8), gap: space(5) }}
      >
        {/* ── التعريف ── */}
        <Card level={2} style={{ gap: space(3.5) }}>
          <View style={{ flexDirection: "row", gap: space(3.5) }}>
            <View
              style={{
                width: 92,
                height: 100,
                borderRadius: radius.md,
                backgroundColor: tint.bg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontFamily: font.bold, fontSize: 38, color: tint.fg }}>
                {profile.fullName.trim().charAt(0)}
              </Text>
            </View>

            <View style={{ flex: 1, gap: space(2) }}>
              <T size={17} weight="bold" numberOfLines={2}>
                {profile.title} {profile.fullName}
              </T>
              <View style={{ height: 1, backgroundColor: palette.line }} />
              <T size={13.5} tone="muted" numberOfLines={2}>
                {profile.specialties.join(" · ")}
              </T>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Icon.pin size={14} color={palette.faint} />
                <T size={12.5} tone="faint" numberOfLines={2} style={{ flex: 1 }}>
                  {practice.clinicName}، {practice.district}
                </T>
              </View>
            </View>
          </View>

          {practice.bookingMode === "QUEUE" ? (
            <View style={{ flexDirection: "row" }}>
              <Badge label="نظام أدوار — تحضر ضمن الفترة" tone="gold" icon={(c, s) => <Icon.ticket size={s} color={c} />} />
            </View>
          ) : null}
        </Card>

        {/* ── الأرقام ── */}
        <StatRow
          items={[
            {
              icon: (c, s) => <Icon.star size={s} color={c} filled={profile.ratingCount > 0} />,
              value: profile.ratingCount > 0 ? toArabic(profile.ratingAvg.toFixed(1)) : "—",
              label: "التقييم",
            },
            {
              icon: (c, s) => <Icon.user size={s} color={c} />,
              value: statNumber(profile.ratingCount),
              label: "رأي",
            },
            {
              icon: (c, s) => <Icon.sparkle size={s} color={c} />,
              value: profile.yearsOfExperience ? `+${toArabic(profile.yearsOfExperience)}` : "—",
              label: "سنة خبرة",
            },
            {
              icon: (c, s) => <Icon.ticket size={s} color={c} />,
              value: toArabic(practice.feeAmount.toLocaleString("en-US")),
              label: "دينار",
            },
          ]}
        />

        {/* ── نبذة ── */}
        {profile.bio ? (
          <View style={{ gap: space(2) }}>
            <T size={16.5} weight="bold">
              نبذة
            </T>
            <T size={14} tone="muted" lineHeight={23}>
              {profile.bio}
            </T>
          </View>
        ) : null}

        {/* ── الدوام والعيادة ── */}
        <View style={{ gap: space(3) }}>
          <T size={16.5} weight="bold">
            أوقات الدوام
          </T>
          {practice.schedules.length > 0 ? (
            <View style={{ gap: space(2) }}>
              {practice.schedules.map((schedule, index) => (
                <View key={index} style={{ flexDirection: "row", alignItems: "center", gap: space(2.5) }}>
                  <IconTile size={34} round bg={palette.primaryTint}>
                    <Icon.clock size={17} color={palette.primary} />
                  </IconTile>
                  <T size={13.5} tone="muted" style={{ flex: 1 }}>
                    {WEEKDAYS[schedule.weekday]} · {formatTimeLabel(schedule.startTime)} –{" "}
                    {formatTimeLabel(schedule.endTime)}
                  </T>
                </View>
              ))}
            </View>
          ) : (
            <T size={13.5} tone="faint">
              لم يحدّد الطبيب دوامه بعد.
            </T>
          )}

          {practice.landmark ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space(2.5) }}>
              <IconTile size={34} round bg={palette.primaryTint}>
                <Icon.pin size={17} color={palette.primary} />
              </IconTile>
              <T size={13.5} tone="muted" style={{ flex: 1 }}>
                {practice.landmark}
              </T>
            </View>
          ) : null}

          {practice.phone ? (
            <Button
              label="اتصال بالعيادة"
              variant="soft"
              full
              icon={(c, s) => <Icon.phone size={s} color={c} />}
              onPress={() => Linking.openURL(`tel:${practice.phone}`)}
            />
          ) : null}
        </View>

        {/* ── الآراء ── */}
        {reviews.length > 0 ? (
          <View style={{ gap: space(3) }}>
            <SectionHeader
              title="آراء المرضى"
              actionLabel={reviews.length > 2 ? (showAllReviews ? "أقل" : "عرض الكل") : undefined}
              onAction={reviews.length > 2 ? () => setShowAllReviews((v) => !v) : undefined}
            />
            {shownReviews.map((review) => (
              <View key={review.id} style={{ flexDirection: "row", gap: space(3) }}>
                <Avatar name={review.patientName} size={42} />
                <View style={{ flex: 1, gap: space(1) }}>
                  <T size={14} weight="semibold">
                    {review.patientName}
                  </T>
                  <Stars value={review.rating} size={12} />
                  {review.comment ? (
                    <T size={13.5} tone="muted" lineHeight={21}>
                      {review.comment}
                    </T>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <BottomBar>
        <Button
          label="احجز موعد"
          size="lg"
          full
          onPress={() => router.push(`/doctor/${id}/book?practiceId=${practice.id}`)}
        />
      </BottomBar>
    </View>
  );
}
