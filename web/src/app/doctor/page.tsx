"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Alert, Badge, Button, Card, Dialog, EmptyState, Field, Input, Loading, Select, StatTile } from "@/components/ui";
import { api, getSession } from "@/lib/api";
import { addDays, formatClock, formatDay, formatTimeLabel, statNumber, STATUS_LABELS, toArabic, todayISO, WEEKDAYS } from "@/lib/format";

type Schedule = { id: string; weekday: number; weekdayName: string; startTime: string; endTime: string };
type Practice = {
  id: string;
  clinicName: string;
  landmark: string | null;
  governorate: string;
  district: string;
  feeAmount: number;
  bookingMode: "SLOT" | "QUEUE";
  slotMinutes: number;
  capacityPerSession: number;
  autoConfirm: boolean;
  schedules: Schedule[];
};
type Appointment = {
  id: string;
  reference: string;
  status: string;
  paymentStatus: string;
  depositAmount: number;
  bookingMode: "SLOT" | "QUEUE";
  queueNumber: number;
  slotStart: string;
  sessionStart: string;
  sessionEnd: string;
  patientName: string;
  patientPhone: string | null;
  patientNote: string | null;
  clinicName: string;
  doctorName: string;
  practiceId: string;
  arrivedAt: string | null;
  isWalkIn: boolean;
};

type ClinicContext = {
  role: "DOCTOR" | "STAFF";
  canManageSchedule: boolean;
  practices: {
    id: string;
    clinicName: string;
    landmark: string | null;
    doctorName: string;
    bookingMode: "SLOT" | "QUEUE";
    feeAmount: number;
  }[];
};
type AvailabilityDay = {
  date: string;
  isClosed: boolean;
  hasSchedule: boolean;
  sessions: {
    sessionStart: string;
    startTime: string;
    endTime: string;
    bookingMode: "SLOT" | "QUEUE";
    slots: { start: string; time: string; taken: boolean }[];
    remaining: number;
  }[];
};

type ExceptionRow = { id: string; date: string; type: "CLOSED" | "CUSTOM"; startTime: string | null; endTime: string | null; reason: string | null };

type Tab = "today" | "hours" | "off";

