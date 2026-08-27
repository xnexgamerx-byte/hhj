import { useCallback, useEffect, useState } from "react";
import { Alert as RNAlert, Linking, Modal, Pressable, ScrollView, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Loading, Stars, T } from "@/components/ui";
import { api, clearSession, getSession, type Booking, type PaymentStart, type SessionUser } from "@/lib/api";
import { formatClock, formatDay, formatFee, STATUS_LABELS, toArabic } from "@/lib/format";
import { radius, space, usePalette } from "@/theme";

export default function BookingsScreen() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [paying, setPaying] = useState<Booking | null>(null);
  const [reviewing, setReviewing] = useState<Booking | null>(null);

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
      <Screen title="مواعيدي">
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
    <Screen
      title="مواعيدي"
      subtitle={user.fullName}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        load();
        setTimeout(() => setRefreshing(false), 600);
      }}
    >
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
              onPay={() => setPaying(booking)}
              onReview={() => setReviewing(booking)}
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
            <BookingCard key={booking.id} booking={booking} onReview={() => setReviewing(booking)} />
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

      {paying ? <PaySheet booking={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); load(); }} /> : null}
      {reviewing ? (
        <ReviewSheet booking={reviewing} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); load(); }} />
      ) : null}
    </Screen>
  );
}

/** دفع العربون — أو تعليمات الدفع في العيادة حين لا توجد بوابة إلكترونية. */
function PaySheet({ booking, onClose, onDone }: { booking: Booking; onClose: () => void; onDone: () => void }) {
  const palette = usePalette();
  const [payment, setPayment] = useState<PaymentStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    api
      .post<PaymentStart>(`/bookings/${booking.id}/pay`, {})
      .then(setPayment)
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(false));
  }, [booking.id]);

  return (
    <Sheet onClose={onClose}>
      <T size={18} weight="bold">
        دفع العربون
      </T>
      <View style={{ backgroundColor: palette.warnSoft, borderRadius: radius.lg, padding: space(4), gap: 2 }}>
        <T size={15} weight="bold" tone="warn">
          {formatFee(booking.depositAmount)}
        </T>
        <T size={13} tone="warn">
          يُخصم من أجرة الكشف عند حضورك، ولا يُسترد عند الغياب.
        </T>
      </View>

      {busy ? <Loading label="جارٍ التجهيز…" /> : null}
      {error ? <Alert message={error} /> : null}

      {payment && !payment.checkoutUrl ? (
        <>
          <T size={14} tone="muted">
            الدفع الإلكتروني غير مفعّل بعد. ادفع العربون في العيادة وستؤشّره لك، أو اتصل بهم لتأكيد حجزك.
          </T>
          {booking.clinicPhone ? (
            <Button label="اتصال بالعيادة" full onPress={() => Linking.openURL(`tel:${booking.clinicPhone}`)} />
          ) : null}
        </>
      ) : null}

      {payment?.checkoutUrl ? (
        <Button
          label="متابعة الدفع"
          variant="accent"
          size="lg"
          full
          onPress={() => Linking.openURL(payment.checkoutUrl!)}
        />
      ) : null}

      <Button label="تم" variant="outline" full onPress={onDone} />
    </Sheet>
  );
}

/** تقييم زيارة انتهت. */
function ReviewSheet({ booking, onClose, onDone }: { booking: Booking; onClose: () => void; onDone: () => void }) {
  const palette = usePalette();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/reviews", { appointmentId: booking.id, rating, comment: comment.trim() || undefined });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose}>
      <T size={18} weight="bold">
        كيف كانت زيارتك؟
      </T>
      <T size={13.5} tone="muted">
        {booking.doctorName} · {booking.clinicName}
      </T>

      <View style={{ flexDirection: "row", justifyContent: "center", gap: space(2), paddingVertical: space(3) }}>
        {[1, 2, 3, 4, 5].map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`${value} من ٥`}
            accessibilityState={{ selected: rating === value }}
            onPress={() => setRating(value)}
            hitSlop={6}
          >
            <T size={34} align="center" style={{ color: value <= rating ? palette.accent : palette.lineStrong }}>
              ★
            </T>
          </Pressable>
        ))}
      </View>

      <Field label="تعليقك" hint="اختياري — يُنشر بعد مراجعة الإدارة">
        <Input value={comment} onChangeText={setComment} placeholder="ما الذي أعجبك أو لم يعجبك؟" multiline numberOfLines={3} />
      </Field>

      {error ? <Alert message={error} /> : null}

      <Button label="إرسال التقييم" size="lg" full loading={busy} disabled={rating === 0} onPress={submit} />
      <Button label="لاحقاً" variant="ghost" full onPress={onClose} />
    </Sheet>
  );
}

/** غلاف موحّد للنوافذ المنزلقة من الأسفل. */
function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const palette = usePalette();
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="إغلاق بالنقر خارج النافذة"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: palette.overlay }}
      />
      <View
        style={{
          backgroundColor: palette.surface,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          maxHeight: "86%",
        }}
      >
        <ScrollView
          contentContainerStyle={{ padding: space(5), paddingBottom: space(10), gap: space(3) }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

function BookingCard({
  booking,
  onCancel,
  onPay,
  onReview,
  cancelling,
}: {
  booking: Booking;
  onCancel?: () => void;
  onPay?: () => void;
  onReview?: () => void;
  cancelling?: boolean;
}) {
  const palette = usePalette();
  const status = STATUS_LABELS[booking.status] ?? { label: booking.status, tone: "muted" as const };
  const awaitingDeposit = booking.paymentStatus === "PENDING" && booking.depositAmount > 0;

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
        <Badge tone={awaitingDeposit ? "warn" : status.tone} label={awaitingDeposit ? "بانتظار العربون" : status.label} />
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

      {awaitingDeposit && onPay ? (
        <View style={{ backgroundColor: palette.warnSoft, borderRadius: radius.md, padding: space(3), gap: space(2) }}>
          <T size={13} tone="warn">
            ادفع {formatFee(booking.depositAmount)} لتثبيت حجزك، وإلا حُرِّر وقتك لمريض آخر.
          </T>
          <Button label="دفع العربون" variant="accent" size="sm" full onPress={onPay} />
        </View>
      ) : null}

      {booking.canReview && onReview ? (
        <Button label="قيّم هذه الزيارة" variant="outline" size="sm" full onPress={onReview} />
      ) : null}

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
