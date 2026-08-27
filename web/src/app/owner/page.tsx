"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Alert, Badge, Button, Card, Dialog, EmptyState, Field, Input, Loading, SectionTitle, Select, StatTile } from "@/components/ui";
import { api, getSession } from "@/lib/api";
import { formatClock, formatDay, statNumber, toArabic } from "@/lib/format";

type Summary = {
  doctors: { total: number; active: number; awaitingFirstLogin: number; withoutWhatsApp: number; withoutSchedule: number };
  clinics: number;
  patients: number;
  bookings: { today: number; week: number; month: number };
  attendance: { completed: number; noShow: number; noShowRate: number };
  whatsapp: Record<string, number>;
  topGovernorates: { name: string; clinics: number }[];
  dailyBookings: { date: string; weekdayName: string; shortName: string; count: number }[];
  recentBookings: {
    id: string;
    reference: string;
    status: string;
    patientName: string;
    doctorName: string;
    clinicName: string;
    sessionStart: string;
    createdAt: string;
  }[];
};

type DoctorRow = {
  id: string;
  title: string;
  isActive: boolean;
  isPublished: boolean;
  whatsappNumber: string | null;
  whatsappEnabled: boolean;
  registeredAt: string;
  user: { fullName: string; email: string | null; lastLoginAt: string | null; mustChangePassword: boolean };
  specialties: { specialty: { nameAr: string }; isPrimary: boolean }[];
  _count: { practices: number };
};

type Tab = "overview" | "doctors" | "staff" | "reviews" | "messages";

