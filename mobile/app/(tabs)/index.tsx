import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Banner, slidesFrom } from "@/components/Banner";
import { ClinicCard } from "@/components/ClinicCard";
import { SearchField } from "@/components/PlainHeader";
import { DoctorRow } from "@/components/DoctorRow";
import { Icon } from "@/components/icons";
import { SpecialtyArt } from "@/components/SpecialtyArt";
import { Alert, Button, Card, EmptyState, IconTile, Loading, SectionHeader, T } from "@/components/ui";
import {
  api,
  getSession,
  type BannerFeed,
  type ClinicCard as Clinic,
  type DoctorCard,
  type Governorate,
  type SessionUser,
  type Specialty,
} from "@/lib/api";
import { countLabel, COUNTS, toArabic } from "@/lib/format";
import { Appear } from "@/motion";
import { radius, shadow, space, usePalette } from "@/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const GOVERNORATE_KEY = "mawid.governorate";
const PREVIEW_COUNT = 8;

export default function HomeScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [governorateId, setGovernorateId] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [specialties, setSpecialties] = useState<Specialty[] | null>(null);
  const [featured, setFeatured] = useState<DoctorCard[] | null>(null);
  const [clinics, setClinics] = useState<Clinic[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [feed, setFeed] = useState<BannerFeed | null>(null);
  const [unread, setUnread] = useState(0);

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

  // اللافتات مستقلّة عن المحافظة، وفشلها لا يُعطّل الشاشة: تظهر المدمجة
  useEffect(() => {
    api.get<BannerFeed>("/banners").then(setFeed).catch(() => {});
  }, []);

  const load = useCallback(
    (id: number) =>
      Promise.all([
        api.get<Specialty[]>(`/specialties/available?governorateId=${id}`).then(setSpecialties),
        api
          .get<DoctorCard[]>(`/doctors?governorateId=${id}`)
          .then((list) => setFeatured(list.slice(0, 5)))
          .catch(() => setFeatured([])),
        api
          .get<Clinic[]>(`/clinics?governorateId=${id}&limit=8`)
          .then(setClinics)
          .catch(() => setClinics([])),
      ]).catch((e) => setError(e.message)),
    [],
  );

  useEffect(() => {
    if (governorateId === null) return;
    AsyncStorage.setItem(GOVERNORATE_KEY, String(governorateId)).catch(() => {});
    setSpecialties(null);
    setFeatured(null);
    setClinics(null);
    setShowAll(false);
    setError(null);
    load(governorateId);
  }, [governorateId, load]);

  // عند كل عودة للشاشة لا مرّةً عند التركيب: المريض يفتح الإشعارات ويقرأها
  // ثم يرجع، فلو بقيت الشارة لظنّ أن شيئاً لم يُقرأ.
  //
  // والعدّاد لا يُطلب إلا لمن له حساب: الزائر ليس عنده إشعارات أصلاً، ونداءٌ
  // بلا رمزٍ يرجع ٤٠١ — رحلةٌ ضائعة على شبكة الجوال وخطأٌ أحمر في السجلّ
  // مقابل صفرٍ كنّا نعرفه قبل أن نسأل.
  useFocusEffect(
    useCallback(() => {
      getSession().then((session) => {
        setUser(session);
        if (!session) {
          setUnread(0);
          return;
        }
        api
          .get<{ unread: number }>("/me/notifications/unread")
          .then((r) => setUnread(r.unread))
          .catch(() => setUnread(0));
      });
    }, []),
  );

  const governorateName = governorates.find((g) => g.id === governorateId)?.nameAr ?? "…";

  // الأكثر أطباءً أولاً: التخصص الفارغ في المعاينة يضيّع خانة بلا فائدة
  const ordered = useMemo(
    () => (specialties ? [...specialties].sort((a, b) => b.doctorCount - a.doctorCount) : null),
    [specialties],
  );
  const shown = ordered ? (showAll ? ordered : ordered.slice(0, PREVIEW_COUNT)) : null;

  const goSearch = () => {
    const q = query.trim();
    router.push(`/doctors?governorateId=${governorateId}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + space(3), paddingBottom: space(8) }}
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
        {/* ── الموقع والحساب ── */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: space(3), paddingHorizontal: space(4) }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`المحافظة: ${governorateName}. اضغط للتغيير`}
            onPress={() => setPicking(true)}
            style={{ flex: 1 }}
          >
            <T size={12.5} tone="faint">
              {user ? `هلا ${user.fullName.split(" ")[0]} 👋` : "موقعك"}
            </T>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space(1.5), marginTop: 1 }}>
              <Icon.pin size={17} color={palette.primary} />
              <T size={16} weight="bold">
                {governorateName}
              </T>
              <Icon.chevronDown size={15} color={palette.muted} />
            </View>
          </Pressable>

          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: radius.sm,
              backgroundColor: palette.brand,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* العلامة زمرّدية وحدها: نفس لون أيقونة التطبيق على الشاشة الرئيسية */}
            <T size={17} weight="bold" tone="onPrimary" align="center">
              م
            </T>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={unread > 0 ? `الإشعارات — ${toArabic(unread)} غير مقروء` : "الإشعارات"}
            onPress={() => router.push("/notifications")}
            style={({ pressed }) => ({
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed ? palette.surface3 : palette.surface2,
            })}
          >
            <Icon.bell size={20} color={palette.ink} />
            {/* شارةٌ بالعدد لا نقطةٌ صمّاء: «٣ إشعارات» يستدعي فتحها،
                والنقطة وحدها قد تكون شيئاً واحداً لا يستحقّ */}
            {unread > 0 ? (
              <View
                style={{
                  position: "absolute",
                  top: -2,
                  left: -2,
                  minWidth: 18,
                  height: 18,
                  paddingHorizontal: 4,
                  borderRadius: 9,
                  backgroundColor: palette.danger,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 2,
                  borderColor: palette.bg,
                }}
              >
                {/* onPrimary لا أبيضَ صريح: الأحمر في الوضع الداكن فاتحٌ
                    (#F87171) والأبيض عليه لا يكاد يُقرأ */}
                <T size={10} weight="bold" tone="onPrimary">
                  {unread > 9 ? "٩+" : toArabic(unread)}
                </T>
              </View>
            ) : null}
          </Pressable>
        </View>

        {/* ── البحث ── */}
        <View style={{ paddingHorizontal: space(4), paddingTop: space(4) }}>
          <SearchField value={query} onChangeText={setQuery} onSubmit={goSearch} onClear={() => setQuery("")} />
        </View>

        {/* ── لافتة منزلقة بنقاط ── */}
        <View style={{ paddingHorizontal: space(4), paddingTop: space(4) }}>
          <Banner
            slides={slidesFrom(feed?.banners)}
            rotateSeconds={feed?.rotateSeconds ?? 5}
            onPress={() => router.push(`/doctors?governorateId=${governorateId}`)}
          />
        </View>

        {error ? (
          <View style={{ paddingHorizontal: space(4), paddingTop: space(4) }}>
            <Alert message={error} />
          </View>
        ) : null}

        {/* ── التخصصات ── */}
        <View style={{ paddingHorizontal: space(4), paddingTop: space(6), gap: space(4) }}>
          <SectionHeader
            title="التخصصات"
            actionLabel={ordered && ordered.length > PREVIEW_COUNT ? (showAll ? "أقل" : "عرض الكل") : undefined}
            onAction={ordered && ordered.length > PREVIEW_COUNT ? () => setShowAll((v) => !v) : undefined}
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

          <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: space(4) }}>
            {shown?.map((specialty, i) => {
              return (
                /* التدرّج بالصفوف لا بالبلاطات: أربعُ بلاطاتٍ في صفٍّ واحد
                   تظهر معاً كما تُقرأ، والعين تنزل صفاً صفاً */
                <Appear key={specialty.id} index={Math.floor(i / 4)} style={{ width: "25%" }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${specialty.nameAr} — ${countLabel(specialty.doctorCount, COUNTS.doctor)}`}
                    onPress={() =>
                      router.push(`/doctors?governorateId=${governorateId}&specialtyId=${specialty.id}`)
                    }
                    style={({ pressed }) => ({
                      alignItems: "center",
                      gap: space(2),
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <View
                      style={{
                        width: 62,
                        height: 62,
                        borderRadius: radius.lg,
                        backgroundColor: palette.artTile,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <SpecialtyArt slug={specialty.slug} size={44} color={palette.ink} />
                    </View>
                    <T size={11.5} weight="semibold" align="center" numberOfLines={2} lineHeight={15}>
                      {specialty.nameAr}
                    </T>
                  </Pressable>
                </Appear>
              );
            })}
          </View>
        </View>

        {/* ── العيادات القريبة ── */}
        {clinics && clinics.length > 0 ? (
          <View style={{ paddingTop: space(7), gap: space(4) }}>
            <View style={{ paddingHorizontal: space(4) }}>
              <SectionHeader
                title="عيادات في محافظتك"
                actionLabel="عرض الكل"
                onAction={() => router.push("/clinics")}
              />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: space(4), gap: space(3) }}
            >
              {clinics.map((clinic) => (
                <ClinicCard
                  key={clinic.id}
                  clinic={clinic}
                  wide
                  onPress={() =>
                    router.push(`/doctors?clinicId=${clinic.id}&title=${encodeURIComponent(clinic.nameAr)}`)
                  }
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* ── الأطباء ── */}
        {featured && featured.length > 0 ? (
          <View style={{ paddingHorizontal: space(4), paddingTop: space(7), gap: space(4) }}>
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
          </View>
        ) : null}
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
