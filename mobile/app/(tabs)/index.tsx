import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GradientHeader, HeaderButton } from "@/components/GradientHeader";
import { Icon, SpecialtyIcon } from "@/components/icons";
import { Alert, Button, Card, EmptyState, IconTile, Loading, SectionHeader, T } from "@/components/ui";
import { DoctorRow } from "@/components/DoctorRow";
import { api, getSession, type DoctorCard, type Governorate, type SessionUser, type Specialty } from "@/lib/api";
import { toArabic } from "@/lib/format";
import { font, radius, shadow, space, usePalette } from "@/theme";

const GOVERNORATE_KEY = "mawid.governorate";
const PREVIEW_COUNT = 9;

export default function HomeScreen() {
  const palette = usePalette();
  const router = useRouter();

  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [governorateId, setGovernorateId] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [specialties, setSpecialties] = useState<Specialty[] | null>(null);
  const [featured, setFeatured] = useState<DoctorCard[] | null>(null);
  const [showAllSpecialties, setShowAllSpecialties] = useState(false);
  const [query, setQuery] = useState("");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    api
      .get<Governorate[]>("/locations/governorates")
      .then(async (list) => {
        setGovernorates(list);
        const saved = Number(await AsyncStorage.getItem(GOVERNORATE_KEY));
        setGovernorateId(saved && list.some((g) => g.id === saved) ? saved : (list[0]?.id ?? null));
      })
      .catch((e) => setError(e.message));
  }, []);

  const load = useCallback(
    (id: number) => {
      setError(null);
      return Promise.all([
        api.get<Specialty[]>(`/specialties/available?governorateId=${id}`).then(setSpecialties),
        api
          .get<DoctorCard[]>(`/doctors?governorateId=${id}`)
          .then((list) => setFeatured(list.slice(0, 6)))
          .catch(() => setFeatured([])),
      ]).catch((e) => setError(e.message));
    },
    [],
  );

  useEffect(() => {
    if (governorateId === null) return;
    AsyncStorage.setItem(GOVERNORATE_KEY, String(governorateId)).catch(() => {});
    setSpecialties(null);
    setFeatured(null);
    setShowAllSpecialties(false);
    load(governorateId);
  }, [governorateId, load]);

  useFocusEffect(
    useCallback(() => {
      getSession().then(setUser);
    }, []),
  );

  const governorateName = governorates.find((g) => g.id === governorateId)?.nameAr ?? "…";

  // الأكثر أطباءً أولاً: التخصص الفارغ في المعاينة يضيّع صفاً بلا فائدة
  const ordered = useMemo(
    () => (specialties ? [...specialties].sort((a, b) => b.doctorCount - a.doctorCount) : null),
    [specialties],
  );
  const shown = ordered ? (showAllSpecialties ? ordered : ordered.slice(0, PREVIEW_COUNT)) : null;

  const goSearch = () => {
    const q = query.trim();
    router.push(`/doctors?governorateId=${governorateId}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: space(8) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={palette.primary}
            onRefresh={() => {
              if (governorateId === null) return;
              setRefreshing(true);
              load(governorateId).finally(() => setRefreshing(false));
            }}
          />
        }
      >
        {/* ── الترويسة ── */}
        <GradientHeader overlap={34}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
            <View style={{ flex: 1 }}>
              <T size={13.5} tone="onPrimary" style={{ opacity: 0.82 }}>
                {user ? `هلا ${user.fullName.split(" ")[0]} 👋` : "هلا بالزين 👋"}
              </T>
              <T size={21} weight="bold" tone="onPrimary">
                احجز موعدك عند طبيبك
              </T>
            </View>
            <HeaderButton label="حسابي" onPress={() => router.push("/bookings")}>
              <Icon.user size={20} color="#FFFFFF" />
            </HeaderButton>
          </View>

          {/* اختيار المحافظة */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`المحافظة: ${governorateName}. اضغط للتغيير`}
            onPress={() => setPicking(true)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space(1.5),
              alignSelf: "flex-start",
              backgroundColor: "rgba(255,255,255,0.16)",
              borderRadius: radius.pill,
              paddingHorizontal: space(3),
              paddingVertical: space(1.5),
            }}
          >
            <Icon.pin size={15} color={palette.goldBright} />
            <T size={13.5} weight="semibold" tone="onPrimary">
              {governorateName}
            </T>
            <Icon.chevronDown size={14} color="#FFFFFF" />
          </Pressable>
        </GradientHeader>

        {/* ── البحث: يعلو على الترويسة ── */}
        <View style={{ marginTop: -34, paddingHorizontal: space(4) }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space(2.5),
              backgroundColor: palette.surface,
              borderRadius: radius.md,
              paddingHorizontal: space(4),
              height: 56,
              ...shadow(2, palette.shadowTint),
            }}
          >
            <Icon.search size={20} color={palette.faint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={goSearch}
              returnKeyType="search"
              placeholder="ابحث باسم الطبيب أو التخصص"
              placeholderTextColor={palette.faint}
              style={{
                flex: 1,
                fontFamily: font.regular,
                fontSize: 14.5,
                color: palette.ink,
                textAlign: "right",
                height: "100%",
              }}
            />
          </View>
        </View>

        <View style={{ paddingHorizontal: space(4), paddingTop: space(6), gap: space(6) }}>
          {error ? <Alert message={error} /> : null}

          {/* ── التخصصات ── */}
          <View style={{ gap: space(4) }}>
            <SectionHeader
              title="التخصصات"
              actionLabel={ordered && ordered.length > PREVIEW_COUNT ? (showAllSpecialties ? "أقل" : "عرض الكل") : undefined}
              onAction={
                ordered && ordered.length > PREVIEW_COUNT ? () => setShowAllSpecialties((v) => !v) : undefined
              }
            />

            {specialties === null && !error ? <Loading label="جارٍ جلب التخصصات…" /> : null}

            {specialties?.length === 0 ? (
              <Card>
                <EmptyState
                  icon={(c, s) => <Icon.pin size={s} color={c} />}
                  title="لا يوجد أطباء في هذه المحافظة بعد"
                  hint="جرّب محافظة أخرى — نضيف أطباء جدداً باستمرار."
                  action={<Button label="تغيير المحافظة" variant="soft" onPress={() => setPicking(true)} />}
                />
              </Card>
            ) : null}

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(3) }}>
              {shown?.map((specialty) => (
                <SpecialtyTile
                  key={specialty.id}
                  specialty={specialty}
                  onPress={() =>
                    router.push(`/doctors?governorateId=${governorateId}&specialtyId=${specialty.id}`)
                  }
                />
              ))}
            </View>
          </View>

          {/* ── الأطباء ── */}
          {featured && featured.length > 0 ? (
            <View style={{ gap: space(4) }}>
              <SectionHeader
                title="أطباء متاحون قريباً"
                actionLabel="عرض الكل"
                onAction={() => router.push(`/doctors?governorateId=${governorateId}`)}
              />
              <View style={{ gap: space(3) }}>
                {featured.map((doctor) => (
                  <DoctorRow key={doctor.id} doctor={doctor} onPress={() => router.push(`/doctor/${doctor.id}`)} />
                ))}
              </View>
              <Button
                label={`عرض كل الأطباء في ${governorateName}`}
                variant="soft"
                full
                onPress={() => router.push(`/doctors?governorateId=${governorateId}`)}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>

      <GovernoratePicker
        visible={picking}
        governorates={governorates}
        selected={governorateId}
        onPick={(id) => {
          setGovernorateId(id);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </View>
  );
}

/* ── بطاقة التخصص ────────────────────────────────────────────── */

function SpecialtyTile({ specialty, onPress }: { specialty: Specialty; onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${specialty.nameAr} — ${toArabic(specialty.doctorCount)} طبيب`}
      onPress={onPress}
      style={({ pressed }) => ({
        width: "31%",
        backgroundColor: palette.surface,
        borderRadius: radius.md,
        paddingVertical: space(3.5),
        paddingHorizontal: space(2),
        alignItems: "center",
        gap: space(2),
        opacity: pressed ? 0.9 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
        ...shadow(1, palette.shadowTint),
      })}
    >
      <IconTile size={46} round bg={palette.primaryTint}>
        <SpecialtyIcon slug={specialty.slug} size={25} color={palette.primary} />
      </IconTile>
      <T size={12} weight="semibold" align="center" numberOfLines={2} lineHeight={16}>
        {specialty.nameAr}
      </T>
      <T size={10.5} tone="faint" align="center">
        {toArabic(specialty.doctorCount)} طبيب
      </T>
    </Pressable>
  );
}

