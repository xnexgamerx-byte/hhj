import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PlainHeader, SearchField } from "@/components/PlainHeader";
import { ClinicCard } from "@/components/ClinicCard";
import { Icon } from "@/components/icons";
import { Alert, Card, EmptyState, Loading, T } from "@/components/ui";
import { api, type ClinicCard as Clinic } from "@/lib/api";
import { countLabel, COUNTS } from "@/lib/format";
import { space, usePalette } from "@/theme";

const GOVERNORATE_KEY = "doctorsehti.governorate";

/** العيادات في محافظة المستخدم — مدخل ثانٍ للبحث غير التخصص. */
export default function ClinicsScreen() {
  const palette = usePalette();
  const router = useRouter();

  const [clinics, setClinics] = useState<Clinic[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const saved = await AsyncStorage.getItem(GOVERNORATE_KEY);
    const suffix = saved ? `?governorateId=${saved}&limit=60` : "?limit=60";
    return api
      .get<Clinic[]>(`/clinics${suffix}`)
      .then(setClinics)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // البحث محلّي: القائمة قصيرة والنتيجة يجب أن تظهر مع كل حرف
  const term = query.trim();
  const shown = clinics?.filter(
    (c) =>
      !term ||
      c.nameAr.includes(term) ||
      c.district.includes(term) ||
      c.specialties.some((s) => s.includes(term)),
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <PlainHeader title="العيادات">
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="ابحث باسم العيادة أو المنطقة"
          onClear={() => setQuery("")}
        />
      </PlainHeader>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space(4), paddingBottom: space(8), gap: space(3) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={palette.primary}
            onRefresh={() => {
              setRefreshing(true);
              load().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        {error ? <Alert message={error} /> : null}
        {clinics === null && !error ? <Loading label="جارٍ جلب العيادات…" /> : null}

        {shown && shown.length > 0 ? (
          <T size={13} tone="muted">
            {countLabel(shown.length, COUNTS.clinic)}
          </T>
        ) : null}

        {shown?.length === 0 ? (
          <Card>
            <EmptyState
              icon={(c, s) => <Icon.pin size={s} color={c} />}
              title={term ? "ما لكينا عيادة بهذا الاسم" : "لا عيادات في محافظتك بعد"}
              hint={term ? "جرّب اسماً أقصر أو اسم المنطقة." : "نضيف عيادات جديدة باستمرار."}
            />
          </Card>
        ) : null}

        {shown?.map((clinic) => (
          <ClinicCard
            key={clinic.id}
            clinic={clinic}
            onPress={() => router.push(`/doctors?clinicId=${clinic.id}&title=${encodeURIComponent(clinic.nameAr)}`)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
