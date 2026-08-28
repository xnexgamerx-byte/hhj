import { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { GradientHeader } from "@/components/GradientHeader";
import { DoctorRow } from "@/components/DoctorRow";
import { Icon } from "@/components/icons";
import { Alert, Button, Card, EmptyState, Loading, T } from "@/components/ui";
import { api, type DoctorCard, type Specialty } from "@/lib/api";
import { toArabic } from "@/lib/format";
import { font, radius, shadow, space, usePalette } from "@/theme";

type SortKey = "soonest" | "rating" | "fee";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "soonest", label: "الأقرب موعداً" },
  { key: "rating", label: "الأعلى تقييماً" },
  { key: "fee", label: "الأقل سعراً" },
];

export default function DoctorsScreen() {
  const palette = usePalette();
  const router = useRouter();
  const params = useLocalSearchParams<{ governorateId?: string; specialtyId?: string; q?: string }>();

  const [doctors, setDoctors] = useState<DoctorCard[] | null>(null);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [specialtyId, setSpecialtyId] = useState<string | null>(params.specialtyId ?? null);
  const [query, setQuery] = useState(params.q ?? "");
  const [submitted, setSubmitted] = useState(params.q ?? "");
  const [sort, setSort] = useState<SortKey>("soonest");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!params.governorateId) return;
    api
      .get<Specialty[]>(`/specialties/available?governorateId=${params.governorateId}`)
      .then(setSpecialties)
      .catch(() => {});
  }, [params.governorateId]);

  useEffect(() => {
    const search = new URLSearchParams();
    if (params.governorateId) search.set("governorateId", params.governorateId);
    if (specialtyId) search.set("specialtyId", specialtyId);
    if (submitted.trim()) search.set("q", submitted.trim());

    setDoctors(null);
    setError(null);
    api
      .get<DoctorCard[]>(`/doctors?${search.toString()}`)
      .then(setDoctors)
      .catch((e) => setError(e.message));
  }, [params.governorateId, specialtyId, submitted, refreshing]);

  // الترتيب في الواجهة لا في الخادم: القائمة صغيرة، وتبديل الترتيب يجب أن يكون فورياً
  const sorted = useMemo(() => {
    if (!doctors) return null;
    const list = [...doctors];
    if (sort === "rating") list.sort((a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount);
    if (sort === "fee") list.sort((a, b) => (a.practices[0]?.feeAmount ?? 0) - (b.practices[0]?.feeAmount ?? 0));
    if (sort === "soonest")
      list.sort((a, b) => (a.nextAvailable?.date ?? "9999").localeCompare(b.nextAvailable?.date ?? "9999"));
    return list;
  }, [doctors, sort]);

  const activeSpecialty = specialties.find((s) => String(s.id) === specialtyId);

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <GradientHeader back title={activeSpecialty ? activeSpecialty.nameAr : "الأطباء"}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space(2.5),
            backgroundColor: "rgba(255,255,255,0.17)",
            borderRadius: radius.md,
            paddingHorizontal: space(3.5),
            height: 48,
          }}
        >
          <Icon.search size={19} color="rgba(255,255,255,0.75)" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => setSubmitted(query)}
            returnKeyType="search"
            placeholder="ابحث باسم الطبيب أو التخصص"
            placeholderTextColor="rgba(255,255,255,0.65)"
            style={{
              flex: 1,
              fontFamily: font.regular,
              fontSize: 14.5,
              color: "#FFFFFF",
              textAlign: "right",
              height: "100%",
            }}
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="مسح البحث"
              hitSlop={8}
              onPress={() => {
                setQuery("");
                setSubmitted("");
              }}
            >
              <Icon.close size={17} color="rgba(255,255,255,0.8)" />
            </Pressable>
          ) : null}
        </View>
      </GradientHeader>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: space(8) }}
        refreshControl={
          <RefreshControl refreshing={false} tintColor={palette.primary} onRefresh={() => setRefreshing((v) => !v)} />
        }
      >
        {/* ── مرشّح التخصص ── */}
        {specialties.length > 0 ? (
          <View style={{ paddingTop: space(4) }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: space(4), gap: space(2), paddingVertical: space(1) }}
            >
              <Chip label="الكل" active={!specialtyId} onPress={() => setSpecialtyId(null)} />
              {specialties.map((s) => (
                <Chip
                  key={s.id}
                  label={s.nameAr}
                  count={s.doctorCount}
                  active={String(s.id) === specialtyId}
                  onPress={() => setSpecialtyId(String(s.id))}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={{ paddingHorizontal: space(4), paddingTop: space(4), gap: space(4) }}>
          {error ? <Alert message={error} /> : null}

          {/* ── العدد والترتيب ── */}
          {sorted && sorted.length > 0 ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
              <T size={13.5} tone="muted">
                {toArabic(sorted.length)} طبيب
              </T>
              <View style={{ flex: 1 }} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(1.5) }}>
                {SORTS.map((s) => (
                  <Pressable
                    key={s.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sort === s.key }}
                    onPress={() => setSort(s.key)}
                    style={{
                      paddingHorizontal: space(3),
                      paddingVertical: space(1.5),
                      borderRadius: radius.pill,
                      backgroundColor: sort === s.key ? palette.primarySoft : "transparent",
                    }}
                  >
                    <T size={12.5} weight="semibold" tone={sort === s.key ? "primary" : "faint"}>
                      {s.label}
                    </T>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {doctors === null && !error ? <Loading label="جارٍ البحث…" /> : null}

          {sorted?.length === 0 ? (
            <Card>
              <EmptyState
                icon={(c, s) => <Icon.search size={s} color={c} />}
                title="ما لكينا طبيباً بهذه المواصفات"
                hint={
                  submitted
                    ? "جرّب اسماً أقصر، أو امسح البحث واختر تخصصاً."
                    : "جرّب تخصصاً آخر أو محافظة أخرى."
                }
                action={
                  submitted ? (
                    <Button
                      label="مسح البحث"
                      variant="soft"
                      onPress={() => {
                        setQuery("");
                        setSubmitted("");
                      }}
                    />
                  ) : (
                    <Button label="رجوع" variant="soft" onPress={() => router.back()} />
                  )
                }
              />
            </Card>
          ) : null}

          <View style={{ gap: space(3) }}>
            {sorted?.map((doctor) => (
              <DoctorRow key={doctor.id} doctor={doctor} onPress={() => router.push(`/doctor/${doctor.id}`)} />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Chip({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count?: number;
  active: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space(1.5),
        paddingHorizontal: space(3.5),
        paddingVertical: space(2),
        borderRadius: radius.pill,
        backgroundColor: active ? palette.primary : palette.surface,
        ...shadow(1, palette.shadowTint),
      }}
    >
      <T size={13} weight="semibold" tone={active ? "onPrimary" : "ink"}>
        {label}
      </T>
      {count !== undefined ? (
        <T size={11.5} tone={active ? "onPrimary" : "faint"} style={{ opacity: active ? 0.8 : 1 }}>
          {toArabic(count)}
        </T>
      ) : null}
    </Pressable>
  );
}