/* ── قائمة المحافظات ─────────────────────────────────────────── */

function GovernoratePicker({
  visible,
  governorates,
  selected,
  onPick,
  onClose,
}: {
  visible: boolean;
  governorates: Governorate[];
  selected: number | null;
  onPick: (id: number) => void;
  onClose: () => void;
}) {
  const palette = usePalette();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="إغلاق قائمة المحافظات"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: palette.overlay }}
      />
      <View
        style={{
          backgroundColor: palette.surface,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          paddingTop: space(3),
          paddingBottom: space(9),
          maxHeight: "74%",
        }}
      >
        <View
          style={{
            alignSelf: "center",
            width: 42,
            height: 4,
            borderRadius: 2,
            backgroundColor: palette.lineStrong,
            marginBottom: space(4),
          }}
        />
        <T size={17} weight="bold" style={{ paddingHorizontal: space(5), marginBottom: space(3.5) }}>
          اختر محافظتك
        </T>
        <ScrollView contentContainerStyle={{ paddingHorizontal: space(5), paddingBottom: space(2) }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
            {governorates.map((governorate) => {
              const active = governorate.id === selected;
              return (
                <Pressable
                  key={governorate.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => onPick(governorate.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space(1.5),
                    paddingHorizontal: space(3.5),
                    paddingVertical: space(2.5),
                    borderRadius: radius.pill,
                    backgroundColor: active ? palette.primary : palette.surface2,
                    borderWidth: 1.4,
                    borderColor: active ? palette.primary : palette.line,
                  }}
                >
                  {active ? <Icon.check size={14} color={palette.onPrimary} /> : null}
                  <T size={14} weight="semibold" tone={active ? "onPrimary" : "ink"}>
                    {governorate.nameAr}
                  </T>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
