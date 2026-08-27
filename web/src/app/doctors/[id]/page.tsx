"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Loading, Select } from "@/components/ui";
import { api, getSession, saveSession, type SessionUser } from "@/lib/api";
import { formatDay, formatFee, formatTimeLabel, toArabic, todayISO, WEEKDAYS } from "@/lib/format";

type Profile = {
  id: string;
  title: string;
  fullName: string;
  bio: string | null;
  yearsOfExperience: number | null;
  specialties: string[];
  practices: {
    id: string;
    feeAmount: number;
    bookingMode: "SLOT" | "QUEUE";
    slotMinutes: number;
    cancelCutoffMinutes: number;
    depositAmount: number;
    clinicName: string;
    landmark: string | null;
    addressLine: string | null;
    phone: string | null;
    governorate: string;
    district: string;
    schedules: { weekday: number; startTime: string; endTime: string }[];
  }[];
};

type Slot = { start: string; time: string; taken: boolean };
type Session = {
  sessionStart: string;
  sessionEnd: string;
  startTime: string;
  endTime: string;
  bookingMode: "SLOT" | "QUEUE";
  slots: Slot[];
  capacity: number;
  booked: number;
  remaining: number;
  nextQueueNumber: number;
};
type Day = {
  date: string;
  weekdayName: string;
  isClosed: boolean;
  closedReason: string | null;
  hasSchedule: boolean;
  sessions: Session[];
  freeCount: number;
};

type Patient = { id: string; fullName: string; isSelf: boolean };

type Review = { id: string; rating: number; comment: string | null; createdAt: string; patientName: string };

