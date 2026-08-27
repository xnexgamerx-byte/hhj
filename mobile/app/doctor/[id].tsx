import { useCallback, useEffect, useState } from "react";
import { Linking, Modal, Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Loading, Stars, T } from "@/components/ui";
import {
  api,
  getSession,
  saveSession,
  type Day,
  type DoctorProfile,
  type Patient,
  type Review,
  type Session,
  type SessionUser,
} from "@/lib/api";
import { formatDay, formatFee, formatTimeLabel, toArabic, todayISO, WEEKDAYS } from "@/lib/format";
import { radius, space, usePalette } from "@/theme";

type Chosen = { startAt: string; label: string; queue: number | null };

export default function DoctorScreen() {
  const palette = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [practiceId, setPracticeId] = useState<string | null>(null);
  const [days, setDays] = useState<Day[] | null>(null);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DoctorProfile>(`/doctors/${id}`)
      .then((data) => {
        setProfile(data);
        setPracticeId(data.practices[0]?.id ?? null);
      })
      .catch((e) => setError(e.message));
    api.get<Review[]>(`/doctors/${id}/reviews`).then(setReviews).catch(() => {});
  }, [id]);

  const loadAvailability = useCallback((practice: string) => {
    setDays(null);
    api
      .get<Day[]>(`/practices/${practice}/availability?from=${todayISO()}`)
      .then((data) => {
        setDays(data);
        setActiveDate(data.find((d) => d.freeCount > 0)?.date ?? data[0]?.date ?? null);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (practiceId) loadAvailability(practiceId);
  }, [practiceId, loadAvailability]);

  const practice = profile?.practices.find((p) => p.id === practiceId);
  const day = days?.find((d) => d.date === activeDate);

  if (error && !profile) {
    return (
      <Screen title="الطبيب" back>
        <Alert message={error} />
      </Screen>
    );
  }
  if (!profile || !practice) {
    return (
      <Screen title="الطبيب" back>
        <Loading />
      </Screen>
    );
  }

  return (
    <>
      <Screen title={`${profile.title} ${profile.fullName}`} subtitle={profile.specialties.join(" · ")} back>
        {/* ── الهوية والسعر ── */}
        <Card style={{ gap: space(3) }}>
          <View style={{ flexDirection: "row", gap: space(3), alignItems: "center" }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: palette.primarySoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <T size={22} weight="bold" tone="primary" align="center">
                {profile.fullName.charAt(0)}
              </T>
            </View>
            <View style={{ flex: 1, gap: space(2) }}>
              <T size={18} weight="bold">
                {profile.title} {profile.fullName}
              </T>
              {profile.ratingCount > 0 ? <Stars value={profile.ratingAvg} count={profile.ratingCount} size={14} /> : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
                <Badge tone="primary" label={formatFee(practice.feeAmount)} />
                {profile.yearsOfExperience ? (
                  <Badge tone="muted" label={`خبرة ${toArabic(profile.yearsOfExperience)} سنة`} />
                ) : null}
                <Badge
                  tone={practice.bookingMode === "QUEUE" ? "accent" : "muted"}
                  label={
                    practice.bookingMode === "QUEUE"
                      ? "نظام أدوار"
                      : `كشف ${toArabic(practice.slotMinutes)} دقيقة`
                  }
                />
                {practice.depositAmount > 0 ? (
                  <Badge tone="warn" label={`عربون ${formatFee(practice.depositAmount)}`} />
                ) : null}
              </View>
            </View>
          </View>

          {profile.bio ? (
            <T size={14} tone="muted">
              {profile.bio}
            </T>
          ) : null}

          <View style={{ borderTopWidth: 1, borderTopColor: palette.line, paddingTop: space(3), gap: 2 }}>
            <T size={14} weight="semibold">
              {practice.clinicName}
            </T>
            <T size={13} tone="muted">
              {practice.governorate}، {practice.district}
            </T>
            {/* العلامة المميزة تُستعمل للوصول أكثر من الخريطة نفسها */}
            {practice.landmark ? (
              <T size={13} tone="muted">
                {practice.landmark}
              </T>
            ) : null}
            {practice.phone ? (
              <Button
                label="اتصال بالعيادة"
                variant="outline"
                size="sm"
                style={{ marginTop: space(2) }}
                onPress={() => Linking.openURL(`tel:${practice.phone}`)}
              />
            ) : null}
          </View>
        </Card>

        {/* ── أيام الدوام ── */}
        {practice.schedules.length > 0 ? (
          <Card style={{ gap: space(2) }}>
            <T size={15} weight="bold">
              أيام الدوام
            </T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
              {practice.schedules.map((schedule, index) => (
                <View
                  key={index}
                  style={{
                    backgroundColor: palette.surface2,
                    borderRadius: radius.sm,
                    paddingHorizontal: space(2.5),
                    paddingVertical: space(1),
                  }}
                >
                  <T size={12.5} tone="muted">
                    {WEEKDAYS[schedule.weekday]} {formatTimeLabel(schedule.startTime)} –{" "}
                    {formatTimeLabel(schedule.endTime)}
                  </T>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {/* ── الأوقات المتاحة ── */}
        <View style={{ gap: space(3) }}>
          <T size={17} weight="bold">
            الأوقات المتاحة
          </T>

          {days === null ? <Loading label="جارٍ جلب الأوقات…" /> : null}

          {days ? (
            <>
              <DayStrip days={days} activeDate={activeDate} onPick={setActiveDate} />

              <Card>
                {!day || day.isClosed ? (
                  <EmptyState
                    title="العيادة مغلقة هذا اليوم"
                    hint={day?.closedReason ? `السبب: ${day.closedReason}` : "اختر يوماً آخر من الشريط أعلاه."}
                  />
                ) : day.sessions.length === 0 ? (
                  <EmptyState
                    title={day.hasSchedule ? "اكتملت حجوزات هذا اليوم" : "لا دوام في هذا اليوم"}
                    hint={
                      day.hasSchedule
                        ? "لم يبقَ مكان شاغر. اختر يوماً آخر."
                        : "الطبيب لا يداوم في هذا اليوم. الأيام التي فيها دوام مؤشَّرة أعلاه."
                    }
                  />
                ) : (
                  <View style={{ gap: space(5) }}>
                    {day.sessions.map((session) => (
                      <SessionBlock
                        key={session.sessionStart}
                        session={session}
                        selected={chosen?.startAt ?? null}
                        onPick={(startAt, label, queue) => setChosen({ startAt, label, queue })}
                      />
                    ))}
                  </View>
                )}
              </Card>
            </>
          ) : null}
        </View>
        {reviews.length > 0 ? (
          <View style={{ gap: space(3) }}>
            <T size={17} weight="bold">
              آراء المرضى
            </T>
            {reviews.map((review) => (
              <Card key={review.id} style={{ gap: space(2) }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <T size={14} weight="semibold">
                    {review.patientName}
                  </T>
                  <Stars value={review.rating} />
                </View>
                {review.comment ? (
                  <T size={14} tone="muted">
                    {review.comment}
                  </T>
                ) : null}
              </Card>
            ))}
          </View>
        ) : null}
      </Screen>

      {chosen && day ? (
        <BookingSheet
          practiceId={practice.id}
          doctorName={`${profile.title} ${profile.fullName}`}
          clinicName={practice.clinicName}
          date={day.date}
          chosen={chosen}
          cancelCutoffMinutes={practice.cancelCutoffMinutes}
          depositAmount={practice.depositAmount}
          onClose={() => setChosen(null)}
          onBooked={() => {
            setChosen(null);
            if (practiceId) loadAvailability(practiceId);
          }}
        />
      ) : null}
    </>
  );
}

/** شريط الأيام: الشارة تقول بلمحة أين توجد أماكن. */
function DayStrip({
  days,
  activeDate,
  onPick,
}: {
  days: Day[];
  activeDate: string | null;
  onPick: (date: string) => void;
}) {
  const palette = usePalette();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
      {days.map((day) => {
        const active = day.date === activeDate;
        const available = day.freeCount > 0;
        // «ممتلئ» على يوم لا يداوم فيه الطبيب رسالة خاطئة ومضلِّلة
        const note = day.isClosed
          ? "مغلق"
          : !day.hasSchedule
            ? "لا دوام"
            : available
              ? `${toArabic(day.freeCount)} مكان`
              : "ممتلئ";

        return (
          <Pressable
            key={day.date}
            accessibilityRole="button"
            accessibilityLabel={`${day.weekdayName} ${day.date}، ${note}`}
            accessibilityState={{ selected: active }}
            onPress={() => onPick(day.date)}
            style={{
              width: 74,
              paddingVertical: space(2.5),
              borderRadius: radius.lg,
              alignItems: "center",
              backgroundColor: active ? palette.primary : palette.surface,
              borderWidth: 1,
              borderColor: active ? palette.primary : palette.line,
            }}
          >
            <T size={12} tone={active ? "onPrimary" : "muted"} align="center">
              {day.weekdayName}
            </T>
            <T size={16} weight="bold" tone={active ? "onPrimary" : available ? "ink" : "faint"} align="center">
              {toArabic(Number(day.date.slice(8, 10)))}
            </T>
            <T size={11} tone={active ? "onPrimary" : available ? "ok" : "faint"} align="center">
              {note}
            </T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SessionBlock({
  session,
  selected,
  onPick,
}: {
  session: Session;
  selected: string | null;
  onPick: (startAt: string, label: string, queue: number | null) => void;
}) {
  const palette = usePalette();
  const range = `${formatTimeLabel(session.startTime)} – ${formatTimeLabel(session.endTime)}`;

  if (session.bookingMode === "QUEUE") {
    const active = selected === session.sessionStart;
    return (
      <View style={{ gap: space(2.5) }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <T size={14} weight="semibold">
            {range}
          </T>
          <Badge
            tone={session.remaining > 3 ? "ok" : "warn"}
            label={`بقي ${toArabic(session.remaining)} من ${toArabic(session.capacity)}`}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
          onPress={() => onPick(session.sessionStart, range, session.nextQueueNumber)}
          style={{
            padding: space(4),
            borderRadius: radius.lg,
            backgroundColor: active ? palette.accent : palette.surface2,
            borderWidth: 1,
            borderColor: active ? palette.accent : palette.line,
          }}
        >
          <T size={15} weight="bold" tone={active ? "onAccent" : "ink"}>
            دورك سيكون رقم {toArabic(session.nextQueueNumber)}
          </T>
          <T size={13} tone={active ? "onAccent" : "muted"}>
            تحضر ضمن الفترة {range} — بلا وقت محدد
          </T>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ gap: space(2.5) }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <T size={14} weight="semibold">
          {range}
        </T>
        <Badge tone="ok" label={`${toArabic(session.remaining)} وقت شاغر`} />
      </View>
      {/* المحجوز لا يصل أصلاً من الخادم — ما يظهر هنا شاغر كله */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
        {session.slots.map((slot) => {
          const active = selected === slot.start;
          return (
            <Pressable
              key={slot.start}
              accessibilityRole="button"
              accessibilityLabel={formatTimeLabel(slot.time)}
              accessibilityState={{ selected: active }}
              onPress={() => onPick(slot.start, formatTimeLabel(slot.time), null)}
              style={{
                minWidth: 88,
                flexGrow: 1,
                paddingVertical: space(2.5),
                borderRadius: radius.md,
                alignItems: "center",
                backgroundColor: active ? palette.accent : palette.surface2,
                borderWidth: 1,
                borderColor: active ? palette.accent : palette.line,
              }}
            >
              <T size={14} weight="semibold" tone={active ? "onAccent" : "ink"} align="center">
                {formatTimeLabel(slot.time)}
              </T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** لوحة الحجز: دخول برقم الهاتف إن لزم، ثم اختيار المريض والتأكيد. */
function BookingSheet({
  practiceId,
  doctorName,
  clinicName,
  date,
  chosen,
  cancelCutoffMinutes,
  depositAmount,
  onClose,
  onBooked,
}: {
  practiceId: string;
  doctorName: string;
  clinicName: string;
  date: string;
  chosen: Chosen;
  cancelCutoffMinutes: number;
  depositAmount: number;
  onClose: () => void;
  onBooked: () => void;
}) {
  const palette = usePalette();
  const router = useRouter();

  const [user, setUser] = useState<SessionUser | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: string; queueNumber: number; status: string; depositAmount: number } | null>(
    null,
  );

  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  const loadPatients = useCallback(() => {
    api
      .get<Patient[]>("/me/patients")
      .then((list) => {
        setPatients(list);
        setPatientId(list.find((p) => p.isSelf)?.id ?? list[0]?.id ?? "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    getSession().then((session) => {
      setUser(session);
      if (session?.role === "PATIENT") loadPatients();
    });
  }, [loadPatients]);

  async function requestCode() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ devCode?: string }>("/auth/otp/request", { phone });
      setOtpSent(true);
      setDevCode(result.devCode ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setBusy(true);
    setError(null);
    try {
      const session = await api.post<{ accessToken: string; refreshToken: string; user: SessionUser }>(
        "/auth/otp/verify",
        { phone, code, fullName },
      );
      await saveSession(session);
      setUser(session.user);
      loadPatients();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ reference: string; queueNumber: number; status: string; depositAmount: number }>("/bookings", {
        doctorClinicId: practiceId,
        patientId,
        startAt: chosen.startAt,
        patientNote: note.trim() || undefined,
      });
      setDone(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

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
          maxHeight: "88%",
        }}
      >
        <ScrollView
          contentContainerStyle={{ padding: space(5), paddingBottom: space(10), gap: space(4) }}
          keyboardShouldPersistTaps="handled"
        >
          {done ? (
            <View style={{ alignItems: "center", gap: space(2), paddingVertical: space(3) }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: done.status === "HELD" ? palette.warnSoft : palette.okSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <T size={26} tone={done.status === "HELD" ? "warn" : "ok"} align="center">
                  {done.status === "HELD" ? "⏳" : "✓"}
                </T>
              </View>
              <T size={19} weight="bold" align="center">
                {done.status === "HELD" ? "حُجز وقتك مؤقتاً" : "تم تثبيت حجزك"}
              </T>
              <T size={14} tone="muted" align="center">
                {done.status === "HELD"
                  ? `ادفع عربون ${formatFee(done.depositAmount)} خلال ربع ساعة من شاشة «مواعيدي» لتثبيت الحجز.`
                  : "أرسلنا التفاصيل إلى الطبيب."}
              </T>
              <T size={26} weight="bold" tone="primary" align="center">
                {done.reference}
              </T>
              <T size={12.5} tone="faint" align="center">
                الرقم المرجعي — اذكره للعيادة
              </T>
              {done.queueNumber > 0 ? (
                <T size={15} weight="semibold" align="center">
                  دورك رقم {toArabic(done.queueNumber)}
                </T>
              ) : null}
              <View style={{ gap: space(2), alignSelf: "stretch", marginTop: space(3) }}>
                <Button
                  label={done.status === "HELD" ? "الذهاب للدفع" : "مواعيدي"}
                  variant={done.status === "HELD" ? "accent" : "primary"}
                  full
                  onPress={() => {
                    onBooked();
                    router.push("/bookings");
                  }}
                />
                <Button label="إغلاق" variant="outline" full onPress={onBooked} />
              </View>
            </View>
          ) : (
            <>
              <T size={18} weight="bold">
                تأكيد الحجز
              </T>

              <View style={{ backgroundColor: palette.primarySoft, borderRadius: radius.lg, padding: space(4), gap: 2 }}>
                <T size={15} weight="bold">
                  {doctorName}
                </T>
                <T size={13} tone="muted">
                  {clinicName}
                </T>
                <T size={14} weight="semibold" tone="primary">
                  {formatDay(date)} — {chosen.label}
                  {chosen.queue !== null ? ` · الدور ${toArabic(chosen.queue)}` : ""}
                </T>
              </View>

              {error ? <Alert message={error} /> : null}

              {!user || user.role !== "PATIENT" ? (
                <View style={{ gap: space(3) }}>
                  <T size={13.5} tone="muted">
                    أدخل رقم هاتفك ليصلك رمز تحقق — بلا كلمة مرور.
                  </T>
                  <Field label="رقم الهاتف">
                    <Input
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="07701234567"
                      keyboardType="phone-pad"
                      editable={!otpSent}
                    />
                  </Field>

                  {!otpSent ? (
                    <Button label="إرسال الرمز" full loading={busy} disabled={phone.length < 10} onPress={requestCode} />
                  ) : (
                    <>
                      <Field label="الاسم الكامل" hint="يظهر للطبيب في قائمة مرضاه">
                        <Input value={fullName} onChangeText={setFullName} placeholder="الاسم الثلاثي" />
                      </Field>
                      <Field label="رمز التحقق" hint={devCode ? `رمز التطوير: ${devCode}` : "وصلك برسالة نصية"}>
                        <Input
                          value={code}
                          onChangeText={setCode}
                          placeholder="******"
                          keyboardType="number-pad"
                          maxLength={6}
                          style={{ textAlign: "center", letterSpacing: 8 }}
                        />
                      </Field>
                      <Button label="تأكيد الرمز" full loading={busy} disabled={code.length < 6} onPress={verifyCode} />
                    </>
                  )}
                </View>
              ) : (
                <View style={{ gap: space(3) }}>
                  <Field label="الموعد لمن؟" hint="تستطيع الحجز لأفراد عائلتك من حسابك">
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
                      {patients.map((patient) => {
                        const active = patient.id === patientId;
                        return (
                          <Pressable
                            key={patient.id}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            onPress={() => setPatientId(patient.id)}
                            style={{
                              paddingHorizontal: space(3),
                              paddingVertical: space(2),
                              borderRadius: radius.md,
                              backgroundColor: active ? palette.primary : palette.surface2,
                              borderWidth: 1,
                              borderColor: active ? palette.primary : palette.line,
                            }}
                          >
                            <T size={13.5} weight="semibold" tone={active ? "onPrimary" : "ink"}>
                              {patient.fullName}
                              {patient.isSelf ? " (أنا)" : ""}
                            </T>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Field>

                  <Field label="ملاحظة للطبيب" hint="اختياري — تصل مع تفاصيل الحجز">
                    <Input
                      value={note}
                      onChangeText={setNote}
                      placeholder="مثلاً: ألم في الصدر منذ يومين"
                      multiline
                      numberOfLines={2}
                    />
                  </Field>

                  {depositAmount > 0 ? (
                    <View style={{ backgroundColor: palette.warnSoft, borderRadius: radius.md, padding: space(3) }}>
                      <T size={13.5} weight="semibold" tone="warn">
                        هذه العيادة تطلب عربون {formatFee(depositAmount)}
                      </T>
                      <T size={12.5} tone="warn">
                        يُخصم من أجرة الكشف عند حضورك. يُحجز وقتك ربع ساعة لتدفعه.
                      </T>
                    </View>
                  ) : null}

                  <T size={12.5} tone="faint">
                    يمكنك الإلغاء حتى {toArabic(Math.round(cancelCutoffMinutes / 60))} ساعة قبل الموعد.
                  </T>

                  <Button
                    label={depositAmount > 0 ? "حجز ومتابعة للدفع" : "تثبيت الحجز"}
                    variant="accent"
                    size="lg"
                    full
                    loading={busy}
                    disabled={!patientId}
                    onPress={confirm}
                  />
                  <Button label="رجوع" variant="ghost" full onPress={onClose} />
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
