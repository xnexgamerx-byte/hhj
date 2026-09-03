import { useCallback, useMemo, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { PlainHeader } from "@/components/PlainHeader";
import { Icon } from "@/components/icons";
import { Alert, Badge, Button, Card, EmptyState, IconTile, Loading, T } from "@/components/ui";
import { api, getSession, type ClinicAppointment, type SessionUser } from "@/lib/api";
import { formatClock, formatDay, formatPhone, statNumber, toArabic, todayISO } from "@/lib/format";
import { radius, space, usePalette } from "@/theme";

/** يوم الأمس/اليوم/غد بصيغة ISO — التنقّل بين الأيام بلا تقويم كامل */
function shiftDay(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * لوحة العيادة في الجوال: من حجز اليوم، وبكل بياناته.
 *
 * الطبيب لا يجلس أمام حاسوب. لوحة الويب موجودة وكاملة، لكن الذي يفتحه وهو
 * في العيادة هو هاتفه — فهذه الشاشة هي القائمة نفسها بلا حاسوب، وفيها ما
 * تسأله العيادة عادةً: الاسم والهاتف والعمر والعنوان والملاحظة ورقم اليوم.
 */
export default function ClinicScreen() {
  const palette = usePalette();
  const router = useRouter();

  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState<ClinicAppointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((day: string) => {
    return api
      .get<ClinicAppointment[]>(`/clinic/me/appointments?date=${day}`)
      .then((data) => {
        setRows(data);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  useFocusEffect(
    useCallback(() => {
      getSession().then((session) => {
        setUser(session);
        if (session && (session.role === "DOCTOR" || session.role === "STAFF")) void load(date);
      });
    }, [date, load]),
  );

  async function mark(id: string, status: "CONFIRMED" | "COMPLETED" | "NO_SHOW") {
    setBusy(id);
    try {
      await api.patch(`/clinic/me/appointments/${id}/status`, { status });
      await load(date);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const active = useMemo(() => (rows ?? []).filter((r) => !r.status.startsWith("CANCELLED")), [rows]);
  const arrived = active.filter((r) => r.arrivedAt || r.status === "COMPLETED").length;

  if (user === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <PlainHeader back title="عيادتي" />
        <Loading />
      </View>
    );
  }

  if (!user || (user.role !== "DOCTOR" && user.role !== "STAFF")) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <PlainHeader back title="عيادتي" />
        <View style={{ padding: space(4) }}>
          <Card>
            <EmptyState
              icon={(c, s) => <Icon.user size={s} color={c} />}
              title="هذه الشاشة للأطباء والسكرتيرين"
              hint="ادخل بالإيميل والباسوورد اللذين أنشأهما لك المالك."
              action={<Button label="دخول العيادة" onPress={() => router.replace("/staff-login")} />}
            />
          </Card>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <PlainHeader back title="عيادتي" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space(4), paddingBottom: space(8), gap: space(3) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load(date);
              setRefreshing(false);
            }}
            tintColor={palette.primary}
          />
        }
      >
        {/* شريط اليوم: أمس واليوم وغد — الطبيب نادراً ما يحتاج أبعد */}
        <Card level={2} style={{ gap: space(3) }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="اليوم السابق"
              onPress={() => setDate((d) => shiftDay(d, -1))}
              hitSlop={10}
              style={{ padding: space(1) }}
            >
              <Icon.chevronRight size={20} color={palette.ink} />
            </Pressable>
            <T size={15} weight="bold" align="center" style={{ flex: 1 }}>
              {formatDay(date)}
            </T>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="اليوم التالي"
              onPress={() => setDate((d) => shiftDay(d, 1))}
              hitSlop={10}
              style={{ padding: space(1) }}
            >
              <Icon.chevronLeft size={20} color={palette.ink} />
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", gap: space(2) }}>
            <Stat label="حجوزات" value={active.length} tone="primary" />
            <Stat label="حضروا" value={arrived} tone="ok" />
            <Stat label="لم يحضروا" value={active.filter((r) => r.status === "NO_SHOW").length} tone="danger" />
          </View>

          {date !== todayISO() ? (
            <Button label="ارجع لليوم" variant="ghost" size="sm" onPress={() => setDate(todayISO())} />
          ) : null}
        </Card>

        {error ? <Alert message={error} /> : null}
        {rows === null && !error ? <Loading label="جارٍ جلب الحجوزات…" /> : null}

        {rows?.length === 0 ? (
          <Card>
            <EmptyState
              icon={(c, s) => <Icon.calendar size={s} color={c} />}
              title="لا حجوزات في هذا اليوم"
              hint="ما يحجزه المرضى يظهر هنا فوراً، ويصلك على واتساب أيضاً."
            />
          </Card>
        ) : null}

        {rows?.map((row) => (
          <BookingCard key={row.id} row={row} busy={busy === row.id} onMark={(s) => mark(row.id, s)} />
        ))}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "primary" | "ok" | "danger" }) {
  const palette = usePalette();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        paddingVertical: space(2.5),
        borderRadius: radius.md,
        backgroundColor: palette.surface2,
      }}
    >
      {/* statNumber لا toArabic: «٠» المفرد نقطةٌ تبدو كعطلِ عرضٍ في خانة إحصاء */}
      <T size={19} weight="bold" tone={tone}>
        {statNumber(value)}
      </T>
      <T size={11.5} tone="muted">
        {label}
      </T>
    </View>
  );
}

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "gold" }> = {
  CONFIRMED: { label: "مؤكَّد", tone: "ok" },
  PENDING: { label: "بانتظار التأكيد", tone: "warn" },
  COMPLETED: { label: "تم الكشف", tone: "gold" },
  NO_SHOW: { label: "لم يحضر", tone: "danger" },
  CANCELLED_BY_PATIENT: { label: "ألغاه المريض", tone: "danger" },
  CANCELLED_BY_CLINIC: { label: "ألغته العيادة", tone: "danger" },
};

