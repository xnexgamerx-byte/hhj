"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Alert, Badge, Button, Card, Dialog, EmptyState, Field, Input, Loading, SectionTitle, Select, StatTile } from "@/components/ui";
import { api, getSession, mediaUrl, uploadFile } from "@/lib/api";
import { countLabel, formatClock, formatDay, formatFee, statNumber, toArabic, WEEKDAYS } from "@/lib/format";

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
  photoUrl: string | null;
  whatsappNumber: string | null;
  whatsappEnabled: boolean;
  registeredAt: string;
  user: { fullName: string; email: string | null; lastLoginAt: string | null; mustChangePassword: boolean };
  specialties: { specialty: { nameAr: string }; isPrimary: boolean }[];
  _count: { practices: number };
};

type BannerRow = {
  id: string;
  imageUrl: string | null;
  title: string | null;
  body: string | null;
  isActive: boolean;
  sortOrder: number;
};

type Tab = "overview" | "doctors" | "clinics" | "staff" | "banners" | "commissions" | "reviews" | "messages";

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
              ["clinics", "العيادات"],
              ["staff", "السكرتيرون"],
              ["banners", "واجهة التطبيق"],
              ["commissions", "العمولات"],
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
        {tab === "clinics" && <ClinicsTab />}
        {tab === "staff" && <StaffTab />}
        {tab === "banners" && <BannersTab />}
        {tab === "commissions" && <CommissionsTab />}
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
                      {formatDay(row.sessionStart.slice(0, 10))} — {formatClock(row.sessionStart)}
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
  const [linking, setLinking] = useState<DoctorRow | null>(null);
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
              <div className="min-w-0 flex gap-3 items-start">
                <DoctorPhoto row={row} onDone={load} />
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
              <Button variant="accent" size="sm" onClick={() => setLinking(row)}>
                {row._count.practices === 0 ? "إعداد العيادة" : "+ عيادة أخرى"}
              </Button>
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

      {linking && (
        <SetupClinicDialog
          doctor={linking}
          onClose={() => setLinking(null)}
          onDone={() => {
            setLinking(null);
            load();
          }}
        />
      )}
    </>
  );
}

/**
 * إعداد عيادة الطبيب: الموقع والسعر والعمولة والدوام في خطوة واحدة.
 * فصلها إلى خطوات يترك أطباء نصف مُعدّين لا يستطيع أحد الحجز عندهم.
 */
/**
 * صورة الطبيب — تُرفع وتُبدَّل من هنا.
 *
 * المالك هو من يسجّل الأطباء، فهو من يضع صورهم: لو رفعها الطبيب بنفسه لوصلت
 * إلى واجهةٍ عامة بلا مراجعة. والحرف الأول يبقى بديلاً حتى تُرفع صورة —
 * مربّعٌ فارغ في قائمة الأطباء يبدو عطلاً.
 */
function DoctorPhoto({ row, onDone }: { row: DoctorRow; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const inputId = `photo-${row.id}`;
  const photo = mediaUrl(row.photoUrl);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await uploadFile("/owner/uploads", file);
      await api.patch(`/owner/doctors/${row.id}/photo`, { photoUrl: url });
      onDone();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shrink-0 text-center">
      <label
        htmlFor={inputId}
        className="block w-[62px] h-[68px] rounded-[10px] overflow-hidden cursor-pointer relative grid place-items-center"
        style={{ background: "var(--primary-soft)", border: "1px solid var(--line)" }}
        title="اضغط لتغيير الصورة"
      >
        <span className="text-[24px] font-bold" style={{ color: "var(--primary)" }}>
          {row.user.fullName.trim().charAt(0)}
        </span>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {busy && (
          <span
            className="absolute inset-0 grid place-items-center text-[11px] font-semibold"
            style={{ background: "rgba(0,0,0,.55)", color: "#fff" }}
          >
            يُرفع…
          </span>
        )}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {row.photoUrl && (
        <button
          type="button"
          className="text-[11.5px] mt-1 underline"
          style={{ color: "var(--muted)" }}
          onClick={() => {
            if (!confirm("حذف صورة الطبيب؟")) return;
            void api.patch(`/owner/doctors/${row.id}/photo`, { photoUrl: null }).then(onDone);
          }}
        >
          حذف الصورة
        </button>
      )}
    </div>
  );
}

