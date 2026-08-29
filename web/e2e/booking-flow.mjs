/**
 * اختبار المسار الكامل في متصفح حقيقي.
 *
 * يغطي السؤال الجوهري: هل يحدد الطبيب أوقاته من لوحته، وهل يختفي الوقت
 * من شاشة المريض بمجرد حجزه؟
 *
 * التشغيل (الخادم على ٣٠٠٠ والواجهة على ٣٠٠١):
 *   OWNER_EMAIL=owner@mawid.iq OWNER_PASSWORD=... node e2e/booking-flow.mjs
 *
 * يجهّز بياناته بنفسه عبر واجهة المالك، فلا يحتاج قاعدة بيانات معدّة مسبقاً.
 */
import { chromium } from "playwright";

const API = process.env.API_URL ?? "http://localhost:3000";
const WEB = process.env.WEB_URL ?? "http://localhost:3001";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "owner@mawid.iq";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD;
const CHROME = process.env.CHROME_PATH; // مسار متصفح جاهز، وإلا استُعمل متصفح Playwright

if (!OWNER_PASSWORD) {
  console.error("عيّن OWNER_PASSWORD — باسوورد المالك بعد تغييره الأول");
  process.exit(1);
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? `\n   ${detail}` : ""}`);
}

async function callApi(path, { method = "GET", body, token } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} ⇐ ${response.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

// ── تجهيز: المالك يسجّل طبيبة ويربطها بعيادة ────────────────────
const stamp = Date.now().toString().slice(-8);
const owner = await callApi("/auth/login", {
  method: "POST",
  body: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
});
if (owner.mustChangePassword) {
  console.error("على المالك تغيير باسووردهِ الأولي أولاً");
  process.exit(1);
}

const specialties = await callApi("/specialties");
const governorates = await callApi("/locations/governorates");
const districts = await callApi(`/locations/governorates/${governorates[0].id}/districts`);

const doctor = await callApi("/owner/doctors", {
  method: "POST",
  token: owner.accessToken,
  body: {
    fullName: `طبيبة الاختبار ${stamp}`,
    email: `e2e.${stamp}@clinic.iq`,
    whatsappNumber: "٠٧٧٠١٢٣٤٥٦٧",
    specialtyIds: [specialties[0].id],
  },
});

const clinic = await callApi("/owner/clinics", {
  method: "POST",
  token: owner.accessToken,
  body: {
    nameAr: `عيادة الاختبار ${stamp}`,
    governorateId: governorates[0].id,
    districtId: districts[0].id,
    landmark: "مقابل مستشفى الاختبار",
  },
});

const practice = await callApi(`/owner/doctors/${doctor.doctorId}/practices`, {
  method: "POST",
  token: owner.accessToken,
  body: { clinicId: clinic.id, feeAmount: 25000, bookingMode: "SLOT", slotMinutes: 20 },
});

// ── المتصفح ──────────────────────────────────────────────────────
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const pageErrors = [];

// ١) الطبيبة تدخل وتحدد أوقاتها
const doctorPage = await browser.newPage({ viewport: { width: 1280, height: 950 }, locale: "ar-IQ" });
doctorPage.on("pageerror", (e) => pageErrors.push(`doctor: ${e.message}`));

await doctorPage.goto(`${WEB}/login`, { waitUntil: "networkidle" });
await doctorPage.getByLabel("الإيميل").fill(doctor.email);
await doctorPage.getByLabel("الباسوورد").fill(doctor.temporaryPassword);
await doctorPage.getByRole("button", { name: "دخول" }).click();
await doctorPage.waitForTimeout(1200);

const forced = await doctorPage.getByText("غيّر باسووردك").isVisible().catch(() => false);
check("الطبيبة تُجبَر على تغيير الباسوورد الأولي", forced);

await doctorPage.getByLabel("الباسوورد الجديد").fill("E2ePass2026");
await doctorPage.getByLabel("تأكيد الباسوورد").fill("E2ePass2026");
await doctorPage.getByRole("button", { name: "حفظ ومتابعة" }).click();
await doctorPage.waitForURL("**/doctor", { timeout: 15000 });
await doctorPage.waitForTimeout(1500);

await doctorPage.getByRole("button", { name: "أوقات الحجز" }).click();
await doctorPage.waitForTimeout(700);
for (const day of ["الإثنين", "الأربعاء"]) {
  await doctorPage.getByRole("button", { name: day, exact: true }).click();
  await doctorPage.waitForTimeout(250);
}
await doctorPage.getByRole("button", { name: "حفظ الجدول" }).click();
await doctorPage.waitForTimeout(1800);
check(
  "الطبيبة تحدد أيام دوامها وساعاتها من لوحتها",
  await doctorPage.getByText("حُفظ الجدول").isVisible().catch(() => false),
  "الإثنين والأربعاء ٤:٠٠–٧:٠٠، مدة الكشف ٢٠ دقيقة",
);

// ٢) المريض يرى الأوقات الشاغرة ويحجز
const patient = await browser.newPage({ viewport: { width: 430, height: 940 }, locale: "ar-IQ" });
patient.on("pageerror", (e) => pageErrors.push(`patient: ${e.message}`));

await patient.goto(`${WEB}/doctors/${doctor.doctorId}`, { waitUntil: "networkidle" });
await patient.waitForTimeout(2200);

// العدد المتوقّع من الخادم لا رقماً ثابتاً: لو صادف التشغيل يوم دوام داخل
// شبّاك ٤–٧ مساءً لصارت بعض الفترات ماضية والعدد أقل من تسع
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
const availability = await callApi(`/practices/${practice.id}/availability?from=${today}`);
const firstOpen = availability.find((d) => d.freeCount > 0);
const expected = firstOpen ? firstOpen.sessions.reduce((n, session) => n + session.slots.length, 0) : 0;

const slots = patient.locator("button").filter({ hasText: /^[٠-٩]+:[٠-٩]+ [صم]$/ });
const before = await slots.count();
check(
  "ملف الطبيبة يعرض ما يقوله الخادم من فترات شاغرة",
  before === expected && before > 2,
  `${before} فترة، والخادم يقول ${expected} ليوم ${firstOpen?.date ?? "—"}`,
);

const target = (await slots.nth(2).textContent()).trim();
await slots.nth(2).click();
await patient.waitForTimeout(700);

await patient.getByLabel("رقم الهاتف").fill(`077${stamp}`);
await patient.getByRole("button", { name: "إرسال الرمز" }).click();
await patient.waitForTimeout(1200);
const code = (await patient.getByText(/رمز التطوير/).textContent()).match(/(\d{6})/)[1];
await patient.getByLabel("الاسم الكامل").fill("مريض الاختبار");
await patient.getByLabel("رمز التحقق").fill(code);
await patient.getByRole("button", { name: "تأكيد الرمز" }).click();
await patient.waitForTimeout(1500);

await patient.getByLabel("ملاحظة للطبيب").fill("ملاحظة اختبارية");
await patient.getByRole("button", { name: "تثبيت الحجز" }).click();
await patient.waitForTimeout(2500);
check(
  "الحجز يتم ويظهر الرقم المرجعي",
  await patient.getByText("تم تثبيت حجزك").isVisible().catch(() => false),
);

// ٣) الوقت المحجوز اختفى من شاشة المريض
await patient.getByRole("button", { name: "إغلاق", exact: true }).click();
await patient.waitForTimeout(2500);
const after = await slots.count();
const stillListed = await slots.filter({ hasText: target }).count();
check(
  "الوقت المحجوز يختفي فوراً من شاشة المريض",
  after === before - 1 && stillListed === 0,
  `كانت ${before} فترة وصارت ${after} — والفترة ${target} لم تعد معروضة`,
);

// ٤) الطبيبة ترى الحجز في قائمة مرضاها
await doctorPage.getByRole("button", { name: "مرضى اليوم" }).click();
await doctorPage.waitForTimeout(900);
let found = false;
for (let i = 0; i < 8 && !found; i++) {
  found = await doctorPage.getByText("مريض الاختبار").first().isVisible().catch(() => false);
  if (!found) {
    await doctorPage.getByRole("button", { name: "التالي →" }).click();
    await doctorPage.waitForTimeout(900);
  }
}
check(
  "لوحة الطبيبة تعرض المريض مع ملاحظته",
  found && (await doctorPage.getByText("ملاحظة اختبارية").isVisible().catch(() => false)),
);

await browser.close();

if (pageErrors.length) console.log("\nأخطاء صفحات: " + pageErrors.slice(0, 5).join(" | "));
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} خطوات نجحت`);
process.exit(passed === results.length && pageErrors.length === 0 ? 0 : 1);
