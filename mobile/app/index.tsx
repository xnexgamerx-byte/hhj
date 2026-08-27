import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Screen } from "@/components/Screen";
import { Alert, Badge, Button, Card, EmptyState, Loading, T } from "@/components/ui";
import { api, getSession, type Governorate, type SessionUser, type Specialty } from "@/lib/api";
import { toArabic } from "@/lib/format";
import { font, radius, space, usePalette } from "@/theme";

const GOVERNORATE_KEY = "mawid.governorate";

export default function HomeScreen() {
  const palette = usePalette();
  const router = useRouter();

  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [governorateId, setGovernorateId] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [specialties, setSpecialties] = useState<Specialty[] | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Governorate[]>("/locations/governorates")
      .then(async (list) => {
        setGovernorates(list);
        // نتذكّر محافظة المستخدم فيفتح التطبيق عليها في كل مرة
        const saved = Number(await AsyncStorage.getItem(GOVERNORATE_KEY));
        setGovernorateId(saved && list.some((g) => g.id === saved) ? saved : (list[0]?.id ?? null));
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (governorateId === null) return;
    AsyncStorage.setItem(GOVERNORATE_KEY, String(governorateId)).catch(() => {});
    setSpecialties(null);
    api
      .get<Specialty[]>(`/specialties/available?governorateId=${governorateId}`)
      .then(setSpecialties)
      .catch((e) => setError(e.message));
  }, [governorateId]);

  useFocusEffect(
    useCallback(() => {
      getSession().then(setUser);
    }, []),
  );

  const governorateName = governorates.find((g) => g.id === governorateId)?.nameAr ?? "…";

  return (
    <Screen>
      {/* ── الترويسة ── */}
      <View style={{ gap: space(2) }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: radius.md,
              backgroundColor: palette.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <T size={17} weight="bold" tone="onPrimary" align="center">
              م
            </T>
          </View>
          <T size={20} weight="bold">
            موعد
          </T>
          <View style={{ flex: 1 }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={user ? "حجوزاتي" : "دخول"}
            onPress={() => router.push("/bookings")}
            style={{
              paddingHorizontal: space(3),
              paddingVertical: space(1.5),
              borderRadius: radius.md,
              backgroundColor: palette.surface2,
            }}
          >
            <T size={13} weight="semibold">
              {user ? "حجوزاتي" : "دخول"}
            </T>
          </Pressable>
        </View>

        <T size={24} weight="bold" style={{ marginTop: space(2) }}>
          احجز موعدك عند طبيبك
        </T>
        <T size={14} tone="muted">
          أوقات محدّثة من الطبيب نفسه، وحجز مثبّت برقم مرجعي — بلا اتصال ولا انتظار.
        </T>
      </View>

      {/* ── المحافظة ── */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`المحافظة: ${governorateName}. اضغط للتغيير`}
        onPress={() => setPicking(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space(2),
          backgroundColor: palette.surface,
          borderWidth: 1,
          borderColor: palette.line,
          borderRadius: radius.lg,
          paddingHorizontal: space(4),
          paddingVertical: space(3),
        }}
      >
        <View style={{ flex: 1 }}>
          <T size={12} tone="faint">
            محافظتك
          </T>
          <T size={16} weight="semibold">
            {governorateName}
          </T>
        </View>
        <T size={13} tone="primary" weight="semibold">
          تغيير
        </T>
      </Pressable>

      {error ? <Alert message={error} /> : null}

      {/* ── التخصصات ── */}
      <View style={{ gap: space(3) }}>
        <T size={17} weight="bold">
          التخصصات في {governorateName}
        </T>

        {specialties === null && !error ? <Loading /> : null}

        {specialties?.length === 0 ? (
          <Card>
            <EmptyState
              title="لا يوجد أطباء في هذه المحافظة بعد"
              hint="جرّب محافظة أخرى — نضيف أطباء جدداً باستمرار."
              action={<Button label="تغيير المحافظة" variant="outline" onPress={() => setPicking(true)} />}
            />
          </Card>
        ) : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(3) }}>
          {specialties?.map((specialty) => (
            <Card
              key={specialty.id}
              onPress={() => router.push(`/doctors?governorateId=${governorateId}&specialtyId=${specialty.id}`)}
              style={{ width: "47.5%", gap: space(2) }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: radius.md,
                  backgroundColor: palette.primarySoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <T size={17} weight="bold" tone="primary" align="center">
                  {specialty.nameAr.trim().charAt(0)}
                </T>
              </View>
              <T size={14.5} weight="semibold" numberOfLines={2}>
                {specialty.nameAr}
              </T>
              <T size={12.5} tone="muted">
                {toArabic(specialty.doctorCount)} طبيب
              </T>
            </Card>
          ))}
        </View>

        {specialties && specialties.length > 0 ? (
          <Button
            label={`عرض كل الأطباء في ${governorateName}`}
            variant="outline"
            full
            onPress={() => router.push(`/doctors?governorateId=${governorateId}`)}
          />
        ) : null}
      </View>

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
    </Screen>
  );
}

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
          paddingTop: space(4),
          paddingBottom: space(8),
          maxHeight: "72%",
        }}
      >
        <T size={17} weight="bold" style={{ paddingHorizontal: space(5), marginBottom: space(3) }}>
          اختر محافظتك
        </T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2), paddingHorizontal: space(5) }}>
          {governorates.map((governorate) => {
            const active = governorate.id === selected;
            return (
              <Pressable
                key={governorate.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onPick(governorate.id)}
                style={{
                  paddingHorizontal: space(3.5),
                  paddingVertical: space(2.5),
                  borderRadius: radius.md,
                  backgroundColor: active ? palette.primary : palette.surface2,
                  borderWidth: 1,
                  borderColor: active ? palette.primary : palette.line,
                }}
              >
                <T size={14} weight="semibold" tone={active ? "onPrimary" : "ink"}>
                  {governorate.nameAr}
                </T>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}
