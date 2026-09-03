/** جولةٌ في التطبيق كما يمرّ بها مريضٌ حقيقي، بلقطةٍ عند كل خطوة. */
import { chromium } from "playwright";

const APP = "http://localhost:3002";
const API = "http://localhost:3000";
const OUT = process.argv[2];
const stamp = Date.now().toString().slice(-8);

const ar = (v) => String(v).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
const clinicDate = (o) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date(Date.now() + o * 86400000));

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, locale: "ar-IQ", isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text()); });

let n = 0;
const shot = async (name, wait = 900) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true });
  console.log(`  ${String(n).padStart(2, "0")} ${name}`);
};

// ١ · الشاشة الرئيسية
await page.goto(APP, { waitUntil: "networkidle" });
await shot("home", 2600);

// ٢ · تخصص «قلبية»
await page.getByText("قلبية", { exact: true }).filter({ visible: true }).first().click();
await shot("doctors", 2200);

// ٣ · صفحة الطبيبة
await page.getByText("ليلى الحيدري").filter({ visible: true }).first().click();
await shot("doctor", 2400);

// ٤ · شاشة الحجز
await page.getByRole("button", { name: "احجز موعد" }).click();
await shot("book-calendar", 2800);

// نختار الغد صراحةً — شبّاكه كامل مهما كانت ساعة التشغيل
const today = clinicDate(0), tomorrow = clinicDate(1);
if (tomorrow.slice(0, 7) !== today.slice(0, 7)) {
  await page.getByRole("button", { name: "الشهر التالي" }).click();
  await page.waitForTimeout(700);
}
await page.getByRole("button", { name: new RegExp(`^${ar(Number(tomorrow.slice(8, 10)))}\\s`) }).first().click();
const slots = page.getByRole("button").filter({ hasText: /^[٠-٩]+:[٠-٩]+ [صم]$/ });
await page.waitForTimeout(1200);
console.log("     أوقات شاغرة:", await slots.count());

// ٥ · اختيار وقت
const picked = (await slots.nth(6).textContent()).trim();
await slots.nth(6).click();
await shot("book-slot-picked", 900);

// ٦ · تسجيل الدخول برمز
await page.getByRole("button", { name: "متابعة الحجز" }).click();
await page.waitForTimeout(1200);
await page.getByPlaceholder("07701234567").first().fill(`077${stamp}`);
await shot("sheet-phone", 600);
await page.getByRole("button", { name: "إرسال الرمز" }).click();
await page.waitForTimeout(1600);
const code = (await page.getByText(/رمز التطوير/).textContent()).match(/(\d{6})/)[1];
await page.getByPlaceholder("الاسم الثلاثي").first().fill("حيدر عبد الأمير");
await page.getByPlaceholder("******").fill(code);
await shot("sheet-otp", 500);
await page.getByRole("button", { name: "تأكيد الرمز" }).click();
await page.waitForTimeout(2200);

// ٧ · بيانات المريض — تُسأل مرّةً واحدة
await page.getByPlaceholder("الكرخ — حي الجامعة").fill("الرصافة — الكرادة داخل، قرب ساحة كهرمانة");
await page.getByPlaceholder("32").fill("41");
await page.getByText("سكري", { exact: true }).filter({ visible: true }).first().click();
await page.getByText("ضغط", { exact: true }).filter({ visible: true }).first().click();
await page.getByPlaceholder(/ألم في الصدر/).fill("تعب عند المشي من أسبوع");
await shot("sheet-details", 700);

// ٨ · التثبيت والرقم
await page.getByRole("button", { name: "تثبيت الحجز" }).click();
await shot("confirmed", 3000);

const serial = await page.evaluate(() => {
  const el = [...document.querySelectorAll("div")].find((d) => d.children.length === 0 && /^[٠-٩]+$/.test(d.textContent?.trim() ?? ""));
  return el?.textContent?.trim() ?? "?";
});
console.log("     الوقت المحجوز:", picked, "· الرقم في العيادة:", serial);

// ٩ · مواعيدي
await page.getByRole("button", { name: "مواعيدي" }).click();
await shot("my-bookings", 2600);

// ١٠ · الإشعارات
await page.goto(`${APP}/notifications`, { waitUntil: "networkidle" });
await shot("notifications", 2400);

// ١١ · حسابي والثيم
await page.goto(`${APP}/profile`, { waitUntil: "networkidle" });
await shot("profile", 2200);
await page.getByText("داكن", { exact: true }).filter({ visible: true }).first().click();
await shot("profile-dark", 1400);
await page.goto(APP, { waitUntil: "networkidle" });
await shot("home-dark", 2600);
await page.getByText("تلقائي", { exact: true }).filter({ visible: true }).first().click().catch(() => {});

// ١٢ · لوحة الطبيبة في الجوال
await page.goto(`${APP}/profile`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.getByText("فاتح", { exact: true }).filter({ visible: true }).first().click();
await page.waitForTimeout(600);
await page.goto(`${APP}/staff-login`, { waitUntil: "networkidle" });
await page.waitForTimeout(1800);
await page.getByPlaceholder(/@/).first().fill("demo.doctor@clinic.iq");
await page.getByPlaceholder("••••••••").first().fill("Demo123456").catch(async () => {
  const pw = page.locator('input[type="password"]');
  await pw.first().fill("Demo123456");
});
await shot("staff-login", 600);
await page.getByRole("button", { name: "دخول", exact: true }).click();
await page.waitForTimeout(2600);
await page.goto(`${APP}/clinic`, { waitUntil: "networkidle" });
await shot("clinic-board", 2800);

console.log(problems.length ? "\nمشاكل:\n" + [...new Set(problems)].join("\n") : "\nلا أخطاء في المتصفّح");
console.log("phone=077" + stamp);
await browser.close();
