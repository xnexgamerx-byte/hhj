import { useEffect, useState } from "react";
import { Pressable, RefreshControl, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Alert, Badge, Card, EmptyState, Input, Loading, Stars, T } from "@/components/ui";
import { api, type DoctorCard, type Specialty } from "@/lib/api";
import { formatFee, toArabic } from "@/lib/format";
import { radius, space, usePalette } from "@/theme";

export default function DoctorsScreen() {
  const palette = usePalette();
  const router = useRouter();
  const params = useLocalSearchParams<{ governorateId?: string; specialtyId?: string }>();

  const [doctors, setDoctors] = useState<DoctorCard[] | null>(null);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [specialtyId, setSpecialtyId] = useState(params.specialtyId ?? "");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.governorateId) return;
    api
      .get<Specialty[]>(`/specialties/available?governorateId=${params.governorateId}`)
      .then(setSpecialties)
      .catch(() => {});
  }, [params.governorateId]);

  useEffect(() => {
    setDoctors(null);
    const search = new URLSearchParams();
    if (params.governorateId) search.set("governorateId", params.governorateId);
    if (specialtyId) search.set("specialtyId", specialtyId);
    if (query.trim()) search.set("q", query.trim());

    // مهلة قصيرة حتى لا نرسل طلباً مع كل حرف
    const timer = setTimeout(() => {
      api
        .get<DoctorCard[]>(`/doctors?${search.toString()}`)
        .then(setDoctors)
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(timer);
  }, [params.governorateId, specialtyId, query]);

  const activeSpecialty = specialties.find((s) => String(s.id) === specialtyId);

  return (
    <Screen title="الأطباء" subtitle={activeSpecialty?.nameAr} back>
      <Input value={query} onChangeText={setQuery} placeholder="ابحث باسم الطبيب أو التخصص" returnKeyType="search" />

      {/* شرائح التخصصات — أسرع من قائمة منسدلة على الجوال */}
      {specialties.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
          <Chip label="الكل" active={!specialtyId} onPress={() => setSpecialtyId("")} />
          {specialties.map((specialty) => (
            <Chip
              key={specialty.id}
              label={`${specialty.nameAr} (${toArabic(specialty.doctorCount)})`}
              active={specialtyId === String(specialty.id)}
              onPress={() => setSpecialtyId(String(specialty.id))}
            />
          ))}
        </View>
      ) : null}

      {error ? <Alert message={error} /> : null}
      {doctors === null && !error ? <Loading label="جارٍ البحث…" /> : null}

      {doctors?.length === 0 ? (
        <Card>
          <EmptyState
            title="لا يوجد طبيب مطابق"
            hint="جرّب تخصصاً آخر، أو امسح كلمة البحث، أو غيّر المحافظة من الشاشة الرئيسية."
          />
        </Card>
      ) : null}

      <View style={{ gap: space(3) }}>
        {doctors?.map((doctor) => {
          const practice = doctor.practices[0];
          return (
            <Card key={doctor.id} onPress={() => router.push(`/doctor/${doctor.id}`)} style={{ gap: space(3) }}>
              <View style={{ flexDirection: "row", gap: space(3) }}>
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    backgroundColor: palette.primarySoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <T size={17} weight="bold" tone="primary" align="center">
                    {doctor.fullName.charAt(0)}
                  </T>
                </View>

                <View style={{ flex: 1, gap: 2 }}>
                  <T size={16} weight="bold">
                    {doctor.title} {doctor.fullName}
                  </T>
                  <T size={13} tone="primary">
                    {doctor.specialties.join(" · ")}
                  </T>
                  {doctor.ratingCount > 0 ? (
                    <View style={{ marginTop: 2 }}>
                      <Stars value={doctor.ratingAvg} count={doctor.ratingCount} />
                    </View>
                  ) : null}
                </View>

                {practice ? (
                  <T size={14} weight="bold">
                    {formatFee(practice.feeAmount)}
                  </T>
                ) : null}
              </View>

              {practice ? (
                <T size={13} tone="muted">
                  {practice.clinicName} — {practice.governorate}، {practice.district}
                  {practice.landmark ? `\n${practice.landmark}` : ""}
                </T>
              ) : null}

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
                {doctor.nextAvailable ? (
                  <Badge
                    tone="ok"
                    label={`أقرب موعد: ${doctor.nextAvailable.weekdayName} · ${toArabic(doctor.nextAvailable.freeCount)} مكان`}
                  />
                ) : (
                  <Badge tone="muted" label="لا توجد أوقات متاحة حالياً" />
                )}
                {practice?.bookingMode === "QUEUE" ? <Badge tone="accent" label="نظام أدوار" /> : null}
                {doctor.yearsOfExperience ? (
                  <Badge tone="muted" label={`خبرة ${toArabic(doctor.yearsOfExperience)} سنة`} />
                ) : null}
              </View>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        opacity: pressed ? 0.85 : 1,
        paddingHorizontal: space(3),
        paddingVertical: space(1.5),
        borderRadius: radius.pill,
        backgroundColor: active ? palette.primary : palette.surface,
        borderWidth: 1,
        borderColor: active ? palette.primary : palette.line,
      })}
    >
      <T size={13} weight="semibold" tone={active ? "onPrimary" : "muted"}>
        {label}
      </T>
    </Pressable>
  );
}