export default function DoctorDashboard() {
  const router = useRouter();
  const [context, setContext] = useState<ClinicContext | null>(null);
  const [practices, setPractices] = useState<Practice[] | null>(null);
  const [practiceId, setPracticeId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [error, setError] = useState<string | null>(null);

  const loadContext = useCallback(async () => {
    try {
      const ctx = await api.get<ClinicContext>("/clinic/me");
      setContext(ctx);
      setPracticeId((current) => current ?? ctx.practices[0]?.id ?? null);

      // جدول الدوام وإعداداته للطبيب وحده — السكرتير لا يعدّل السعر ولا الملف
      if (ctx.role === "DOCTOR") {
        setPractices(await api.get<Practice[]>("/doctor/me/practices"));
      } else {
        setPractices([]);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    const session = getSession();
    if (!session || (session.role !== "DOCTOR" && session.role !== "STAFF")) {
      router.replace("/login");
      return;
    }
    void loadContext();
  }, [router, loadContext]);

  const practice = practices?.find((p) => p.id === practiceId) ?? null;
  const isDoctor = context?.role === "DOCTOR";

  return (
    <>
      <Header subtitle="لوحة الطبيب" />
      <main className="max-w-4xl mx-auto px-4 pb-20 pt-6">
        {error && (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        )}

        {context === null && !error && <Loading />}

        {context?.practices.length === 0 && (
          <Card>
            <EmptyState
              title="لم تُربط بعيادة بعد"
              hint="راجع إدارة المنصة لربط حسابك بعيادة، ثم تستطيع إدارة الحجوزات."
            />
          </Card>
        )}

        {context && context.practices.length > 0 && (
          <>
            {context.practices.length > 1 && (
              <div className="mb-4 max-w-sm">
                <label className="block text-[13px] font-semibold mb-1.5">العيادة</label>
                <Select value={practiceId ?? ""} onChange={(e) => setPracticeId(e.target.value)}>
                  {context.practices.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.clinicName} — {p.doctorName}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <nav className="flex gap-1 mb-5 p-1 rounded-[12px] w-fit" style={{ background: "var(--surface-2)" }}>
              {(
                [
                  ["today", "مرضى اليوم"],
                  ...(isDoctor ? ([["hours", "أوقات الحجز"], ["off", "الإجازات"]] as [Tab, string][]) : []),
                ] as [Tab, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className="px-4 py-2 rounded-[9px] text-[14px] font-semibold transition-colors"
                  style={{
                    background: tab === key ? "var(--surface)" : "transparent",
                    color: tab === key ? "var(--ink)" : "var(--muted)",
                    boxShadow: tab === key ? "var(--shadow-sm)" : "none",
                  }}
                  aria-pressed={tab === key}
                >
                  {label}
                </button>
              ))}
            </nav>

            {tab === "today" && (
              <TodayTab
                context={context}
                practiceId={practiceId}
              />
            )}
            {tab === "hours" && practice && <HoursTab practice={practice} onSaved={() => void loadContext()} />}
            {tab === "off" && practice && <TimeOffTab practice={practice} />}
          </>
        )}
      </main>
    </>
  );
}

/* ── مرضى اليوم ─────────────────────────────────────────────── */

function TodayTab({ context, practiceId }: { context: ClinicContext; practiceId: string | null }) {
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [walkIn, setWalkIn] = useState(false);
  const [shifting, setShifting] = useState(false);

  const load = useCallback((day: string) => {
    setRows(null);
    api
      .get<Appointment[]>(`/clinic/me/appointments?date=${day}`)
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => load(date), [date, load]);

  const visible = (rows ?? []).filter((row) => !practiceId || row.practiceId === practiceId);
  const active = visible.filter((row) => !row.status.startsWith("CANCELLED"));
  const attended = active.filter((row) => row.arrivedAt || row.status === "COMPLETED").length;
  const noShow = active.filter((row) => row.status === "NO_SHOW").length;
  const awaitingDeposit = active.filter((row) => row.paymentStatus === "PENDING").length;

  async function mark(id: string, status: "CONFIRMED" | "NO_SHOW" | "COMPLETED") {
    setBusy(id);
    try {
      await api.patch(`/clinic/me/appointments/${id}/status`, { status });
      load(date);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function markPaid(id: string) {
    setBusy(id);
    try {
      await api.post(`/clinic/me/appointments/${id}/mark-paid`, {});
      load(date);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const sessions = [...new Set(active.map((row) => row.sessionStart))];

  return (
    <>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, -1))}>
          ← السابق
        </Button>
        <span className="text-[15px] font-bold px-2">{formatDay(date)}</span>
        <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, 1))}>
          التالي →
        </Button>
        {date !== todayISO() && (
          <Button variant="ghost" size="sm" onClick={() => setDate(todayISO())}>
            اليوم
          </Button>
        )}
        <div className="flex-1" />
        {practiceId && (
          <>
            <Button variant="accent" size="sm" onClick={() => setWalkIn(true)}>
              + حجز يدوي
            </Button>
            {sessions.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShifting(true)}>
                تأجيل الفترة
              </Button>
            )}
          </>
        )}
      </div>

      <div className={`grid gap-3 mb-5 ${awaitingDeposit > 0 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
        <StatTile label="الحجوزات" value={statNumber(active.length)} />
        <StatTile label="حضروا" value={statNumber(attended)} tone="ok" />
        <StatTile label="لم يحضروا" value={statNumber(noShow)} tone="danger" />
        {awaitingDeposit > 0 && <StatTile label="بانتظار العربون" value={statNumber(awaitingDeposit)} tone="warn" />}
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {rows === null && <Loading />}

      {rows !== null && visible.length === 0 && (
        <Card>
          <EmptyState
            title="لا توجد حجوزات في هذا اليوم"
            hint="الحجوزات الجديدة تظهر هنا فور إتمامها، ويمكنك إضافة حجز يدوي لمريض حضر بلا تطبيق."
            action={practiceId ? <Button onClick={() => setWalkIn(true)}>+ حجز يدوي</Button> : undefined}
          />
        </Card>
      )}

      <div className="grid gap-2.5">
        {visible.map((row) => {
          const status = STATUS_LABELS[row.status] ?? { label: row.status, tone: "muted" as const };
          const cancelled = row.status.startsWith("CANCELLED");
          const heldForDeposit = row.status === "HELD" || row.paymentStatus === "PENDING";

          return (
            <Card key={row.id} className={cancelled ? "opacity-60" : ""}>
              <div className="flex items-start gap-3">
                <span
                  className="grid place-items-center w-11 h-11 rounded-[11px] text-[15px] font-bold shrink-0 tnum"
                  style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
                >
                  {row.bookingMode === "QUEUE"
                    ? toArabic(row.queueNumber)
                    : formatClock(row.slotStart).replace(/\s.*/, "")}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <p className="text-[15.5px] font-bold">{row.patientName}</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {row.isWalkIn && <Badge tone="muted">حجز يدوي</Badge>}
                      {heldForDeposit && !cancelled && (
                        <Badge tone="warn">عربون {toArabic(row.depositAmount.toLocaleString("en-US"))} غير مدفوع</Badge>
                      )}
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                  </div>

                  <p className="text-[13px] mt-0.5 tnum" style={{ color: "var(--muted)" }}>
                    {row.bookingMode === "QUEUE"
                      ? `الدور ${toArabic(row.queueNumber)} · ${formatClock(row.sessionStart)} – ${formatClock(row.sessionEnd)}`
                      : formatClock(row.slotStart)}
                    {" · "}
                    {row.reference}
                    {context.practices.length > 1 && ` · ${row.clinicName}`}
                  </p>

                  {row.patientNote && (
                    <p
                      className="text-[13px] mt-2 px-3 py-2 rounded-[8px]"
                      style={{ background: "var(--surface-2)", color: "var(--muted)" }}
                    >
                      {row.patientNote}
                    </p>
                  )}

                  {!cancelled && (
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {row.patientPhone && (
                        <a href={`tel:${row.patientPhone}`}>
                          <Button variant="outline" size="sm">
                            اتصال
                          </Button>
                        </a>
                      )}
                      {heldForDeposit ? (
                        <Button variant="accent" size="sm" loading={busy === row.id} onClick={() => markPaid(row.id)}>
                          قبضتُ العربون
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant={row.arrivedAt ? "outline" : "primary"}
                            size="sm"
                            loading={busy === row.id}
                            onClick={() => mark(row.id, "CONFIRMED")}
                          >
                            حضر
                          </Button>
                          <Button variant="outline" size="sm" loading={busy === row.id} onClick={() => mark(row.id, "COMPLETED")}>
                            تم الكشف
                          </Button>
                          <Button variant="danger" size="sm" loading={busy === row.id} onClick={() => mark(row.id, "NO_SHOW")}>
                            لم يحضر
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {walkIn && practiceId && (
        <WalkInDialog
          practiceId={practiceId}
          date={date}
          onClose={() => setWalkIn(false)}
          onCreated={() => {
            setWalkIn(false);
            load(date);
          }}
        />
      )}

      {shifting && practiceId && (
        <ShiftDialog
          practiceId={practiceId}
          sessions={sessions}
          onClose={() => setShifting(false)}
          onShifted={() => {
            setShifting(false);
            load(date);
          }}
        />
      )}
    </>
  );
}

/** حجز يدوي لمريض حضر أو اتصل بلا تطبيق — أكثر ما يستعمله السكرتير. */
function WalkInDialog({
  practiceId,
  date,
  onClose,
  onCreated,
}: {
  practiceId: string;
  date: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [days, setDays] = useState<AvailabilityDay[] | null>(null);
  const [startAt, setStartAt] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AvailabilityDay[]>(`/doctor/me/practices/${practiceId}/availability?from=${date}&to=${date}`)
      .then(setDays)
      .catch((e) => setError(e.message));
  }, [practiceId, date]);

  const options = (days?.[0]?.sessions ?? []).flatMap((session) =>
    session.bookingMode === "SLOT"
      ? session.slots.filter((slot) => !slot.taken).map((slot) => ({ value: slot.start, label: formatTimeLabel(slot.time) }))
      : [{ value: session.sessionStart, label: `الدور التالي · ${formatTimeLabel(session.startTime)} – ${formatTimeLabel(session.endTime)}` }],
  );

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/clinic/me/walk-in", { doctorClinicId: practiceId, fullName, phone, startAt, note: note || undefined });
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="حجز يدوي" hint="لمريض حضر أو اتصل بلا تطبيق. يُنشأ له حساب برقمه فيصله التذكير." onClose={onClose}>
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="grid gap-3">
        <Field label="اسم المريض">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="الاسم الثلاثي" />
        </Field>
        <Field label="رقم الهاتف" hint="يقبل ٠٧٧٠ أو ‎+964">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07701234567" />
        </Field>
        <Field label="الوقت" hint={options.length === 0 ? "لا توجد أوقات شاغرة في هذا اليوم" : undefined}>
          <Select value={startAt} onChange={(e) => setStartAt(e.target.value)}>
            <option value="">اختر الوقت</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ملاحظة" hint="اختياري">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: حالة طارئة" />
        </Field>
        <Button size="lg" full loading={busy} disabled={!fullName || !phone || !startAt} onClick={submit}>
          تثبيت الحجز
        </Button>
        <Button variant="ghost" full onClick={onClose}>
          إلغاء
        </Button>
      </div>
    </Dialog>
  );
}

/** الطبيب تأخر: تُزاح مواعيد الفترة كلها دفعة واحدة. */
function ShiftDialog({
  practiceId,
  sessions,
  onClose,
  onShifted,
}: {
  practiceId: string;
  sessions: string[];
  onClose: () => void;
  onShifted: () => void;
}) {
  const [sessionStart, setSessionStart] = useState(sessions[0] ?? "");
  const [minutes, setMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/clinic/me/shift", { doctorClinicId: practiceId, sessionStart, minutes });
      onShifted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="تأجيل الفترة" hint="تُزاح مواعيد الفترة كلها معاً — إما كلها أو لا شيء." onClose={onClose}>
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="grid gap-3">
        <Field label="الفترة">
          <Select value={sessionStart} onChange={(e) => setSessionStart(e.target.value)}>
            {sessions.map((session) => (
              <option key={session} value={session}>
                {formatClock(session)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="مقدار التأجيل">
          <Select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {[15, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {toArabic(m)} دقيقة
              </option>
            ))}
          </Select>
        </Field>
        <Button size="lg" full loading={busy} disabled={!sessionStart} onClick={submit}>
          تأجيل
        </Button>
        <Button variant="ghost" full onClick={onClose}>
          إلغاء
        </Button>
      </div>
    </Dialog>
  );
}

/* ── أوقات الحجز ────────────────────────────────────────────── */

type DraftRow = { weekday: number; startTime: string; endTime: string };

function HoursTab({ practice, onSaved }: { practice: Practice; onSaved: () => void }) {
  const [rows, setRows] = useState<DraftRow[]>(
    practice.schedules.map((s) => ({ weekday: s.weekday, startTime: s.startTime, endTime: s.endTime })),
  );
  const [mode, setMode] = useState(practice.bookingMode);
  const [slotMinutes, setSlotMinutes] = useState(practice.slotMinutes);
  const [capacity, setCapacity] = useState(practice.capacityPerSession);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setRows(practice.schedules.map((s) => ({ weekday: s.weekday, startTime: s.startTime, endTime: s.endTime })));
    setMode(practice.bookingMode);
    setSlotMinutes(practice.slotMinutes);
    setCapacity(practice.capacityPerSession);
  }, [practice]);

  function toggleDay(weekday: number) {
    setSaved(false);
    setRows((current) =>
      current.some((r) => r.weekday === weekday)
        ? current.filter((r) => r.weekday !== weekday)
        : [...current, { weekday, startTime: "16:00", endTime: "19:00" }],
    );
  }

  function updateRow(index: number, patch: Partial<DraftRow>) {
    setSaved(false);
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/doctor/me/practices/${practice.id}/settings`, {
        bookingMode: mode,
        slotMinutes,
        capacityPerSession: capacity,
      });
      await api.put(`/doctor/me/practices/${practice.id}/schedule`, { entries: rows });
      setSaved(true);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // كم موعداً يفتحه هذا الجدول أسبوعياً — رقم يجعل أثر التعديل ملموساً
  const weeklyCapacity = rows.reduce((sum, row) => {
    const minutes = toMinutes(row.endTime) - toMinutes(row.startTime);
    if (minutes <= 0) return sum;
    return sum + (mode === "SLOT" ? Math.floor(minutes / slotMinutes) : capacity);
  }, 0);

  return (
    <>
      <Card className="mb-4">
        <h2 className="text-[16px] font-bold mb-1" style={{ fontFamily: "var(--font-display)" }}>
          أيام وساعات دوامك
        </h2>
        <p className="text-[13.5px] mb-4" style={{ color: "var(--muted)" }}>
          اختر أيامك وحدد ساعاتها. ما تحفظه هنا هو ما يراه المرضى — والوقت المحجوز يُقفل تلقائياً.
        </p>

        <div className="flex flex-wrap gap-2 mb-5">
          {WEEKDAYS.map((name, weekday) => {
            const on = rows.some((r) => r.weekday === weekday);
            return (
              <button
                key={weekday}
                onClick={() => toggleDay(weekday)}
                className="px-3.5 py-2 rounded-[10px] text-[13.5px] font-semibold transition-colors"
                style={{
                  background: on ? "var(--primary)" : "var(--surface-2)",
                  color: on ? "var(--on-primary)" : "var(--muted)",
                  border: `1px solid ${on ? "var(--primary)" : "var(--line)"}`,
                }}
                aria-pressed={on}
              >
                {name}
              </button>
            );
          })}
        </div>

        <div className="grid gap-2.5">
          {[...rows]
            .map((row, index) => ({ row, index }))
            .sort((a, b) => a.row.weekday - b.row.weekday)
            .map(({ row, index }) => (
              <div
                key={`${row.weekday}-${index}`}
                className="flex items-center gap-3 p-3 rounded-[10px] flex-wrap"
                style={{ background: "var(--surface-2)" }}
              >
                <span className="text-[14px] font-semibold w-16">{WEEKDAYS[row.weekday]}</span>
                <input
                  type="time"
                  value={row.startTime}
                  onChange={(e) => updateRow(index, { startTime: e.target.value })}
                  className="rounded-[8px] px-2.5 py-1.5 text-[14px] tnum"
                  style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink)" }}
                  aria-label={`بداية دوام ${WEEKDAYS[row.weekday]}`}
                />
                <span style={{ color: "var(--faint)" }}>إلى</span>
                <input
                  type="time"
                  value={row.endTime}
                  onChange={(e) => updateRow(index, { endTime: e.target.value })}
                  className="rounded-[8px] px-2.5 py-1.5 text-[14px] tnum"
                  style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink)" }}
                  aria-label={`نهاية دوام ${WEEKDAYS[row.weekday]}`}
                />
                <span className="text-[12.5px] tnum" style={{ color: "var(--muted)" }}>
                  {formatTimeLabel(row.startTime)} – {formatTimeLabel(row.endTime)}
                </span>
                <button
                  onClick={() => setRows((c) => c.filter((_, i) => i !== index))}
                  className="ms-auto text-[13px] font-semibold px-2 py-1"
                  style={{ color: "var(--danger)" }}
                >
                  حذف
                </button>
              </div>
            ))}

          {rows.length === 0 && (
            <p className="text-[14px] py-6 text-center" style={{ color: "var(--muted)" }}>
              لم تختر أي يوم — لن يستطيع أحد الحجز عندك.
            </p>
          )}
        </div>

        {rows.length > 0 && (
          <button
            onClick={() => {
              const used = new Set(rows.map((r) => r.weekday));
              const free = WEEKDAYS.findIndex((_, i) => !used.has(i));
              toggleDay(free === -1 ? rows[0].weekday : free);
            }}
            className="mt-3 text-[13.5px] font-semibold"
            style={{ color: "var(--primary)" }}
          >
            + إضافة يوم
          </button>
        )}
      </Card>

      <Card className="mb-4">
        <h2 className="text-[16px] font-bold mb-3" style={{ fontFamily: "var(--font-display)" }}>
          طريقة استقبال المرضى
        </h2>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <ModeOption
            active={mode === "SLOT"}
            title="موعد بوقت محدد"
            hint="لكل مريض وقت خاص: ٤:٠٠، ٤:٢٠، ٤:٤٠"
            onClick={() => {
              setMode("SLOT");
              setSaved(false);
            }}
          />
          <ModeOption
            active={mode === "QUEUE"}
            title="رقم دور"
            hint="المريض يأخذ دوراً ضمن الفترة بلا وقت دقيق"
            onClick={() => {
              setMode("QUEUE");
              setSaved(false);
            }}
          />
        </div>

        <div className="mt-4 max-w-xs">
          {mode === "SLOT" ? (
            <Field label="مدة الكشف الواحد" hint="تحدد عدد المواعيد في الساعة">
              <Select
                value={slotMinutes}
                onChange={(e) => {
                  setSlotMinutes(Number(e.target.value));
                  setSaved(false);
                }}
              >
                {[10, 15, 20, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>
                    {toArabic(m)} دقيقة
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="عدد المرضى في الفترة" hint="عند اكتماله تُغلق الفترة تلقائياً">
              <Input
                type="number"
                min={1}
                max={200}
                value={capacity}
                onChange={(e) => {
                  setCapacity(Number(e.target.value));
                  setSaved(false);
                }}
                className="tnum"
              />
            </Field>
          )}
        </div>
      </Card>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {saved && (
        <div className="mb-4">
          <Alert tone="ok">حُفظ الجدول. المرضى يرون الأوقات الجديدة الآن.</Alert>
        </div>
      )}

      <div
        className="sticky bottom-0 flex items-center justify-between gap-3 p-3 rounded-[12px] flex-wrap"
        style={{ background: "var(--surface)", border: "1px solid var(--line)", boxShadow: "var(--shadow)" }}
      >
        <span className="text-[13.5px] tnum" style={{ color: "var(--muted)" }}>
          هذا الجدول يفتح <strong style={{ color: "var(--ink)" }}>{toArabic(weeklyCapacity)}</strong> موعداً في الأسبوع
        </span>
        <Button onClick={save} loading={busy}>
          حفظ الجدول
        </Button>
      </div>
    </>
  );
}

function ModeOption({
  active,
  title,
  hint,
  onClick,
}: {
  active: boolean;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-right p-3.5 rounded-[12px] transition-colors"
      style={{
        background: active ? "var(--primary-soft)" : "var(--surface-2)",
        border: `1px solid ${active ? "var(--primary)" : "var(--line)"}`,
      }}
      aria-pressed={active}
    >
      <span className="block text-[14.5px] font-bold" style={{ color: active ? "var(--primary)" : "var(--ink)" }}>
        {title}
      </span>
      <span className="block text-[12.5px] mt-0.5" style={{ color: "var(--muted)" }}>
        {hint}
      </span>
    </button>
  );
}

/* ── الإجازات ───────────────────────────────────────────────── */

function TimeOffTab({ practice }: { practice: Practice }) {
  const [rows, setRows] = useState<ExceptionRow[] | null>(null);
  const [date, setDate] = useState(todayISO());
  const [partial, setPartial] = useState(false);
  const [startTime, setStartTime] = useState("17:00");
  const [endTime, setEndTime] = useState("18:00");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<ExceptionRow[]>(`/doctor/me/practices/${practice.id}/exceptions`)
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [practice.id]);

  useEffect(load, [load]);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/doctor/me/practices/${practice.id}/exceptions`, {
        date,
        type: "CLOSED",
        startTime: partial ? startTime : undefined,
        endTime: partial ? endTime : undefined,
        reason: reason.trim() || undefined,
      });
      setReason("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.del(`/doctor/me/exceptions/${id}`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <Card className="mb-4">
        <h2 className="text-[16px] font-bold mb-1" style={{ fontFamily: "var(--font-display)" }}>
          تعطيل يوم أو فترة
        </h2>
        <p className="text-[13.5px] mb-4" style={{ color: "var(--muted)" }}>
          الأيام المعطّلة تختفي من شاشة المرضى فوراً.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="التاريخ">
            <Input type="date" value={date} min={todayISO()} onChange={(e) => setDate(e.target.value)} className="tnum" />
          </Field>
          <Field label="السبب" hint="اختياري — يظهر للمريض">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سفر، مؤتمر، ظرف طارئ" />
          </Field>
        </div>

        <label className="flex items-center gap-2 mt-3 text-[14px] cursor-pointer">
          <input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} />
          تعطيل فترة من اليوم فقط، لا اليوم كله
        </label>

        {partial && (
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-[8px] px-2.5 py-1.5 text-[14px] tnum"
              style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink)" }}
              aria-label="بداية التعطيل"
            />
            <span style={{ color: "var(--faint)" }}>إلى</span>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="rounded-[8px] px-2.5 py-1.5 text-[14px] tnum"
              style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink)" }}
              aria-label="نهاية التعطيل"
            />
          </div>
        )}

        {error && (
          <div className="mt-3">
            <Alert>{error}</Alert>
          </div>
        )}

        <div className="mt-4">
          <Button onClick={add} loading={busy}>
            تعطيل
          </Button>
        </div>
      </Card>

      {rows === null && <Loading />}
      {rows?.length === 0 && (
        <Card>
          <EmptyState title="لا توجد إجازات قادمة" hint="دوامك يعمل حسب الجدول الأسبوعي." />
        </Card>
      )}

      <div className="grid gap-2.5">
        {rows?.map((row) => (
          <Card key={row.id}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-[14.5px] font-bold">{formatDay(row.date.slice(0, 10))}</p>
                <p className="text-[13px] mt-0.5 tnum" style={{ color: "var(--muted)" }}>
                  {row.startTime
                    ? `من ${formatTimeLabel(row.startTime)} إلى ${formatTimeLabel(row.endTime ?? "23:59")}`
                    : "اليوم كامل"}
                  {row.reason && ` · ${row.reason}`}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => remove(row.id)}>
                إلغاء التعطيل
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

function toMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}
