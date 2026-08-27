/**
 * اختبار المسار الكامل للتطبيق في متصفح حقيقي، عبر نسخة الويب المصدَّرة.
 *
 * لماذا الويب: react-native-web يشغّل نفس شفرة الشاشات والمكوّنات، فيثبت أن
 * المنطق والتخطيط والاتجاه سليمة دون محاكي أندرويد أو آيفون. ما لا يغطيه هذا
 * الاختبار هو ما يخص المنصّة وحدها: الحافظة الآمنة، الإشعارات، وسلوك لوحة المفاتيح.
 *
 * التشغيل:
 *   npm run export:web
 *   node scripts/serve-web-export.mjs &        # على المنفذ ٣٠٠٢
 *   OWNER_EMAIL=owner@mawid.iq OWNER_PASSWORD=... npm run e2e
 */
import { chromium } from "playwright";

const API = process.env.API_URL ?? "http://localhost:3000";
const APP = process.env.APP_URL ?? "http://localhost:3002";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "owner@mawid.iq";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD;
const CHROME = process.env.CHROME_PATH;

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

// ── تجهيز البيانات عبر واجهة المالك ─────────────────────────────
const stamp = Date.now().toString().slice(-8);
const owner = await callApi("/auth/login", { method: "POST", body: { email: OWNER_EMAIL, password: OWNER_PASSWORD } });
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
    email: `m2e.${stamp}@clinic.iq`,
    whatsappNumber: "٠٧٧٠١٢٣٤٥٦٧",
    yearsOfExperience: 12,
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
await callApi(`/owner/doctors/${doctor.doctorId}/practices`, {
  method: "POST",
  token: owner.accessToken,
  body: {
    clinicId: clinic.id,
    feeAmount: 25000,
    bookingMode: "SLOT",
    slotMinutes: 20,
    // كل أيام الأسبوع حتى لا يتوقف الاختبار على يوم تشغيله
    schedules: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "16:00", endTime: "19:00" })),
  },
});

// ── المتصفح ─────────────────────────────────────────────────────
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const ctx = await browser.newContext({
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 2,
  locale: "ar-IQ",
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(APP, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

check(
  "الشاشة الرئيسية تفتح على محافظة المستخدم وتخصصاتها",
  (await page.getByText("احجز موعدك عند طبيبك").isVisible().catch(() => false)) &&
    (await page.getByText(specialties[0].nameAr).first().isVisible().catch(() => false)),
);

const meta = await page.evaluate(() => {
  const el = [...document.querySelectorAll("div")].find((d) => d.textContent?.trim() === "احجز موعدك عند طبيبك");
  return {
    dir: document.documentElement.dir,
    lang: document.documentElement.lang,
    font: el ? getComputedStyle(el).fontFamily : "",
  };
});
check(
  "الاتجاه من اليمين لليسار والخط المخصص محمَّل",
  meta.dir === "rtl" && meta.lang === "ar" && /PlexArabic/.test(meta.font),
  `dir=${meta.dir} lang=${meta.lang} font=${meta.font.slice(0, 20)}`,
);

await page.goto(`${APP}/doctor/${doctor.doctorId}`, { waitUntil: "networkidle" });
await page.waitForTimeout(2800);

const slots = page.getByRole("button").filter({ hasText: /^[٠-٩]+:[٠-٩]+ [صم]$/ });
const before = await slots.count();
check("شبكة الأوقات تعرض الشاغر فقط", before === 9, `${before} فترة من ٤:٠٠ إلى ٦:٤٠`);

const target = (await slots.nth(2).textContent()).trim();
await slots.nth(2).click();
await page.waitForTimeout(1000);

await page.getByPlaceholder("07701234567").fill(`077${stamp}`);
await page.getByRole("button", { name: "إرسال الرمز" }).click();
await page.waitForTimeout(1500);
const code = (await page.getByText(/رمز التطوير/).textContent()).match(/(\d{6})/)[1];
await page.getByPlaceholder("الاسم الثلاثي").fill("مريض الاختبار");
await page.getByPlaceholder("******").fill(code);
await page.getByRole("button", { name: "تأكيد الرمز" }).click();
await page.waitForTimeout(2000);

await page.getByPlaceholder(/ألم في الصدر/).fill("ملاحظة اختبارية");
await page.getByRole("button", { name: "تثبيت الحجز" }).click();
await page.waitForTimeout(3000);
check("الحجز يتم من التطبيق ويظهر الرقم المرجعي", await page.getByText("تم تثبيت حجزك").isVisible().catch(() => false));

await page.getByRole("button", { name: "إغلاق", exact: true }).click();
await page.waitForTimeout(3000);
const after = await slots.count();
const still = await slots.filter({ hasText: target }).count();
check(
  "الوقت المحجوز يختفي فوراً من التطبيق",
  after === before - 1 && still === 0,
  `كانت ${before} فترة وصارت ${after} — والفترة ${target} لم تعد معروضة`,
);

await page.goto(`${APP}/bookings`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
check("شاشة حجوزاتي تعرض الموعد القادم", await page.getByText("المواعيد القادمة").isVisible().catch(() => false));

await browser.close();
if (errors.length) console.log("\nأخطاء صفحات: " + errors.slice(0, 4).join(" | "));
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} خطوات نجحت`);
process.exit(passed === results.length && errors.length === 0 ? 0 : 1);