export default function OwnerDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session || session.role !== "OWNER") {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return <Loading />;

  return (
    <>
      <Header subtitle="لوحة المالك" />
      <main className="max-w-5xl mx-auto px-4 pb-20 pt-6">
        <nav className="flex gap-1 mb-5 p-1 rounded-[12px] w-fit" style={{ background: "var(--surface-2)" }}>
          {(
            [
              ["overview", "نظرة عامة"],
              ["doctors", "الأطباء"],
              ["staff", "السكرتيرون"],
              ["reviews", "التقييمات"],
              ["messages", "رسائل الواتساب"],
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

        {tab === "overview" && <OverviewTab />}
        {tab === "doctors" && <DoctorsTab />}
        {tab === "staff" && <StaffTab />}
        {tab === "reviews" && <ReviewsTab />}
        {tab === "messages" && <MessagesTab />}
      </main>
    </>
  );
}

/* ── نظرة عامة ──────────────────────────────────────────────── */

function OverviewTab() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Summary>("/owner/summary")
      .then(setSummary)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!summary) return <Loading />;

  // ما يحتاج تدخّل المالك — يُعرض أولاً لأنه الشيء الوحيد القابل للفعل هنا
  const alerts = [
    summary.doctors.withoutSchedule > 0 && {
      text: `${toArabic(summary.doctors.withoutSchedule)} طبيب لم يحدد جدول دوامه — لا يستطيع أحد الحجز عنده`,
      tone: "warn" as const,
    },
    summary.doctors.withoutWhatsApp > 0 && {
      text: `${toArabic(summary.doctors.withoutWhatsApp)} طبيب بلا رقم واتساب — لن تصله تفاصيل الحجوزات`,
      tone: "warn" as const,
    },
    summary.doctors.awaitingFirstLogin > 0 && {
      text: `${toArabic(summary.doctors.awaitingFirstLogin)} طبيب لم يدخل بعد ولم يغيّر باسووردهُ الأولي`,
      tone: "muted" as const,
    },
    (summary.whatsapp.FAILED ?? 0) > 0 && {
      text: `${toArabic(summary.whatsapp.FAILED)} رسالة واتساب فشلت نهائياً`,
      tone: "danger" as const,
    },
  ].filter(Boolean) as { text: string; tone: "warn" | "danger" | "muted" }[];

  const maxDaily = Math.max(1, ...summary.dailyBookings.map((d) => d.count));

  return (
    <>
      {alerts.length > 0 && (
        <Card className="mb-5">
          <SectionTitle>يحتاج انتباهك</SectionTitle>
          <div className="grid gap-2">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 text-[13.5px] px-3 py-2 rounded-[9px]"
                style={{
                  background: alert.tone === "danger" ? "var(--danger-soft)" : alert.tone === "warn" ? "var(--warn-soft)" : "var(--surface-2)",
                  color: alert.tone === "danger" ? "var(--danger)" : alert.tone === "warn" ? "var(--warn)" : "var(--muted)",
                }}
              >
                {alert.text}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-5">
        <StatTile label="الأطباء النشطون" value={statNumber(summary.doctors.active)} sub={`من ${toArabic(summary.doctors.total)} مسجَّل`} />
        <StatTile label="العيادات" value={statNumber(summary.clinics)} />
        <StatTile label="حسابات المرضى" value={statNumber(summary.patients)} />
        <StatTile label="حجوزات اليوم" value={statNumber(summary.bookings.today)} tone="accent" sub={`${toArabic(summary.bookings.week)} هذا الأسبوع`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mb-5">
        <Card className="lg:col-span-2">
          <SectionTitle>الحجوزات في آخر أسبوعين</SectionTitle>
          {summary.dailyBookings.every((d) => d.count === 0) ? (
            <EmptyState title="لا توجد حجوزات بعد" />
          ) : (
            <div className="flex items-end gap-1.5 h-32 mt-2" role="img" aria-label="منحنى الحجوزات اليومية">
              {summary.dailyBookings.map((day) => (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                  <span className="text-[11px] tnum" style={{ color: "var(--muted)" }}>
                    {day.count > 0 ? toArabic(day.count) : ""}
                  </span>
                  <div
                    className="w-full rounded-t-[3px]"
                    style={{
                      height: `${Math.max(3, (day.count / maxDaily) * 88)}px`,
                      background: day.count > 0 ? "var(--primary)" : "var(--line-strong)",
                    }}
                    title={`${day.weekdayName} ${day.date}: ${day.count}`}
                  />
                  <span className="text-[10px] truncate w-full text-center" style={{ color: "var(--faint)" }}>
                    {day.shortName}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle>الحضور آخر شهر</SectionTitle>
          <div className="grid gap-3 mt-1">
            <Row label="تم الكشف" value={statNumber(summary.attendance.completed)} tone="ok" />
            <Row label="لم يحضروا" value={statNumber(summary.attendance.noShow)} tone="danger" />
            <div className="pt-3" style={{ borderTop: "1px solid var(--line)" }}>
              <p className="text-[12.5px]" style={{ color: "var(--muted)" }}>
                نسبة الغياب
              </p>
              <p
                className="text-[28px] font-bold tnum leading-tight"
                style={{ color: summary.attendance.noShowRate > 20 ? "var(--danger)" : "var(--ok)" }}
              >
                {summary.attendance.completed + summary.attendance.noShow === 0
                  ? "—"
                  : `${toArabic(summary.attendance.noShowRate)}٪`}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>رسائل الواتساب</SectionTitle>
          <div className="grid gap-2.5">
            <Row label="وصلت" value={statNumber(summary.whatsapp.SENT ?? 0)} tone="ok" />
            <Row label="في الطابور" value={statNumber(summary.whatsapp.QUEUED ?? 0)} tone="warn" />
            <Row label="فشلت" value={statNumber(summary.whatsapp.FAILED ?? 0)} tone="danger" />
          </div>
        </Card>

        <Card>
          <SectionTitle>العيادات حسب المحافظة</SectionTitle>
          {summary.topGovernorates.length === 0 ? (
            <EmptyState title="لا توجد عيادات بعد" />
          ) : (
            <div className="grid gap-2.5">
              {summary.topGovernorates.map((row) => (
                <Row key={row.name} label={row.name} value={statNumber(row.clinics)} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <SectionTitle>آخر الحجوزات</SectionTitle>
        {summary.recentBookings.length === 0 ? (
          <EmptyState title="لا توجد حجوزات بعد" />
        ) : (
          <div className="scroll-x">
            <table className="w-full text-[13.5px] min-w-[560px]">
              <thead>
                <tr style={{ color: "var(--faint)" }}>
                  <th className="text-start font-medium pb-2">الرقم</th>
                  <th className="text-start font-medium pb-2">المريض</th>
                  <th className="text-start font-medium pb-2">الطبيب</th>
                  <th className="text-start font-medium pb-2">الموعد</th>
                </tr>
              </thead>
              <tbody>
                {summary.recentBookings.map((row) => (
                  <tr key={row.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="py-2.5 tnum font-semibold">{row.reference}</td>
                    <td className="py-2.5">{row.patientName}</td>
                    <td className="py-2.5" style={{ color: "var(--muted)" }}>
                      {row.doctorName}
                    </td>
                    <td className="py-2.5 tnum" style={{ color: "var(--muted)" }}>
                      {formatDay(row.sessionStart.slice(0, 10))} · {formatClock(row.sessionStart)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "danger" }) {
  const color = tone === "ok" ? "var(--ok)" : tone === "warn" ? "var(--warn)" : tone === "danger" ? "var(--danger)" : "var(--ink)";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13.5px]" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <span className="text-[15px] font-bold tnum" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

/* ── الأطباء ────────────────────────────────────────────────── */

function DoctorsTab() {
  const [rows, setRows] = useState<DoctorRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<{ fullName: string; email: string; temporaryPassword: string } | null>(null);

  const load = useCallback(() => {
    api
      .get<DoctorRow[]>("/owner/doctors")
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  async function resetPassword(id: string, name: string) {
    if (!confirm(`إنشاء باسوورد جديد لـ${name}؟ سيُقطع دخوله الحالي.`)) return;
    try {
      const result = await api.post<{ email: string; temporaryPassword: string }>(`/owner/doctors/${id}/reset-password`, {});
      setCreated({ fullName: name, ...result });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      await api.patch(`/owner/doctors/${id}/status`, { isActive: !isActive });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-[18px] font-bold" style={{ fontFamily: "var(--font-display)" }}>
          الأطباء المسجَّلون
        </h2>
        <Button onClick={() => setAdding(true)}>+ تسجيل طبيب</Button>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {created && <CredentialsCard created={created} onClose={() => setCreated(null)} />}

      {rows === null && <Loading />}
      {rows?.length === 0 && (
        <Card>
          <EmptyState
            title="لم تسجّل أي طبيب بعد"
            hint="سجّل الطبيب هنا فيُنشأ له حساب بإيميل وباسوورد أولي تسلّمه له."
            action={<Button onClick={() => setAdding(true)}>تسجيل أول طبيب</Button>}
          />
        </Card>
      )}

      <div className="grid gap-2.5">
        {rows?.map((row) => (
          <Card key={row.id}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-[15.5px] font-bold">
                  {row.title} {row.user.fullName}
                </p>
                <p className="text-[13px] mt-0.5" dir="ltr" style={{ color: "var(--muted)", textAlign: "start" }}>
                  {row.user.email}
                </p>
                <p className="text-[13px] mt-0.5" style={{ color: "var(--primary)" }}>
                  {row.specialties.map((s) => s.specialty.nameAr).join(" · ") || "بلا تخصص"}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 justify-end">
                {!row.isActive && <Badge tone="danger">موقوف</Badge>}
                {row.user.mustChangePassword && <Badge tone="warn">لم يدخل بعد</Badge>}
                {row._count.practices === 0 && <Badge tone="warn">بلا عيادة</Badge>}
                {!row.whatsappNumber && <Badge tone="warn">بلا واتساب</Badge>}
                {row.whatsappNumber && row.whatsappEnabled && <Badge tone="ok">واتساب مفعّل</Badge>}
              </div>
            </div>

            <div className="flex gap-2 mt-3 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => resetPassword(row.id, row.user.fullName)}>
                باسوورد جديد
              </Button>
              <Button
                variant={row.isActive ? "danger" : "primary"}
                size="sm"
                onClick={() => toggleActive(row.id, row.isActive)}
              >
                {row.isActive ? "إيقاف" : "تفعيل"}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {adding && (
        <AddDoctorDialog
          onClose={() => setAdding(false)}
          onCreated={(result) => {
            setAdding(false);
            setCreated(result);
            load();
          }}
        />
      )}
    </>
  );
}

/** الباسوورد الأولي يظهر مرة واحدة فقط — بعدها لا يمكن استرجاعه، فقط إنشاء جديد. */
function CredentialsCard({
  created,
  onClose,
}: {
  created: { fullName: string; email: string; temporaryPassword: string };
  onClose: () => void;
}) {
  return (
    <div className="rounded-[14px] p-5 mb-4" style={{ background: "var(--ok-soft)", border: "1px solid var(--ok)" }}>
      <p className="text-[15px] font-bold" style={{ color: "var(--ok)" }}>
        بيانات دخول {created.fullName}
      </p>
      <p className="text-[13px] mt-1 mb-3" style={{ color: "var(--muted)" }}>
        سلّمها للطبيب الآن — لن تظهر مرة أخرى. سيُطلب منه تغيير الباسوورد أول دخول.
      </p>
      <div className="grid gap-2">
        <CopyRow label="الإيميل" value={created.email} />
        <CopyRow label="الباسوورد" value={created.temporaryPassword} />
      </div>
      <div className="mt-4">
        <Button variant="outline" size="sm" onClick={onClose}>
          حفظتها
        </Button>
      </div>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-[9px]"
      style={{ background: "var(--surface)" }}
    >
      <span className="text-[12.5px] shrink-0" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <code className="text-[14px] font-semibold flex-1 truncate" dir="ltr" style={{ textAlign: "start" }}>
        {value}
      </code>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="text-[12.5px] font-semibold shrink-0 px-2 py-1"
        style={{ color: "var(--primary)" }}
      >
        {copied ? "نُسخ" : "نسخ"}
      </button>
    </div>
  );
}

function AddDoctorDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (result: { fullName: string; email: string; temporaryPassword: string }) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsappNumber, setWhatsapp] = useState("");
  const [title, setTitle] = useState("د.");
  const [specialtyId, setSpecialtyId] = useState("");
  const [yearsOfExperience, setYears] = useState("");
  const [specialties, setSpecialties] = useState<{ id: number; nameAr: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ id: number; nameAr: string }[]>("/specialties").then(setSpecialties).catch(() => {});
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ fullName: string; email: string; temporaryPassword: string }>("/owner/doctors", {
        fullName,
        email,
        whatsappNumber: whatsappNumber || undefined,
        title,
        yearsOfExperience: yearsOfExperience ? Number(yearsOfExperience) : undefined,
        specialtyIds: specialtyId ? [Number(specialtyId)] : [],
      });
      onCreated(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="إغلاق النافذة بالنقر خارجها" />
      <div
        className="relative w-full sm:max-w-md max-h-[88vh] overflow-y-auto rounded-t-[20px] sm:rounded-[18px] p-5"
        style={{ background: "var(--surface)", boxShadow: "var(--shadow-lg)" }}
      >
        <h2 className="text-[18px] font-bold mb-1" style={{ fontFamily: "var(--font-display)" }}>
          تسجيل طبيب
        </h2>
        <p className="text-[13px] mb-4" style={{ color: "var(--muted)" }}>
          يُنشأ الحساب بباسوورد أولي يظهر لك مرة واحدة لتسلّمه للطبيب.
        </p>

        {error && (
          <div className="mb-3">
            <Alert>{error}</Alert>
          </div>
        )}

        <div className="grid gap-3">
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <Field label="اللقب">
              <Select value={title} onChange={(e) => setTitle(e.target.value)}>
                {["د.", "أ.د.", "أ.م.د."].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="اسم الطبيب">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="الاسم الثلاثي" />
            </Field>
          </div>

          <Field label="الإيميل" hint="يدخل به الطبيب للوحته">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" dir="ltr" placeholder="doctor@clinic.iq" />
          </Field>

          <Field label="رقم الواتساب" hint="تصله تفاصيل كل حجز — يقبل ٠٧٧٠ أو ‎+964">
            <Input value={whatsappNumber} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" placeholder="07701234567" />
          </Field>

          <Field label="التخصص">
            <Select value={specialtyId} onChange={(e) => setSpecialtyId(e.target.value)}>
              <option value="">اختر التخصص</option>
              {specialties.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nameAr}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="سنوات الخبرة" hint="اختياري">
            <Input value={yearsOfExperience} onChange={(e) => setYears(e.target.value)} type="number" min={0} max={60} className="tnum" />
          </Field>

          <Button size="lg" full loading={busy} onClick={submit} disabled={!fullName || !email}>
            إنشاء الحساب
          </Button>
          <Button variant="ghost" full onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── السكرتيرون ─────────────────────────────────────────────── */

type StaffRow = {
  id: string;
  fullName: string;
  email: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  canManageSchedule: boolean;
  scope: string;
};

type ClinicRow = { id: string; nameAr: string; governorate: { nameAr: string }; _count: { practices: number } };

function StaffTab() {
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<{ fullName: string; email: string; temporaryPassword: string } | null>(null);

  const load = useCallback(() => {
    api.get<StaffRow[]>("/owner/staff").then(setRows).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function toggle(id: string, isActive: boolean) {
    try {
      await api.patch(`/owner/staff/${id}/status`, { isActive: !isActive });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-[18px] font-bold" style={{ fontFamily: "var(--font-display)" }}>
            السكرتيرون
          </h2>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--muted)" }}>
            هم من يفتح اللوحة يومياً — يضيفون الحجوزات اليدوية ويؤشّرون الحضور.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>+ تسجيل سكرتير</Button>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {created && <CredentialsCard created={created} onClose={() => setCreated(null)} />}
      {rows === null && <Loading />}

      {rows?.length === 0 && (
        <Card>
          <EmptyState
            title="لا يوجد سكرتيرون بعد"
            hint="بدون سكرتير يتحمّل الطبيب وحده إدخال كل حجز يدوي — وهذا ما يجعل الجداول تتضارب."
            action={<Button onClick={() => setAdding(true)}>تسجيل أول سكرتير</Button>}
          />
        </Card>
      )}

      <div className="grid gap-2.5">
        {rows?.map((row) => (
          <Card key={row.id}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-[15.5px] font-bold">{row.fullName}</p>
                <p className="text-[13px] mt-0.5" dir="ltr" style={{ color: "var(--muted)", textAlign: "start" }}>
                  {row.email}
                </p>
                <p className="text-[13px] mt-0.5" style={{ color: "var(--primary)" }}>
                  {row.scope}
                </p>
              </div>
              <div className="flex gap-1.5 flex-wrap justify-end">
                {!row.isActive && <Badge tone="danger">موقوف</Badge>}
                {row.mustChangePassword && <Badge tone="warn">لم يدخل بعد</Badge>}
                {row.canManageSchedule && <Badge tone="primary">يعدّل الجدول</Badge>}
              </div>
            </div>
            <div className="mt-3">
              <Button
                variant={row.isActive ? "danger" : "primary"}
                size="sm"
                onClick={() => toggle(row.id, row.isActive)}
              >
                {row.isActive ? "إيقاف" : "تفعيل"}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {adding && (
        <AddStaffDialog
          onClose={() => setAdding(false)}
          onCreated={(result) => {
            setAdding(false);
            setCreated(result);
            load();
          }}
        />
      )}
    </>
  );
}

function AddStaffDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (result: { fullName: string; email: string; temporaryPassword: string }) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [clinicId, setClinicId] = useState("");
  const [canManageSchedule, setCanManageSchedule] = useState(false);
  const [clinics, setClinics] = useState<ClinicRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ClinicRow[]>("/owner/clinics").then(setClinics).catch(() => {});
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ fullName: string; email: string; temporaryPassword: string }>("/owner/staff", {
        fullName,
        email,
        phone: phone || undefined,
        clinicId,
        canManageSchedule,
      });
      onCreated(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="تسجيل سكرتير"
      hint="يُنشأ الحساب بباسوورد أولي يظهر لك مرة واحدة لتسلّمه له."
      onClose={onClose}
    >
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="grid gap-3">
        <Field label="الاسم">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="الاسم الثلاثي" />
        </Field>
        <Field label="الإيميل" hint="يدخل به للوحة">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" dir="ltr" placeholder="staff@clinic.iq" />
        </Field>
        <Field label="رقم الهاتف" hint="اختياري">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07701234567" />
        </Field>
        <Field label="العيادة" hint="يرى حجوزات أطباء هذه العيادة فقط">
          <Select value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
            <option value="">اختر العيادة</option>
            {clinics.map((clinic) => (
              <option key={clinic.id} value={clinic.id}>
                {clinic.nameAr} — {clinic.governorate.nameAr}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-[14px] cursor-pointer">
          <input type="checkbox" checked={canManageSchedule} onChange={(e) => setCanManageSchedule(e.target.checked)} />
          يستطيع تعديل جدول الدوام أيضاً
        </label>
        <Button size="lg" full loading={busy} disabled={!fullName || !email || !clinicId} onClick={submit}>
          إنشاء الحساب
        </Button>
        <Button variant="ghost" full onClick={onClose}>
          إلغاء
        </Button>
      </div>
    </Dialog>
  );
}

/* ── التقييمات ──────────────────────────────────────────────── */

type PendingReview = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  doctorName: string;
  patientName: string;
};

function ReviewsTab() {
  const [rows, setRows] = useState<PendingReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<PendingReview[]>("/owner/reviews/pending").then(setRows).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function decide(id: string, isPublished: boolean) {
    setBusy(id);
    try {
      await api.patch(`/owner/reviews/${id}`, { isPublished });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <h2 className="text-[18px] font-bold mb-1" style={{ fontFamily: "var(--font-display)" }}>
        تعليقات بانتظار المراجعة
      </h2>
      <p className="text-[13px] mb-4" style={{ color: "var(--muted)" }}>
        الدرجة تُحتسب في متوسط الطبيب فور كتابتها؛ التعليق وحده هو ما ينتظر موافقتك.
      </p>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {rows === null && <Loading />}

      {rows?.length === 0 && (
        <Card>
          <EmptyState title="لا توجد تعليقات معلّقة" hint="التعليقات الجديدة تظهر هنا للمراجعة قبل نشرها." />
        </Card>
      )}

      <div className="grid gap-2.5">
        {rows?.map((row) => (
          <Card key={row.id}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-[15px] font-bold">{row.doctorName}</p>
                <p className="text-[12.5px] mt-0.5" style={{ color: "var(--muted)" }}>
                  من {row.patientName}
                </p>
              </div>
              <Badge tone={row.rating >= 4 ? "ok" : row.rating >= 3 ? "warn" : "danger"}>
                {"★".repeat(row.rating)}
                {"☆".repeat(5 - row.rating)}
              </Badge>
            </div>

            <p
              className="text-[14px] mt-3 px-3 py-2.5 rounded-[9px]"
              style={{ background: "var(--surface-2)" }}
            >
              {row.comment}
            </p>

            <div className="flex gap-2 mt-3">
              <Button size="sm" loading={busy === row.id} onClick={() => decide(row.id, true)}>
                نشر
              </Button>
              <Button variant="danger" size="sm" loading={busy === row.id} onClick={() => decide(row.id, false)}>
                رفض
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

/* ── رسائل الواتساب ─────────────────────────────────────────── */

type MessageRow = {
  id: string;
  channel: string;
  template: string;
  toAddress: string | null;
  status: string;
  attempts: number;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
};

const MESSAGE_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "danger" }> = {
  SENT: { label: "وصلت", tone: "ok" },
  QUEUED: { label: "في الطابور", tone: "warn" },
  FAILED: { label: "فشلت", tone: "danger" },
};

const TEMPLATE_LABELS: Record<string, string> = {
  new_booking: "حجز جديد",
  booking_cancelled: "إلغاء حجز",
};

function MessagesTab() {
  const [rows, setRows] = useState<MessageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get<MessageRow[]>("/owner/notifications")
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  async function flush() {
    setBusy(true);
    try {
      await api.post("/owner/notifications/flush", {});
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const queued = rows?.filter((r) => r.status === "QUEUED").length ?? 0;

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-[18px] font-bold" style={{ fontFamily: "var(--font-display)" }}>
          سجل الرسائل
        </h2>
        {queued > 0 && (
          <Button onClick={flush} loading={busy}>
            إعادة إرسال {toArabic(queued)} معلّقة
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {rows === null && <Loading />}
      {rows?.length === 0 && (
        <Card>
          <EmptyState title="لا توجد رسائل بعد" hint="تُسجَّل هنا كل رسالة واتساب تُرسل للأطباء." />
        </Card>
      )}

      {rows && rows.length > 0 && (
        <Card padded={false}>
          <div className="scroll-x">
            <table className="w-full text-[13.5px] min-w-[600px]">
              <thead>
                <tr style={{ color: "var(--faint)", background: "var(--surface-2)" }}>
                  <th className="text-start font-medium px-4 py-2.5">النوع</th>
                  <th className="text-start font-medium px-4 py-2.5">إلى</th>
                  <th className="text-start font-medium px-4 py-2.5">الحالة</th>
                  <th className="text-start font-medium px-4 py-2.5">المحاولات</th>
                  <th className="text-start font-medium px-4 py-2.5">الوقت</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const status = MESSAGE_STATUS[row.status] ?? { label: row.status, tone: "warn" as const };
                  return (
                    <tr key={row.id} style={{ borderTop: "1px solid var(--line)" }}>
                      <td className="px-4 py-2.5 font-semibold">{TEMPLATE_LABELS[row.template] ?? row.template}</td>
                      <td className="px-4 py-2.5 tnum" dir="ltr" style={{ textAlign: "start", color: "var(--muted)" }}>
                        {row.toAddress}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        {row.error && (
                          <span className="block text-[11.5px] mt-1 truncate max-w-[220px]" style={{ color: "var(--danger)" }}>
                            {row.error}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 tnum" style={{ color: "var(--muted)" }}>
                        {toArabic(row.attempts)}
                      </td>
                      <td className="px-4 py-2.5 tnum" style={{ color: "var(--muted)" }}>
                        {formatClock(row.sentAt ?? row.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