/* ── العيادات ───────────────────────────────────────────────── */

/**
 * قائمة العيادات وصورها. لا نموذج تعديلٍ عام للعيادة — تُنشأ عند إعداد
 * عيادة طبيبٍ أول مرة (‎SetupClinicDialog‎)، وهذه الشاشة وحدها تعدّل
 * صورتها بعد ذلك. باقي بياناتها (الاسم والموقع) ثابتة بعد الإنشاء عمداً:
 * تغييرها لاحقاً قد يربك مرضى حجزوا على أساسها.
 */
function ClinicsTab() {
  const [rows, setRows] = useState<ClinicRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<ClinicRow[]>("/owner/clinics")
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  return (
    <>
      <h2 className="text-[18px] font-bold mb-4" style={{ fontFamily: "var(--font-display)" }}>
        العيادات
      </h2>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {rows === null && <Loading />}
      {rows?.length === 0 && (
        <Card>
          <EmptyState
            title="لا عيادات بعد"
            hint="تُنشأ العيادة عند إعداد عيادة طبيبٍ من تبويب «الأطباء»."
          />
        </Card>
      )}

      <div className="grid gap-2.5">
        {rows?.map((row) => (
          <Card key={row.id}>
            <div className="flex gap-3 items-start">
              <ClinicPhoto row={row} onDone={load} />
              <div className="min-w-0">
                <p className="text-[15.5px] font-bold">{row.nameAr}</p>
                <p className="text-[13px] mt-0.5" style={{ color: "var(--muted)" }}>
                  {row.district.nameAr} — {row.governorate.nameAr}
                  {row.landmark ? ` · ${row.landmark}` : ""}
                </p>
                <p className="text-[13px] mt-0.5" style={{ color: "var(--primary)" }}>
                  {countLabel(row._count.practices, {
                    zero: "بلا طبيب بعد",
                    one: "طبيبٌ واحد",
                    two: "طبيبان",
                    few: "أطباء",
                    many: "طبيباً",
                  })}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

/**
 * صورة العيادة — نفس منطق صورة الطبيب بالضبط: تُرفع وتُبدَّل من هنا،
 * وأيقونة الموقع تبقى بديلاً حتى تُرفع صورة.
 */
function ClinicPhoto({ row, onDone }: { row: ClinicRow; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const inputId = `clinic-photo-${row.id}`;
  const photo = mediaUrl(row.photoUrl);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await uploadFile("/owner/uploads", file);
      await api.patch(`/owner/clinics/${row.id}/photo`, { photoUrl: url });
      onDone();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shrink-0 text-center">
      <label
        htmlFor={inputId}
        className="block w-[62px] h-[68px] rounded-[10px] overflow-hidden cursor-pointer relative grid place-items-center"
        style={{ background: "var(--primary-soft)", border: "1px solid var(--line)" }}
        title="اضغط لتغيير الصورة"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ color: "var(--primary)" }}>
          <path
            d="M12 21s-7-6.13-7-11a7 7 0 1 1 14 0c0 4.87-7 11-7 11Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {busy && (
          <span
            className="absolute inset-0 grid place-items-center text-[11px] font-semibold"
            style={{ background: "rgba(0,0,0,.55)", color: "#fff" }}
          >
            يُرفع…
          </span>
        )}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {row.photoUrl && (
        <button
          type="button"
          className="text-[11.5px] mt-1 underline"
          style={{ color: "var(--muted)" }}
          onClick={() => {
            if (!confirm("حذف صورة العيادة؟")) return;
            void api.patch(`/owner/clinics/${row.id}/photo`, { photoUrl: null }).then(onDone);
          }}
        >
          حذف الصورة
        </button>
      )}
    </div>
  );
}

function SetupClinicDialog({
  doctor,
  onClose,
  onDone,
}: {
  doctor: DoctorRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [governorates, setGovernorates] = useState<{ id: number; nameAr: string }[]>([]);
  const [districts, setDistricts] = useState<{ id: number; nameAr: string }[]>([]);
  const [governorateId, setGovernorateId] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [landmark, setLandmark] = useState("");
  const [phone, setPhone] = useState("");
  const [feeAmount, setFeeAmount] = useState("25000");
  const [commissionAmount, setCommissionAmount] = useState("2000");
  const [bookingMode, setBookingMode] = useState<"SLOT" | "QUEUE">("QUEUE");
  const [slotMinutes, setSlotMinutes] = useState(20);
  const [capacity, setCapacity] = useState(20);
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [startTime, setStartTime] = useState("16:00");
  const [endTime, setEndTime] = useState("19:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ id: number; nameAr: string }[]>("/locations/governorates").then(setGovernorates).catch(() => {});
  }, []);

  useEffect(() => {
    if (!governorateId) return;
    setDistrictId("");
    api
      .get<{ id: number; nameAr: string }[]>(`/locations/governorates/${governorateId}/districts`)
      .then(setDistricts)
      .catch(() => {});
  }, [governorateId]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const clinic = await api.post<{ id: string }>("/owner/clinics", {
        nameAr,
        governorateId: Number(governorateId),
        districtId: Number(districtId),
        landmark: landmark || undefined,
        phone: phone || undefined,
      });
      await api.post(`/owner/doctors/${doctor.id}/practices`, {
        clinicId: clinic.id,
        feeAmount: Number(feeAmount),
        commissionAmount: Number(commissionAmount),
        bookingMode,
        slotMinutes,
        capacityPerSession: capacity,
        schedules: days.map((weekday) => ({ weekday, startTime, endTime })),
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`إعداد عيادة ${doctor.title} ${doctor.user.fullName}`}
      hint="الموقع والسعر والعمولة والدوام — يستطيع الطبيب تعديل دوامه لاحقاً من لوحته."
      onClose={onClose}
    >
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="grid gap-3">
        <Field label="اسم العيادة">
          <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="عيادة النور" />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="المحافظة">
            <Select value={governorateId} onChange={(e) => setGovernorateId(e.target.value)}>
              <option value="">اختر</option>
              {governorates.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nameAr}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="القضاء">
            <Select value={districtId} onChange={(e) => setDistrictId(e.target.value)} disabled={!governorateId}>
              <option value="">اختر</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nameAr}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="العلامة المميزة" hint="يصل بها المريض أكثر من الخريطة">
          <Input value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="مقابل مستشفى اليرموك" />
        </Field>

        <Field label="هاتف العيادة" hint="اختياري">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07801112233" />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="أجرة الكشف" hint="يدفعها المريض للعيادة">
            <Input value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} type="number" className="tnum" />
          </Field>
          <Field label="عمولتك لكل مريض" hint="تُستحق عند الحضور">
            <Input
              value={commissionAmount}
              onChange={(e) => setCommissionAmount(e.target.value)}
              type="number"
              className="tnum"
            />
          </Field>
        </div>

        <Field label="طريقة استقبال المرضى">
          <Select value={bookingMode} onChange={(e) => setBookingMode(e.target.value as "SLOT" | "QUEUE")}>
            <option value="QUEUE">رقم دور ضمن فترة</option>
            <option value="SLOT">موعد بوقت محدد</option>
          </Select>
        </Field>

        {bookingMode === "SLOT" ? (
          <Field label="مدة الكشف">
            <Select value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value))}>
              {[10, 15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {toArabic(m)} دقيقة
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="عدد المرضى في الفترة">
            <Input value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} type="number" className="tnum" />
          </Field>
        )}

        <Field label="أيام الدوام">
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((name, weekday) => {
              const on = days.includes(weekday);
              return (
                <button
                  key={weekday}
                  onClick={() => setDays((c) => (on ? c.filter((d) => d !== weekday) : [...c, weekday]))}
                  className="px-2.5 py-1.5 rounded-[8px] text-[12.5px] font-semibold"
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
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="من">
            <Input value={startTime} onChange={(e) => setStartTime(e.target.value)} type="time" className="tnum" />
          </Field>
          <Field label="إلى">
            <Input value={endTime} onChange={(e) => setEndTime(e.target.value)} type="time" className="tnum" />
          </Field>
        </div>

        <Button
          size="lg"
          full
          loading={busy}
          disabled={!nameAr || !governorateId || !districtId || days.length === 0}
          onClick={submit}
        >
          حفظ العيادة
        </Button>
        <Button variant="ghost" full onClick={onClose}>
          إلغاء
        </Button>
      </div>
    </Dialog>
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

type ClinicRow = {
  id: string;
  nameAr: string;
  photoUrl: string | null;
  landmark: string | null;
  governorate: { nameAr: string };
  district: { nameAr: string };
  _count: { practices: number };
};

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

/* ── العمولات ───────────────────────────────────────────────── */

type CommissionData = {
  summary: { dueAmount: number; dueVisits: number; collectedThisMonth: number; practicesWithoutRate: number };
  dues: {
    clinicId: string;
    clinicName: string;
    governorate: string;
    phone: string | null;
    visits: number;
    amount: number;
    firstVisitAt: string | null;
    lastVisitAt: string | null;
  }[];
};

type ClinicDue = {
  id: string;
  amount: number;
  earnedAt: string;
  reference: string;
  patientName: string;
  doctorName: string;
};

type SettlementRow = {
  id: string;
  clinicName: string;
  governorate: string;
  amount: number;
  count: number;
  note: string | null;
  collectedBy: string;
  createdAt: string;
};

/* ── واجهة التطبيق: اللافتات ومدّة تبديلها ───────────────────── */

/**
 * كل ما يظهر في صدر الشاشة الرئيسية يُحرَّر من هنا.
 *
 * السبب أن الإصدار الجديد من التطبيق يمرّ بمراجعة المتجر ويأخذ أياماً، بينما
 * اللافتة إعلانٌ موسميّ: عيادةٌ افتُتحت، حملةُ تطعيم، عرضٌ ينتهي بعد أسبوع.
 * ربطُها بالإصدار يعني أنها تصل متأخّرة دائماً.
 */
function BannersTab() {
  const [rows, setRows] = useState<BannerRow[] | null>(null);
  const [rotate, setRotate] = useState(5);
  const [savedRotate, setSavedRotate] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<BannerRow | null>(null);

  const load = useCallback(() => {
    api
      .get<{ banners: BannerRow[]; rotateSeconds: number }>("/owner/banners")
      .then((data) => {
        setRows(data.banners);
        setRotate(data.rotateSeconds);
        setSavedRotate(data.rotateSeconds);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await action();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /** يحرّك لافتةً خطوةً واحدة، ويرسل الترتيب كاملاً — الخادم لا يخمّن النيّة */
  function move(index: number, delta: number) {
    if (!rows) return;
    const next = [...rows];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
    void run("order", () => api.put("/owner/banners/order", { ids: next.map((b) => b.id) }));
  }

  return (
    <>
      <h2 className="text-[18px] font-bold mb-1" style={{ fontFamily: "var(--font-display)" }}>
        لافتات الشاشة الرئيسية
      </h2>
      <p className="text-[13px] mb-4" style={{ color: "var(--muted)" }}>
        تظهر في صدر التطبيق وتتبدّل تلقائياً. تعديلها يصل للمرضى فوراً بلا إصدار جديد.
      </p>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px]">
            <Field label="مدّة بقاء اللافتة" hint="بين ٢ و٦٠ ثانية">
              <Input
                type="number"
                min={2}
                max={60}
                value={rotate}
                onChange={(e) => setRotate(Number(e.target.value))}
              />
            </Field>
          </div>
          <Button
            variant="outline"
            disabled={busy === "rotate" || rotate === savedRotate}
            onClick={() => void run("rotate", () => api.patch("/owner/settings", { rotateSeconds: rotate }))}
          >
            {busy === "rotate" ? "يُحفظ…" : "حفظ المدّة"}
          </Button>
          <div className="flex-1" />
          <Button onClick={() => setAdding(true)}>أضف لافتة</Button>
        </div>
      </Card>

      {rows === null && <Loading />}

      {rows?.length === 0 && (
        <Card>
          <EmptyState
            title="لا لافتات بعد"
            hint="حتى تضيف أول لافتة، يعرض التطبيق ثلاث لافتات مدمجة تشرح الخدمة — فلا تظهر الشاشة فارغة."
          />
        </Card>
      )}

      <div className="grid gap-3 mt-3">
        {rows?.map((banner, index) => (
          <Card key={banner.id}>
            <div className="flex flex-wrap gap-4 items-start">
              {/* بنسبة اللافتة نفسها في التطبيق كي يرى المالك ما سيراه المريض */}
              <div
                className="w-[190px] h-[67px] rounded-[10px] overflow-hidden shrink-0 grid place-items-center"
                style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
              >
                {banner.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mediaUrl(banner.imageUrl) ?? ""}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[12px]" style={{ color: "var(--faint)" }}>
                    بلا صورة
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[15px] font-semibold">{banner.title ?? "بلا عنوان"}</span>
                  {!banner.isActive && <Badge tone="warn">مخفيّة</Badge>}
                </div>
                <p className="text-[13px]" style={{ color: "var(--muted)" }}>
                  {banner.body ?? "—"}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <Button variant="outline" size="sm" onClick={() => setEditing(banner)}>
                  تعديل
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={index === 0 || busy === "order"}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={index === rows.length - 1 || busy === "order"}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === banner.id}
                  onClick={() =>
                    void run(banner.id, () =>
                      api.patch(`/owner/banners/${banner.id}`, { isActive: !banner.isActive }),
                    )
                  }
                >
                  {banner.isActive ? "إخفاء" : "إظهار"}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy === banner.id}
                  onClick={() => {
                    if (!confirm(`حذف لافتة «${banner.title ?? "بلا عنوان"}»؟`)) return;
                    void run(banner.id, () => api.del(`/owner/banners/${banner.id}`));
                  }}
                >
                  حذف
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {adding && (
        <BannerDialog
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            load();
          }}
        />
      )}

      {editing && (
        <BannerDialog
          banner={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

/**
 * نافذة اللافتة: إضافة وتعديل معاً — الفرق تمريرُ `banner` أو لا.
 * في التعديل، صورةٌ جديدة تستبدل القديمة، وبلا اختيار ملفٍّ تبقى كما هي.
 */
function BannerDialog({
  banner,
  onClose,
  onDone,
}: {
  banner?: BannerRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(banner?.title ?? "");
  const [body, setBody] = useState(banner?.body ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // الرابط المؤقّت يُلغى عند التبديل والإغلاق، وإلا بقيت الصور في ذاكرة الصفحة
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (banner) {
        // بلا ملفٍّ جديد: imageUrl تغيب عن الجسم فيتركها الخادم كما هي
        const imageUrl = file ? (await uploadFile("/owner/uploads", file)).url : undefined;
        await api.patch(`/owner/banners/${banner.id}`, {
          ...(imageUrl !== undefined ? { imageUrl } : {}),
          title: title.trim() || null,
          body: body.trim() || null,
        });
      } else {
        // الصورة تُرفع أولاً ثم تُنشأ اللافتة: لافتةٌ بلا صورتها أسوأ من صورةٍ
        // يتيمةٍ على القرص، والثانية يمكن تنظيفها لاحقاً
        const imageUrl = file ? (await uploadFile("/owner/uploads", file)).url : null;
        await api.post("/owner/banners", { imageUrl, title: title.trim() || null, body: body.trim() || null });
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** ما يُعرض في مساحة الاختيار: ما اختاره الآن، وإلا صورة اللافتة الحالية */
  const shownImage = preview ?? (banner ? mediaUrl(banner.imageUrl) : null);

  return (
    <Dialog title={banner ? "تعديل اللافتة" : "لافتة جديدة"} onClose={onClose}>
      {error && <Alert>{error}</Alert>}

      {/* حقل الملفّات الخام يظهر بهيئة المتصفّح: «Choose File» بالإنكليزية،
          بلا شكل زرٍّ، سطراً باهتاً في واجهةٍ عربية داكنة — فلا يُدرَك أصلاً
          أنه يُضغط. رأيتُ المالك يعجز عن إضافة صورةٍ لهذا السبب وحده. فنخفيه
          خلف مساحةٍ بحجم اللافتة تقول بالعربية ما تفعل، وتعرض ما اختير فيها */}
      <Field label="الصورة" hint="PNG أو JPG أو WEBP · حتى ٤ ميغابايت · الأفضل بعرض ١٢٠٠×٤٢٠">
        <label
          htmlFor="banner-image"
          className="block w-full h-[120px] rounded-[12px] overflow-hidden cursor-pointer relative grid place-items-center text-center"
          style={{
            background: "var(--surface-2)",
            border: `1.5px ${shownImage ? "solid" : "dashed"} var(--line)`,
          }}
        >
          {shownImage ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shownImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <span
                className="relative text-[12.5px] font-semibold px-3 py-1.5 rounded-full"
                style={{ background: "rgba(0,0,0,.62)", color: "#fff" }}
              >
                اضغط لاستبدال الصورة
              </span>
            </>
          ) : (
            <span className="text-[14px] font-semibold" style={{ color: "var(--primary)" }}>
              اضغط لاختيار صورة من جهازك
            </span>
          )}
        </label>
        <input
          id="banner-image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </Field>

      {file && (
        <p className="text-[12.5px] -mt-1" style={{ color: "var(--muted)" }}>
          اخترت: {file.name}
        </p>
      )}

      <Field label="العنوان" hint="اختياري — اتركه فارغاً إن كان النصّ داخل الصورة">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="تدور على طبيب اختصاص؟" />
      </Field>

      <Field label="الشرح" hint="اختياري — سطر تحت العنوان">
        <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="أوقات محدّثة من الطبيب نفسه" />
      </Field>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onClose}>
          إلغاء
        </Button>
        <Button
          disabled={busy || (!banner && !file && !title.trim())}
          onClick={submit}
        >
          {busy ? "يُحفظ…" : banner ? "احفظ التعديلات" : "أضف اللافتة"}
        </Button>
      </div>
    </Dialog>
  );
}

function CommissionsTab() {
  const [data, setData] = useState<CommissionData | null>(null);
  const [history, setHistory] = useState<SettlementRow[]>([]);
  const [detail, setDetail] = useState<CommissionData["dues"][number] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<CommissionData>("/owner/commissions").then(setData).catch((e) => setError(e.message));
    api.get<SettlementRow[]>("/owner/settlements").then(setHistory).catch(() => {});
  }, []);
  useEffect(load, [load]);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Loading />;

  return (
    <>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-5">
        <StatTile
          label="المستحق على العيادات"
          value={formatFee(data.summary.dueAmount)}
          tone="accent"
          sub={`${statNumber(data.summary.dueVisits)} زيارة`}
        />
        <StatTile label="المقبوض هذا الشهر" value={formatFee(data.summary.collectedThisMonth)} tone="ok" />
        <StatTile label="عيادات لها مستحقات" value={statNumber(data.dues.length)} />
        <StatTile
          label="ممارسات بلا عمولة"
          value={statNumber(data.summary.practicesWithoutRate)}
          tone={data.summary.practicesWithoutRate > 0 ? "warn" : "muted"}
          sub={data.summary.practicesWithoutRate > 0 ? "لن تُحتسب لها عمولة" : undefined}
        />
      </div>

      <SectionTitle>المستحق على كل عيادة</SectionTitle>
      {data.dues.length === 0 ? (
        <Card>
          <EmptyState
            title="لا توجد عمولات مستحقة"
            hint="تُسجَّل العمولة لحظة تأشير حضور المريض — لا عند الحجز."
          />
        </Card>
      ) : (
        <div className="grid gap-2.5 mb-8">
          {data.dues.map((row) => (
            <Card key={row.clinicId}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[15.5px] font-bold">{row.clinicName}</p>
                  <p className="text-[13px] mt-0.5" style={{ color: "var(--muted)" }}>
                    {row.governorate} — {countLabel(row.visits, { one: "زيارة", two: "زيارتان", few: "زيارات", many: "زيارة" })}
                    {row.lastVisitAt && ` · آخرها ${formatDay(row.lastVisitAt.slice(0, 10))}`}
                  </p>
                </div>
                <span className="text-[20px] font-bold tnum" style={{ color: "var(--accent)" }}>
                  {formatFee(row.amount)}
                </span>
              </div>

              <div className="flex gap-2 mt-3 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => setDetail(row)}>
                  تفصيل الزيارات
                </Button>
                {row.phone && (
                  <a href={`tel:${row.phone}`}>
                    <Button variant="ghost" size="sm">
                      اتصال بالعيادة
                    </Button>
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionTitle>سجل التحصيلات</SectionTitle>
      {history.length === 0 ? (
        <Card>
          <EmptyState title="لم تسجّل تحصيلاً بعد" hint="عند قبضك من عيادة، سجّله هنا ليُغلق مستحقّها." />
        </Card>
      ) : (
        <Card padded={false}>
          <div className="scroll-x">
            <table className="w-full text-[13.5px] min-w-[520px]">
              <thead>
                <tr style={{ color: "var(--faint)", background: "var(--surface-2)" }}>
                  <th className="text-start font-medium px-4 py-2.5">العيادة</th>
                  <th className="text-start font-medium px-4 py-2.5">المبلغ</th>
                  <th className="text-start font-medium px-4 py-2.5">الزيارات</th>
                  <th className="text-start font-medium px-4 py-2.5">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="px-4 py-2.5 font-semibold">{row.clinicName}</td>
                    <td className="px-4 py-2.5 tnum" style={{ color: "var(--ok)" }}>
                      {formatFee(row.amount)}
                    </td>
                    <td className="px-4 py-2.5 tnum" style={{ color: "var(--muted)" }}>
                      {toArabic(row.count)}
                    </td>
                    <td className="px-4 py-2.5 tnum" style={{ color: "var(--muted)" }}>
                      {formatDay(row.createdAt.slice(0, 10))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {detail && (
        <ClinicDuesDialog
          clinic={detail}
          onClose={() => setDetail(null)}
          onSettled={() => {
            setDetail(null);
            load();
          }}
        />
      )}
    </>
  );
}

function ClinicDuesDialog({
  clinic,
  onClose,
  onSettled,
}: {
  clinic: CommissionData["dues"][number];
  onClose: () => void;
  onSettled: () => void;
}) {
  const [rows, setRows] = useState<ClinicDue[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ClinicDue[]>(`/owner/commissions/clinics/${clinic.clinicId}`)
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [clinic.clinicId]);

  async function settle() {
    if (!confirm(`تأكيد قبض ${formatFee(clinic.amount)} من ${clinic.clinicName}؟`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/owner/commissions/clinics/${clinic.clinicId}/settle`, { note: note.trim() || undefined });
      onSettled();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={clinic.clinicName}
      hint={`${countLabel(clinic.visits, { one: "زيارة", two: "زيارتان", few: "زيارات", many: "زيارة" })} — ${formatFee(clinic.amount)} مستحقة`}
      onClose={onClose}
    >
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {rows === null ? (
        <Loading />
      ) : (
        <div className="max-h-64 overflow-y-auto -mx-1 px-1 mb-4">
          {/* تفصيل الزيارات: المالك يطالب العيادة بمريض بعينه لا بمبلغ مجمَّع */}
          {rows.map((row) => (
            <div key={row.id} className="py-2.5 text-[13px]" style={{ borderBottom: "1px solid var(--line)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{row.patientName}</span>
                <span className="tnum">{formatFee(row.amount)}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5" style={{ color: "var(--muted)" }}>
                <span>{row.doctorName}</span>
                <span className="tnum">· {formatDay(row.earnedAt.slice(0, 10))}</span>
                <span className="tnum">· {row.reference}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3">
        <Field label="ملاحظة على التحصيل" hint="اختياري — مثل «نقداً» أو «تحويل»">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="نقداً" />
        </Field>
        <Button variant="accent" size="lg" full loading={busy} onClick={settle}>
          تسجيل قبض {formatFee(clinic.amount)}
        </Button>
        <Button variant="ghost" full onClick={onClose}>
          إغلاق
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
  renderedBody: string | null;
  sentAt: string | null;
  createdAt: string;
};

/**
 * رابطٌ يفتح محادثة واتساب مع الرقم والنصّ معبّأً.
 *
 * لأن الإرسال التلقائي يحتاج اعتماد ميتا، وقد لا يكون جاهزاً بعد أو قد
 * تُرفض رسالةٌ بعينها. حينها لا تضيع: يفتحها المالك بلمسةٍ ويضغط إرسال.
 */
function waMeLink(to: string | null, body: string | null): string | null {
  if (!to || !body) return null;
  return `https://wa.me/${to.replace(/[^\d]/g, "")}?text=${encodeURIComponent(body)}`;
}

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
                  <th className="text-start font-medium px-4 py-2.5"> </th>
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
                      <td className="px-4 py-2.5">
                        {row.status !== "SENT" && waMeLink(row.toAddress, row.renderedBody) && (
                          <a
                            href={waMeLink(row.toAddress, row.renderedBody) ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[12.5px] font-semibold whitespace-nowrap"
                            style={{ color: "var(--primary)" }}
                          >
                            أرسلها بنفسك ↗
                          </a>
                        )}
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