export default function DoctorProfilePage() {
  const { id } = useParams<{ id: string }>();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [practiceId, setPracticeId] = useState<string | null>(null);
  const [days, setDays] = useState<Day[] | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [chosen, setChosen] = useState<{ startAt: string; label: string; queue: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Profile>(`/doctors/${id}`)
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
      <>
        <Header />
        <main className="max-w-3xl mx-auto px-4 pt-10">
          <Alert>{error}</Alert>
        </main>
      </>
    );
  }

  if (!profile || !practice) {
    return (
      <>
        <Header />
        <Loading />
      </>
    );
  }

  return (
    <>
      <Header subtitle="ملف الطبيب" />

      <main className="max-w-3xl mx-auto px-4 pb-24 pt-6">
        {/* ── هوية الطبيب ── */}
        <Card>
          <div className="flex gap-4">
            <span
              className="grid place-items-center w-16 h-16 rounded-full text-[22px] font-bold shrink-0"
              style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
              aria-hidden
            >
              {profile.fullName.charAt(0)}
            </span>
            <div className="flex-1 min-w-0">
              <h1 className="text-[20px] font-bold leading-snug" style={{ fontFamily: "var(--font-display)" }}>
                {profile.title} {profile.fullName}
              </h1>
              <p className="text-[14px] mt-0.5" style={{ color: "var(--primary)" }}>
                {profile.specialties.join(" · ")}
              </p>
              <div className="flex gap-2 mt-2.5 flex-wrap">
                <Badge tone="primary">{formatFee(practice.feeAmount)}</Badge>
                {profile.yearsOfExperience && (
                  <Badge tone="muted">خبرة {toArabic(profile.yearsOfExperience)} سنة</Badge>
                )}
                <Badge tone={practice.bookingMode === "QUEUE" ? "accent" : "muted"}>
                  {practice.bookingMode === "QUEUE" ? "نظام أدوار" : `كشف ${toArabic(practice.slotMinutes)} دقيقة`}
                </Badge>
                {practice.depositAmount > 0 && <Badge tone="warn">عربون {formatFee(practice.depositAmount)}</Badge>}
              </div>
            </div>
          </div>

          {profile.bio && (
            <p className="text-[14px] mt-4 leading-relaxed" style={{ color: "var(--muted)" }}>
              {profile.bio}
            </p>
          )}

          <div className="mt-4 pt-4 text-[13.5px]" style={{ borderTop: "1px solid var(--line)", color: "var(--muted)" }}>
            <p className="font-semibold" style={{ color: "var(--ink)" }}>
              {practice.clinicName}
            </p>
            <p>
              {practice.governorate}، {practice.district}
            </p>
            {/* العلامة المميزة تُستعمل للوصول أكثر من الخريطة نفسها */}
            {practice.landmark && <p className="mt-0.5">{practice.landmark}</p>}
            {practice.phone && (
              <a href={`tel:${practice.phone}`} className="inline-block mt-2 font-semibold" style={{ color: "var(--primary)" }}>
                اتصال بالعيادة
              </a>
            )}
          </div>

          {profile.practices.length > 1 && (
            <div className="mt-4">
              <label className="block text-[13px] font-semibold mb-1.5">اختر الموقع</label>
              <Select value={practiceId ?? ""} onChange={(e) => setPracticeId(e.target.value)}>
                {profile.practices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.clinicName} — {p.governorate}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </Card>

        {/* ── دوام الطبيب الأسبوعي ── */}
        {practice.schedules.length > 0 && (
          <Card className="mt-4">
            <h2 className="text-[15px] font-bold mb-2.5">أيام الدوام</h2>
            <div className="flex flex-wrap gap-2">
              {practice.schedules.map((s, i) => (
                <span
                  key={i}
                  className="text-[12.5px] px-2.5 py-1 rounded-[8px] tnum"
                  style={{ background: "var(--surface-2)", color: "var(--muted)" }}
                >
                  {WEEKDAYS[s.weekday]} {formatTimeLabel(s.startTime)} – {formatTimeLabel(s.endTime)}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* ── الأوقات المتاحة ── */}
        <section className="mt-6">
          <h2 className="text-[17px] font-bold mb-3" style={{ fontFamily: "var(--font-display)" }}>
            الأوقات المتاحة
          </h2>

          {days === null && <Loading label="جارٍ جلب الأوقات…" />}

          {days && (
            <>
              <DayStrip days={days} activeDate={activeDate} onPick={setActiveDate} />

              <Card className="mt-3">
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
                        ? "لم يبقَ مكان شاغر. اختر يوماً آخر من الشريط أعلاه."
                        : "الطبيب لا يداوم في هذا اليوم. الأيام التي فيها دوام مؤشَّرة في الشريط أعلاه."
                    }
                  />
                ) : (
                  <div className="grid gap-5">
                    {day.sessions.map((session) => (
                      <SessionBlock
                        key={session.sessionStart}
                        session={session}
                        onPick={(startAt, label, queue) => setChosen({ startAt, label, queue })}
                        selected={chosen?.startAt ?? null}
                      />
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </section>
        {reviews.length > 0 && (
          <section className="mt-6">
            <h2 className="text-[17px] font-bold mb-3" style={{ fontFamily: "var(--font-display)" }}>
              آراء المرضى
            </h2>
            <div className="grid gap-2.5">
              {reviews.map((review) => (
                <Card key={review.id}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[14px] font-semibold">{review.patientName}</span>
                    <span className="text-[13px]" style={{ color: "var(--accent)" }} aria-label={`${review.rating} من ٥`}>
                      {"★".repeat(review.rating)}
                      <span style={{ color: "var(--line-strong)" }}>{"★".repeat(5 - review.rating)}</span>
                    </span>
                  </div>
                  {review.comment && (
                    <p className="text-[14px] mt-2" style={{ color: "var(--muted)" }}>
                      {review.comment}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          </section>
        )}
      </main>

      {chosen && practice && day && (
        <BookingPanel
          practiceId={practice.id}
          doctorName={`${profile.title} ${profile.fullName}`}
          clinicName={practice.clinicName}
          date={day.date}
          chosen={chosen}
          cancelCutoffMinutes={practice.cancelCutoffMinutes}
          onClose={() => setChosen(null)}
          onBooked={() => {
            setChosen(null);
            if (practiceId) loadAvailability(practiceId);
          }}
        />
      )}
    </>
  );
}

/** شريط الأيام: لون الشارة يقول بلمحة أين توجد أماكن. */
function DayStrip({
  days,
  activeDate,
  onPick,
}: {
  days: Day[];
  activeDate: string | null;
  onPick: (date: string) => void;
}) {
  return (
    <div className="scroll-x -mx-1 px-1">
      <div className="flex gap-2 pb-1">
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
            <button
              key={day.date}
              onClick={() => onPick(day.date)}
              className="shrink-0 w-[72px] rounded-[12px] py-2.5 text-center transition-colors"
              style={{
                background: active ? "var(--primary)" : "var(--surface)",
                color: active ? "var(--on-primary)" : available ? "var(--ink)" : "var(--faint)",
                border: `1px solid ${active ? "var(--primary)" : "var(--line)"}`,
              }}
              aria-pressed={active}
            >
              <span className="block text-[12px] opacity-80">{day.weekdayName}</span>
              <span className="block text-[15px] font-bold tnum mt-0.5">
                {toArabic(Number(day.date.slice(8, 10)))}
              </span>
              <span
                className="block text-[11px] mt-1 tnum"
                style={{ color: active ? "var(--on-primary)" : available ? "var(--ok)" : "var(--faint)" }}
              >
                {note}
              </span>
            </button>
          );
        })}
      </div>
    </div>
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
  const range = `${formatTimeLabel(session.startTime)} – ${formatTimeLabel(session.endTime)}`;

  if (session.bookingMode === "QUEUE") {
    const active = selected === session.sessionStart;
    return (
      <div>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="text-[14px] font-semibold tnum">{range}</span>
          <Badge tone={session.remaining > 3 ? "ok" : "warn"}>
            بقي {toArabic(session.remaining)} من {toArabic(session.capacity)}
          </Badge>
        </div>
        <button
          onClick={() => onPick(session.sessionStart, range, session.nextQueueNumber)}
          className="w-full rounded-[12px] p-4 text-right transition-colors"
          style={{
            background: active ? "var(--accent)" : "var(--surface-2)",
            color: active ? "var(--on-accent)" : "var(--ink)",
            border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
          }}
        >
          <span className="block text-[15px] font-bold">دورك سيكون رقم {toArabic(session.nextQueueNumber)}</span>
          <span className="block text-[13px] mt-0.5 opacity-85">
            تحضر ضمن الفترة {range} — بلا وقت محدد
          </span>
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className="text-[14px] font-semibold tnum">{range}</span>
        <Badge tone="ok">{toArabic(session.remaining)} وقت شاغر</Badge>
      </div>
      {/* المحجوز لا يصل أصلاً من الخادم — ما يظهر هنا شاغر كله */}
      <div className="grid gap-2 grid-cols-3 sm:grid-cols-4">
        {session.slots.map((slot) => {
          const active = selected === slot.start;
          return (
            <button
              key={slot.start}
              onClick={() => onPick(slot.start, formatTimeLabel(slot.time), null)}
              className="rounded-[10px] py-2.5 text-[14px] font-semibold tnum transition-colors"
              style={{
                background: active ? "var(--accent)" : "var(--surface-2)",
                color: active ? "var(--on-accent)" : "var(--ink)",
                border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
              }}
              aria-pressed={active}
            >
              {formatTimeLabel(slot.time)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** لوحة الحجز: تسجيل الدخول برقم الهاتف إن لزم، ثم اختيار المريض والتأكيد. */
function BookingPanel({
  practiceId,
  doctorName,
  clinicName,
  date,
  chosen,
  cancelCutoffMinutes,
  onClose,
  onBooked,
}: {
  practiceId: string;
  doctorName: string;
  clinicName: string;
  date: string;
  chosen: { startAt: string; label: string; queue: number | null };
  cancelCutoffMinutes: number;
  onClose: () => void;
  onBooked: () => void;
}) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: string; queueNumber: number } | null>(null);

  // خطوات تسجيل الدخول برقم الهاتف
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
    const session = getSession();
    setUser(session);
    if (session?.role === "PATIENT") loadPatients();
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
      saveSession(session);
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
      const result = await api.post<{ reference: string; queueNumber: number }>("/bookings", {
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

  const summary = useMemo(
    () => (
      <div className="rounded-[12px] p-4 mb-4" style={{ background: "var(--primary-soft)" }}>
        <p className="text-[15px] font-bold">{doctorName}</p>
        <p className="text-[13.5px] mt-0.5" style={{ color: "var(--muted)" }}>
          {clinicName}
        </p>
        <p className="text-[14px] font-semibold mt-2 tnum" style={{ color: "var(--primary)" }}>
          {formatDay(date)} — {chosen.label}
          {chosen.queue !== null && ` · الدور ${toArabic(chosen.queue)}`}
        </p>
      </div>
    ),
    [doctorName, clinicName, date, chosen],
  );

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="إغلاق النافذة بالنقر خارجها" />
      <div
        className="relative w-full sm:max-w-md max-h-[88vh] overflow-y-auto rounded-t-[20px] sm:rounded-[18px] p-5"
        style={{ background: "var(--surface)", boxShadow: "var(--shadow-lg)" }}
      >
        {done ? (
          <div className="text-center py-4">
            <div
              className="mx-auto w-14 h-14 rounded-full grid place-items-center text-[24px] mb-3"
              style={{ background: "var(--ok-soft)", color: "var(--ok)" }}
            >
              ✓
            </div>
            <h2 className="text-[19px] font-bold" style={{ fontFamily: "var(--font-display)" }}>
              تم تثبيت حجزك
            </h2>
            <p className="text-[14px] mt-1" style={{ color: "var(--muted)" }}>
              أرسلنا التفاصيل إلى الطبيب.
            </p>
            <p className="text-[26px] font-bold tnum mt-4" style={{ color: "var(--primary)" }}>
              {done.reference}
            </p>
            <p className="text-[12.5px]" style={{ color: "var(--faint)" }}>
              الرقم المرجعي — اذكره للعيادة
            </p>
            {done.queueNumber > 0 && (
              <p className="text-[15px] font-semibold mt-3">دورك رقم {toArabic(done.queueNumber)}</p>
            )}
            <div className="grid gap-2 mt-5">
              <Link href="/my">
                <Button full>حجوزاتي</Button>
              </Link>
              <Button variant="outline" full onClick={onBooked}>
                إغلاق
              </Button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-[18px] font-bold mb-3" style={{ fontFamily: "var(--font-display)" }}>
              تأكيد الحجز
            </h2>
            {summary}

            {error && (
              <div className="mb-3">
                <Alert>{error}</Alert>
              </div>
            )}

            {!user || user.role !== "PATIENT" ? (
              <div className="grid gap-3">
                <p className="text-[13.5px]" style={{ color: "var(--muted)" }}>
                  أدخل رقم هاتفك ليصلك رمز تحقق — بلا كلمة مرور.
                </p>
                <Field label="رقم الهاتف">
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="07701234567"
                    inputMode="tel"
                    disabled={otpSent}
                  />
                </Field>

                {!otpSent ? (
                  <Button full loading={busy} onClick={requestCode} disabled={phone.length < 10}>
                    إرسال الرمز
                  </Button>
                ) : (
                  <>
                    <Field label="الاسم الكامل" hint="يظهر للطبيب في قائمة مرضاه">
                      <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="الاسم الثلاثي" />
                    </Field>
                    <Field label="رمز التحقق" hint={devCode ? `رمز التطوير: ${devCode}` : "وصلك برسالة نصية"}>
                      <Input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="******"
                        inputMode="numeric"
                        className="tnum tracking-[0.4em] text-center"
                      />
                    </Field>
                    <Button full loading={busy} onClick={verifyCode} disabled={code.length < 6}>
                      تأكيد الرمز
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="grid gap-3">
                <Field label="الموعد لمن؟" hint="تستطيع الحجز لأفراد عائلتك من حسابك">
                  <Select value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName} {p.isSelf ? "(أنا)" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="ملاحظة للطبيب" hint="اختياري — تصل مع تفاصيل الحجز">
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: ألم في الصدر منذ يومين" />
                </Field>

                <p className="text-[12.5px]" style={{ color: "var(--faint)" }}>
                  يمكنك الإلغاء حتى {toArabic(Math.round(cancelCutoffMinutes / 60))} ساعة قبل الموعد.
                </p>

                <Button variant="accent" size="lg" full loading={busy} onClick={confirm} disabled={!patientId}>
                  تثبيت الحجز
                </Button>
                <Button variant="ghost" full onClick={onClose}>
                  رجوع
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