function BookingCard({
  row,
  busy,
  onMark,
}: {
  row: ClinicAppointment;
  busy: boolean;
  onMark: (status: "CONFIRMED" | "COMPLETED" | "NO_SHOW") => void;
}) {
  const palette = usePalette();
  const status = STATUS[row.status] ?? { label: row.status, tone: "warn" as const };
  const cancelled = row.status.startsWith("CANCELLED");
  const done = row.status === "COMPLETED";

  return (
    <Card style={{ gap: space(3), opacity: cancelled ? 0.6 : 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
        {/* رقم اليوم أوّل ما تقع عليه العين: به تنادي العيادة */}
        <IconTile size={46} round bg={palette.primarySoft}>
          <T size={row.dailyNumber && row.dailyNumber > 99 ? 14 : 18} weight="bold" tone="primary">
            {row.dailyNumber ? toArabic(row.dailyNumber) : "—"}
          </T>
        </IconTile>
        <View style={{ flex: 1, gap: 2 }}>
          <T size={15.5} weight="bold" numberOfLines={1}>
            {row.patientName}
          </T>
          <T size={13} tone="muted">
            {row.bookingMode === "SLOT"
              ? formatClock(row.slotStart)
              : `الدور ${toArabic(row.queueNumber)} · ${formatClock(row.sessionStart)}`}
          </T>
        </View>
        <View style={{ alignItems: "flex-end", gap: space(1) }}>
          <Badge tone={status.tone} label={status.label} />
          {row.isWalkIn ? <Badge tone="warn" label="حضور مباشر" /> : null}
        </View>
      </View>

      <View style={{ gap: space(1.5) }}>
        {row.patientPhone ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`اتصال بـ${row.patientName}`}
            onPress={() => Linking.openURL(`tel:${row.patientPhone}`)}
            style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}
          >
            <Icon.phone size={15} color={palette.primary} />
            <T size={13.5} weight="semibold" tone="primary">
              {formatPhone(row.patientPhone)}
            </T>
          </Pressable>
        ) : null}

        {row.patientAge ? <Detail icon="user" text={`${toArabic(row.patientAge)} سنة`} /> : null}
        {row.patientAddress ? <Detail icon="pin" text={row.patientAddress} /> : null}
      </View>

      {/* ملاحظة المريض مبرَزة: هي ما يغيّر ما يفعله الطبيب في الدقيقة الأولى */}
      {row.patientNote ? (
        <View
          style={{
            backgroundColor: palette.warnSoft,
            borderRadius: radius.md,
            paddingHorizontal: space(3.5),
            paddingVertical: space(3),
          }}
        >
          <T size={13.5} tone="warn" lineHeight={20}>
            {row.patientNote}
          </T>
        </View>
      ) : null}

      {!cancelled ? (
        <View style={{ flexDirection: "row", gap: space(2) }}>
          {!row.arrivedAt && !done ? (
            <Button label="حضر" size="sm" full loading={busy} onPress={() => onMark("CONFIRMED")} />
          ) : null}
          {!done ? (
            <Button
              label="تم الكشف"
              variant={row.arrivedAt ? "primary" : "outline"}
              size="sm"
              full
              loading={busy}
              onPress={() => onMark("COMPLETED")}
            />
          ) : null}
          {row.status !== "NO_SHOW" && !done ? (
            <Button label="لم يحضر" variant="outline" size="sm" full loading={busy} onPress={() => onMark("NO_SHOW")} />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function Detail({ icon, text }: { icon: "user" | "pin"; text: string }) {
  const palette = usePalette();
  const Glyph = Icon[icon];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
      <Glyph size={15} color={palette.faint} />
      <T size={13} tone="muted" style={{ flex: 1 }}>
        {text}
      </T>
    </View>
  );
}
