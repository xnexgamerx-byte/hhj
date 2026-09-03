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
 *   OWNER_EMAIL=owner@doctorli.iq OWNER_PASSWORD=... npm run e2e
 */
import { chromium } from "playwright";

const API = process.env.API_URL ?? "http://localhost:3000";
const APP = process.env.APP_URL ?? "http://localhost:3002";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "owner@doctorli.iq";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD;
const CHROME = process.env.CHROME_PATH;
const SHOTS = process.env.SHOTS;

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
const practice = await callApi(`/owner/doctors/${doctor.doctorId}/practices`, {
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
const shot = (name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }) : Promise.resolve());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(APP, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await shot("m1-home");

check(
  "الشاشة الرئيسية تفتح على محافظة المستخدم وتخصصاتها",
  (await page.getByText("التخصصات").first().isVisible().catch(() => false)) &&
    (await page.getByText(specialties[0].nameAr).first().isVisible().catch(() => false)),
);

const meta = await page.evaluate(() => {
  const el = [...document.querySelectorAll("div")].find((d) => d.textContent?.trim() === "التخصصات");
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

await page.goto(`${APP}/doctors?governorateId=${governorates[0].id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await shot("m2-doctors");

await page.goto(`${APP}/doctor/${doctor.doctorId}`, { waitUntil: "networkidle" });
await page.waitForTimeout(2800);
await shot("m3-profile");

check(
  "صفحة الطبيب تعرض التعريف وزر الحجز",
  (await page.getByText(`طبيبة الاختبار ${stamp}`).first().isVisible().catch(() => false)) &&
    (await page.getByRole("button", { name: "احجز موعد" }).isVisible().catch(() => false)),
);

// الحجز صار شاشة مستقلّة: تقويم شهري ثم شبكة الأوقات
await page.getByRole("button", { name: "احجز موعد" }).click();
await page.waitForTimeout(3000);
await shot("m3b-book");

// نختار الغد من التقويم صراحةً بدل الاعتماد على اليوم المختار تلقائياً:
// شبّاك الدوام ٤–٧ مساءً، فتشغيل الاختبار داخله يترك اليوم بفترة أو فترتين،
// أما الغد فشبّاكه كامل دائماً. وفي ذلك تغطية للتقويم الجديد أيضاً.
const toArabic = (value) => String(value).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
const clinicDate = (offset) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date(Date.now() + offset * 86_400_000));

const today = clinicDate(0);
const tomorrow = clinicDate(1);
const availability = await callApi(`/practices/${practice.id}/availability?from=${today}`);
const target = availability.find((d) => d.date === tomorrow);
const expected = target ? target.sessions.reduce((n, session) => n + session.slots.length, 0) : 0;

// لو وقع الغد في شهر تالٍ فالتقويم يعرض الشهر الحالي، فننتقل خطوة
if (tomorrow.slice(0, 7) !== today.slice(0, 7)) {
  await page.getByRole("button", { name: "الشهر التالي" }).click();
  await page.waitForTimeout(800);
}
const dayNumber = toArabic(Number(tomorrow.slice(8, 10)));
await page.getByRole("button", { name: new RegExp(`^${dayNumber}\\s`) }).first().click();
await page.waitForTimeout(1500);

const slots = page.getByRole("button").filter({ hasText: /^[٠-٩]+:[٠-٩]+ [صم]$/ });
const before = await slots.count();
check(
  "التقويم يفتح الغد وشبكة الأوقات تطابق ما يقوله الخادم",
  before === expected && before > 2,
  `${before} فترة، والخادم يقول ${expected} ليوم ${tomorrow}`,
);

const pickedLabel = (await slots.nth(2).textContent()).trim();
await slots.nth(2).click();
await page.waitForTimeout(800);

// اللمس يختار الوقت فقط؛ نافذة التأكيد تُفتح بالزر السفلي
await page.getByRole("button", { name: "متابعة الحجز" }).click();
await page.waitForTimeout(1200);

await page.getByPlaceholder("07701234567").fill(`077${stamp}`);
await page.getByRole("button", { name: "إرسال الرمز" }).click();
await page.waitForTimeout(1500);
const code = (await page.getByText(/رمز التطوير/).textContent()).match(/(\d{6})/)[1];
await page.getByPlaceholder("الاسم الثلاثي").fill("مريض الاختبار");
await page.getByPlaceholder("******").fill(code);
await page.getByRole("button", { name: "تأكيد الرمز" }).click();
await page.waitForTimeout(2000);

await page.getByPlaceholder(/ألم في الصدر/).fill("ملاحظة اختبارية");
await shot("m4-booking");
await page.getByRole("button", { name: "تثبيت الحجز" }).click();
await page.waitForTimeout(3000);
check("الحجز يتم من التطبيق ويظهر الرقم المرجعي", await page.getByText("تم تثبيت حجزك").isVisible().catch(() => false));
await shot("m5-done");

await page.getByRole("button", { name: "إغلاق", exact: true }).click();
await page.waitForTimeout(3000);
const after = await slots.count();
const still = await slots.filter({ hasText: pickedLabel }).count();
check(
  "الوقت المحجوز يختفي فوراً من التطبيق",
  after === before - 1 && still === 0,
  `كانت ${before} فترة وصارت ${after} — والفترة ${pickedLabel} لم تعد معروضة`,
);

await page.goto(`${APP}/bookings`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
check(
  "شاشة مواعيدي تعرض تبويب القادمة والموعد فيه",
  (await page.getByRole("tab", { name: /القادمة/ }).isVisible().catch(() => false)) &&
    (await page.getByText("تم تثبيت", { exact: false }).isVisible().catch(() => false)) === false &&
    (await page.getByText(`طبيبة الاختبار ${stamp}`).first().isVisible().catch(() => false)),
);
await shot("m6-bookings");

// ── التقييم: نُنهي الزيارة عبر الخادم ثم نقيّمها من التطبيق ──
const doctorSession = await callApi("/auth/login", {
  method: "POST",
  body: { email: doctor.email, password: doctor.temporaryPassword },
});
if (doctorSession.mustChangePassword) {
  await callApi("/auth/password/change", {
    method: "POST",
    token: doctorSession.accessToken,
    body: { currentPassword: doctor.temporaryPassword, newPassword: "E2ePass2026" },
  });
}
const doctorLogin = await callApi("/auth/login", {
  method: "POST",
  body: { email: doctor.email, password: "E2ePass2026" },
});
// الموعد قد يقع في اليوم البغدادي التالي إن حُجز قرب منتصف الليل،
// فنبحث في اليوم وما بعده بدل افتراض «اليوم»
const clinicDay = (offset) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date(Date.now() + offset * 86_400_000));

let todays = [];
for (const offset of [0, 1]) {
  const rows = await callApi(`/clinic/me/appointments?date=${clinicDay(offset)}`, { token: doctorLogin.accessToken });
  if (rows.length > 0) {
    todays = rows;
    break;
  }
}

check("لوحة العيادة تعرض الحجز الذي أنشأه المريض من التطبيق", todays.length > 0, `${todays.length} حجز`);

if (todays.length > 0) {
  await callApi(`/clinic/me/appointments/${todays[0].id}/status`, {
    method: "PATCH",
    token: doctorLogin.accessToken,
    body: { status: "COMPLETED" },
  });

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  // الزيارة المنتهية تنتقل إلى تبويب «السابقة»، فنفتحه قبل البحث عن زر التقييم
  await page.getByRole("tab", { name: /السابقة/ }).click();
  await page.waitForTimeout(1200);

  const reviewButton = page.getByRole("button", { name: "قيّم هذه الزيارة" });
  const canReview = await reviewButton.first().isVisible().catch(() => false);

  if (canReview) {
    await reviewButton.first().click();
    await page.waitForTimeout(900);
    await shot("m7-review");

    // النجمة الرابعة
    await page.getByRole("button", { name: "4 من ٥" }).click();
    await page.getByPlaceholder(/ما الذي أعجبك/).fill("طبيبة متعاونة والانتظار قصير");
    await page.getByRole("button", { name: "إرسال التقييم" }).click();
    await page.waitForTimeout(2500);
  }

  check(
    "المريض يقيّم زيارته بعد أن تؤشّر العيادة انتهاء الكشف",
    canReview && !(await page.getByRole("button", { name: "قيّم هذه الزيارة" }).first().isVisible().catch(() => false)),
    "زر التقييم يظهر للزيارة المكتملة ويختفي بعد الإرسال",
  );
}

await browser.close();
if (errors.length) console.log("\nأخطاء صفحات: " + errors.slice(0, 4).join(" | "));
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} خطوات نجحت`);
process.exit(passed === results.length && errors.length === 0 ? 0 : 1);
