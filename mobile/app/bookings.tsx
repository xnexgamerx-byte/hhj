import { useCallback, useState } from "react";
import { Alert as RNAlert, Linking, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Alert, Badge, Button, Card, EmptyState, Loading, T } from "@/components/ui";
import { api, clearSession, getSession, type Booking, type SessionUser } from "@/lib/api";
import { formatClock, formatDay, formatFee, STATUS_LABELS, toArabic } from "@/lib/format";
import { space, usePalette } from "@/theme";

export default function BookingsScreen() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .get<Booking[]>("/me/bookings")
      .then(setBookings)
      .catch((e) => setError(e.message));
  }, []);

  useFocusEffect(
    useCallback(() => {
      getSession().then((session) => {
        setUser(session);
        if (session?.role === "PATIENT") load();
        else setBookings([]);
      });
    }, [load]),
  );

  function askCancel(booking: Booking) {
    RNAlert.alert("إلغاء الحجز", `هل تريد إلغاء موعدك عند ${booking.doctorName}؟`, [
      { text: "تراجع", style: "cancel" },
      { text: "إلغاء الحجز", style: "destructive", onPress: () => cancel(booking.id) },
    ]);
  }

  async function cancel(id: string) {
    setCancelling(id);
    try {
      await api.post(`/bookings/${id}/cancel`, {});
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCancelling(null);
    }
  }

  if (!user || user.role !== "PATIENT") {
    return (
      <Screen title="حجوزاتي" back>
        <Card>
          <EmptyState
            title="لم تسجّل الدخول بعد"
            hint="تدخل تلقائياً برقم هاتفك عند أول حجز — بلا كلمة مرور."
            action={<Button label="ابحث عن طبيب" onPress={() => router.replace("/")} />}
          />
        </Card>
      </Screen>
    );
  }

  const upcoming = bookings?.filter((b) => b.isUpcoming) ?? [];
  const past = bookings?.filter((b) => !b.isUpcoming) ?? [];

  return (
    <Screen title="حجوزاتي" subtitle={user.fullName} back>
      {error ? <Alert message={error} /> : null}
      {bookings === null ? <Loading /> : null}

      {bookings?.length === 0 ? (
        <Card>
          <EmptyState
            title="لا توجد حجوزات بعد"
            hint="ابحث عن طبيب في محافظتك واحجز موعدك."
            action={<Button label="ابحث عن طبيب" onPress={() => router.replace("/")} />}
          />
        </Card>
      ) : null}

      {upcoming.length > 0 ? (
        <View style={{ gap: space(3) }}>
          <T size={17} weight="bold">
            المواعيد القادمة
          </T>
          {upcoming.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              onCancel={() => askCancel(booking)}
              cancelling={cancelling === booking.id}
            />
          ))}
        </View>
      ) : null}

      {past.length > 0 ? (
        <View style={{ gap: space(3) }}>
          <T size={17} weight="bold">
            السابقة
          </T>
          {past.map((booking) => (
            <BookingCard key={booking.id} booking={booking} />
          ))}
        </View>
      ) : null}

      <Button
        label="تسجيل الخروج"
        variant="ghost"
        full
        onPress={async () => {
          await clearSession();
          router.replace("/");
        }}
      />
    </Screen>
  );
}

function BookingCard({
  booking,
  onCancel,
  cancelling,
}: {
  booking: Booking;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const palette = usePalette();
  const status = STATUS_LABELS[booking.status] ?? { label: booking.status, tone: "muted" as const };

  return (
    <Card style={{ gap: space(3) }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space(2) }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T size={15.5} weight="bold">
            {booking.doctorName}
          </T>
          <T size={13} tone="muted">
            {booking.clinicName}
          </T>
        </View>
        <Badge tone={status.tone} label={status.label} />
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: palette.line, paddingTop: space(3), gap: space(1) }}>
        <T size={14} weight="semibold" tone="primary">
          {formatDay(booking.sessionStart.slice(0, 10))} —{" "}
          {booking.bookingMode === "SLOT"
            ? formatClock(booking.slotStart)
            : `الدور ${toArabic(booking.queueNumber)} بين ${formatClock(booking.sessionStart)} و${formatClock(booking.sessionEnd)}`}
        </T>
        <T size={13} tone="muted">
          المريض: {booking.patientName}
        </T>
        {booking.landmark ? (
          <T size={13} tone="muted">
            {booking.landmark}
          </T>
        ) : null}
        <View style={{ flexDirection: "row", gap: space(3), marginTop: space(1) }}>
          <T size={13} weight="bold">
            {booking.reference}
          </T>
          <T size={13} tone="muted">
            {formatFee(booking.feeAmount)}
          </T>
        </View>
      </View>

      {onCancel || booking.clinicPhone ? (
        <View style={{ flexDirection: "row", gap: space(2) }}>
          {booking.clinicPhone ? (
            <Button
              label="اتصال بالعيادة"
              variant="outline"
              size="sm"
              style={{ flex: 1 }}
              onPress={() => Linking.openURL(`tel:${booking.clinicPhone}`)}
            />
          ) : null}
          {onCancel ? (
            <Button label="إلغاء الحجز" variant="danger" size="sm" style={{ flex: 1 }} loading={cancelling} onPress={onCancel} />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
