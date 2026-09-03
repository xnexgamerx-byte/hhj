import { useCallback, useEffect, useState } from "react";
import { Alert as RNAlert, Linking, Modal, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { PlainHeader } from "@/components/PlainHeader";
import { Tabs } from "@/components/Stats";
import { Icon } from "@/components/icons";
import { Alert, Badge, Button, Card, EmptyState, Field, IconTile, Input, Loading, T } from "@/components/ui";
import { api, ApiError, getSession, type Booking, type SessionUser } from "@/lib/api";
import { formatClock, formatDay, formatFee, STATUS_LABELS, toArabic } from "@/lib/format";
import { Appear } from "@/motion";
import { radius, space, usePalette } from "@/theme";

export default function BookingsScreen() {
  const palette = usePalette();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewing, setReviewing] = useState<Booking | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  /** هاتفٌ لا يعرفه الحساب: يحجز ولا يقرأ — انظر requireTrusted في الخادم */
  const [blocked, setBlocked] = useState(false);

  const load = useCallback(() => {
    setError(null);
    setBlocked(false);
    api
      .get<Booking[]>("/me/bookings")
      .then(setBookings)
      .catch((e) => {
        // ليس خطأً بل حالة: هاتفٌ غير الذي حجز منه صاحب الحساب. تُشرح
        // في مكان القائمة لا في شريط خطأٍ أحمر — ليست عطلاً يُبلَّغ عنه
        if (e instanceof ApiError && e.code === "DEVICE_NOT_TRUSTED") {
          setBlocked(true);
          setBookings([]);
        } else setError(e.message);
      });
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
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <PlainHeader title="مواعيدي" />
        <View style={{ padding: space(4) }}>
          <Card>
            <EmptyState
              icon={(c, sz) => <Icon.user size={sz} color={c} />}
              title="لم تسجّل الدخول بعد"
              hint="تدخل تلقائياً برقم هاتفك عند أول حجز — بلا كلمة مرور."
              action={<Button label="ابحث عن طبيب" onPress={() => router.replace("/")} />}
            />
          </Card>
        </View>
      </View>
    );
  }

  const upcoming = bookings?.filter((b) => b.isUpcoming) ?? [];
  const past = bookings?.filter((b) => !b.isUpcoming) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <PlainHeader title="مواعيدي">
        <Tabs
          tabs={[
            { key: "upcoming" as const, label: "القادمة", count: upcoming.length },
            { key: "past" as const, label: "السابقة", count: past.length },
          ]}
          active={tab}
          onPick={setTab}
        />
      </PlainHeader>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space(4), paddingBottom: space(8), gap: space(5) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={palette.primary}
            onRefresh={() => {
              setRefreshing(true);
              load();
              setTimeout(() => setRefreshing(false), 600);
            }}
          />
        }
      >
      {error ? <Alert message={error} /> : null}
      {bookings === null ? <Loading /> : null}

      {blocked ? (
        <Card>
          <EmptyState
            icon={(c, sz) => <Icon.user size={sz} color={c} />}
            title="هذا ليس هاتفك المعتاد"
            hint="مواعيدك تُفتح من الهاتف الذي حجزت منه أول مرّة، حمايةً لبياناتك. تستطيع الحجز من هنا عادةً، وإن غيّرت هاتفك فالعيادة تخبرك بمواعيدك."
            action={<Button label="ابحث عن طبيب" onPress={() => router.replace("/")} />}
          />
        </Card>
      ) : bookings?.length === 0 ? (
        <Card>
          <EmptyState
            icon={(c, sz) => <Icon.calendar size={sz} color={c} />}
            title="لا توجد حجوزات بعد"
            hint="ابحث عن طبيب في محافظتك واحجز موعدك."
            action={<Button label="ابحث عن طبيب" onPress={() => router.replace("/")} />}
          />
        </Card>
      ) : null}

      {/* التبويب يحكم المعروض؛ القوائم مبنيّة مرة واحدة أعلاه */}
      {tab === "upcoming" ? (
        upcoming.length > 0 ? (
          <View style={{ gap: space(3) }}>
            {upcoming.map((booking, i) => (
              <Appear key={booking.id} index={i}>
                <BookingCard
                  booking={booking}
                  onCancel={() => askCancel(booking)}
                  onReview={() => setReviewing(booking)}
                  cancelling={cancelling === booking.id}
                />
              </Appear>
            ))}
          </View>
        ) : bookings && bookings.length > 0 ? (
          <Card>
            <EmptyState
              icon={(c, sz) => <Icon.calendar size={sz} color={c} />}
              title="لا مواعيد قادمة"
              hint="كل مواعيدك السابقة في التبويب الثاني."
              action={<Button label="ابحث عن طبيب" onPress={() => router.replace("/")} />}
            />
          </Card>
        ) : null
      ) : past.length > 0 ? (
        <View style={{ gap: space(3) }}>
          {past.map((booking, i) => (
            <Appear key={booking.id} index={i}>
              <BookingCard booking={booking} onReview={() => setReviewing(booking)} />
            </Appear>
          ))}
        </View>
      ) : bookings && bookings.length > 0 ? (
        <Card>
          <EmptyState
            icon={(c, sz) => <Icon.clock size={sz} color={c} />}
            title="لا مواعيد سابقة"
            hint="ستظهر هنا الزيارات بعد انتهائها."
          />
        </Card>
      ) : null}

      </ScrollView>

      {reviewing ? (
        <ReviewSheet booking={reviewing} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); load(); }} />
      ) : null}
    </View>
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
            <Icon.star size={36} filled={value <= rating} color={value <= rating ? palette.goldBright : palette.lineStrong} />
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
  onReview,
  cancelling,
}: {
  booking: Booking;
  onCancel?: () => void;
  onReview?: () => void;
  cancelling?: boolean;
}) {
  const palette = usePalette();
  const status = STATUS_LABELS[booking.status] ?? { label: booking.status, tone: "muted" as const };

  return (
    <Card style={{ gap: space(3) }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space(3) }}>
        <IconTile size={44} bg={palette.primaryTint}>
          <Icon.user size={22} color={palette.primary} />
        </IconTile>
        <View style={{ flex: 1, gap: 2 }}>
          <T size={15.5} weight="bold" numberOfLines={1}>
            {booking.doctorName}
          </T>
          <T size={13} tone="muted" numberOfLines={1}>
            {booking.clinicName}
          </T>
        </View>
        <Badge tone={status.tone} label={status.label} />
      </View>

      {/* الموعد نفسه مبرَز: هو السبب الوحيد لفتح البطاقة */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space(2.5),
          backgroundColor: palette.primaryTint,
          borderRadius: radius.md,
          paddingHorizontal: space(3.5),
          paddingVertical: space(3),
        }}
      >
        <Icon.calendar size={19} color={palette.primary} />
        <T size={14} weight="semibold" tone="primary" style={{ flex: 1 }}>
          {formatDay(booking.sessionStart.slice(0, 10))} —{" "}
          {booking.bookingMode === "SLOT"
            ? formatClock(booking.slotStart)
            : `الدور ${toArabic(booking.queueNumber)} بين ${formatClock(booking.sessionStart)} و${formatClock(booking.sessionEnd)}`}
        </T>
      </View>

      <View style={{ gap: space(1.5) }}>
        <Row icon={(c, sz) => <Icon.user size={sz} color={c} />} text={`المريض: ${booking.patientName}`} />
        {booking.landmark ? <Row icon={(c, sz) => <Icon.pin size={sz} color={c} />} text={booking.landmark} /> : null}
      </View>

      {/* كعب التذكرة: الرقم والسعر — الحدّ المتقطّع يوحي بأنه قابل للاقتطاع.
          الرقم اليومي أوّلاً لا الكود المرجعي: هو ما تناديه العيادة، والكود
          يبقى تحته لمن يحتاجه من الموظّفين. حجوزٌ قديمة سبقت الترقيم بلا رقم. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space(2.5),
          borderTopWidth: 1.4,
          borderTopColor: palette.line,
          borderStyle: "dashed",
          paddingTop: space(3),
        }}
      >
        <Icon.ticket size={17} color={palette.gold} />
        {booking.dailyNumber ? (
          <View>
            <T size={16} weight="bold">
              رقمك {toArabic(booking.dailyNumber)}
            </T>
            <T size={11.5} tone="faint">
              {booking.reference}
            </T>
          </View>
        ) : (
          <T size={13.5} weight="bold">
            {booking.reference}
          </T>
        )}
        <View style={{ flex: 1 }} />
        <T size={13} tone="muted">
          {formatFee(booking.feeAmount)}
        </T>
      </View>

      {booking.canReview && onReview ? (
        <Button
          label="قيّم هذه الزيارة"
          variant="gold"
          size="sm"
          full
          icon={(c, sz) => <Icon.star size={sz} color={c} filled />}
          onPress={onReview}
        />
      ) : null}

      {onCancel || booking.clinicPhone ? (
        <View style={{ flexDirection: "row", gap: space(2) }}>
          {booking.clinicPhone ? (
            <Button
              label="اتصال"
              variant="soft"
              size="sm"
              style={{ flex: 1 }}
              icon={(c, sz) => <Icon.phone size={sz} color={c} />}
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

/** سطر أيقونة + نصّ — يتكرّر كثيراً في البطاقة */
function Row({ icon, text }: { icon: (color: string, size: number) => React.ReactNode; text: string }) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
      {icon(palette.faint, 15)}
      <T size={13} tone="muted" numberOfLines={1} style={{ flex: 1 }}>
        {text}
      </T>
    </View>
  );
}
