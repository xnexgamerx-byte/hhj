/**
 * يولّد أيقونات التطبيق وشاشة البداية والويب من تعريف واحد للهوية،
 * كي لا تتفرّق العلامة بين الحزمتين.
 *
 * العلامة: شعار «دكتورلي» — صليبٌ طبّي وسمّاعة — أبيض فوق تدرّج زمرّدي،
 * والكلمة «دكتورلي» بخط ريم كوفي 700 كما في واجهة الويب.
 *
 * مصدر الشعار assets/brand-source.png: أبيضُ على شفافية، مقصوصٌ على حبره تماماً
 * فتُحسب هوامشه هنا لا فيه. لتبديل الشعار يُستبدل ذلك الملف ويُعاد التشغيل،
 * وتتبعه الصور العشر — الأيقونات وشاشة البداية والعلامة داخل الواجهتين.
 *
 *   npx playwright install chromium   # مرّة واحدة
 *   node scripts/generate-icons.mjs
 *
 * إن كان في الجهاز كروميوم جاهز فمرّره بـ CHROME_PATH بدل تنزيل نسخة أخرى
 * (نفس المتغيّر الذي تستعمله اختبارات المتصفّح).
 * يُشغَّل يدوياً عند تغيّر ألوان الهوية فقط، ونتائجه محفوظة في المستودع.
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const ASSETS = path.join(ROOT, "assets");
const WEB_APP = path.resolve(ROOT, "..", "web", "src", "app");
// ICON_OUT_DIR يجمع كل شيء في مجلّد واحد للمعاينة قبل الاعتماد.
const PREVIEW = process.env.ICON_OUT_DIR ? path.resolve(process.env.ICON_OUT_DIR) : null;
const dirs = { mobile: ASSETS, web: WEB_APP, webPublic: path.resolve(ROOT, "..", "web", "public") };

// ── الهوية ───────────────────────────────────────────────────────────────────
// نفس درجات mobile/src/theme.ts — الأيقونة والتطبيق لون واحد
const EMERALD_LIGHT = "#1A7C61";
const EMERALD = "#0E5140";
const EMERALD_DEEP = "#073328";
const WHITE = "#FFFFFF";

// العلامة في موضعٍ واحد: تغييرها يمسّ ثماني صور
const MARK_FILE = path.join(ASSETS, "brand-source.png");
const WORDMARK = "دكتورلي";

const SANS = path.join(ASSETS, "fonts", "IBMPlexSansArabic-700.ttf");
const DISPLAY = path.resolve(ROOT, "..", "web", "public", "fonts", "reem-kufi-700-arabic.woff2");

if (!existsSync(SANS)) throw new Error(`لم أجد خطّ العلامة: ${SANS}`);
if (!existsSync(MARK_FILE)) throw new Error(`لم أجد الشعار: ${MARK_FILE}`);

// الشعار يُضمَّن في الـSVG كبيانات لا كمسار: صفحة file:// لا يُسمح لها بقراءة
// صورةٍ من القرص، والتضمين يجعل الصفحة مكتفيةً بنفسها
const markBytes = await readFile(MARK_FILE);
const MARK_URI = `data:image/png;base64,${markBytes.toString("base64")}`;
// أبعاده من ترويسة PNG مباشرةً — أرخص من تحميل مكتبة صور
const MARK_RATIO = markBytes.readUInt32BE(16) / markBytes.readUInt32BE(20);
const hasDisplay = existsSync(DISPLAY);
if (!hasDisplay) console.warn(`تنبيه: لم أجد ريم كوفي في ${DISPLAY} — سأكتب «${WORDMARK}» بخط بلكس.`);

// نسبة العلامة من ضلع المربّع في الأيقونة الكاملة.
// أوسع من نسبة الحرف السابقة (٠.٥٢): الشعار فيه تفاصيلُ سمّاعةٍ رفيعة تختفي
// إن صغُر، والحرف كان كتلةً واحدة تحتمل الهامش الواسع.
const MARK_SPAN = 0.64;
// أندرويد يقصّ الأيقونة التكيّفية إلى ٦٦٪ من القماش، فنصغّر العلامة بنفس النسبة
// كي تظهر بالحجم ذاته بعد القصّ.
const ADAPTIVE_VISIBLE = 2 / 3;

// ── بناء الصفحة ──────────────────────────────────────────────────────────────
const gradient = (w, h) => `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.65" y2="1">
      <stop offset="0" stop-color="${EMERALD_LIGHT}"/>
      <stop offset="0.55" stop-color="${EMERALD}"/>
      <stop offset="1" stop-color="${EMERALD_DEEP}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>`;

/** نصّ يُقاس صندوقه بعد تحميل الخط ثم يُوسَّط ويُقاس إلى المدى المطلوب. */
const fitted = (text, { cx, cy, span, by = "max", family = "Sans", fill = WHITE }) =>
  `<text data-fit='${JSON.stringify({ cx, cy, span, by, family })}'
         font-family="${family}" font-weight="700" font-size="100"
         fill="${fill}" xml:lang="ar">${text}</text>`;

/** يُصفّر القنوات الثلاث ويُبقي الشفافية: صورةٌ ظلّية يلوّنها النظام */
const INK_FILTER = `<defs><filter id="ink"><feColorMatrix type="matrix"
  values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"/></filter></defs>`;

/**
 * العلامة داخل مربّعٍ افتراضي ضلعه ratio من ضلع القماش، موسّطةً أفقياً
 * وعلى cy رأسياً (وسط القماش افتراضاً).
 */
const mark = (size, { ratio = MARK_SPAN, dark = false, cy = size / 2 } = {}) => {
  const span = size * ratio;
  const w = MARK_RATIO >= 1 ? span : span * MARK_RATIO;
  const h = MARK_RATIO >= 1 ? span / MARK_RATIO : span;
  return `${dark ? INK_FILTER : ""}<image href="${MARK_URI}" x="${(size - w) / 2}" y="${cy - h / 2}"
      width="${w}" height="${h}" ${dark ? 'filter="url(#ink)"' : ""}/>`;
};

function html({ width, height, body, transparent }) {
  return `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:'Sans';src:url('${pathToFileURL(SANS).href}') format('truetype');font-weight:700}
${hasDisplay ? `@font-face{font-family:'Display';src:url('${pathToFileURL(DISPLAY).href}') format('woff2');font-weight:700}` : ""}
html,body{margin:0;padding:0;background:${transparent ? "transparent" : "#fff"}}
svg{display:block}
</style>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

// ── الأصول المطلوبة ──────────────────────────────────────────────────────────
// شاشة البداية مربّعة عمداً: نمط Expo القديم (الذي يقرأه Expo Go) يُطبّق
// contain على الشاشة كلّها، فلو كانت الصورة عريضة لملأت العرض بالكامل.
// المربّع بهوامشه يجعل العلامة بحجم معقول في المسارين.
const SPLASH = 1024;
const wordFamily = hasDisplay ? "Display" : "Sans";

const assets = [
  {
    file: "icon.png",
    note: "أيقونة iOS والأيقونة القديمة في أندرويد — معتمة وبلا حواف مستديرة (النظام يستديرها)",
    width: 1024, height: 1024,
    body: (s) => gradient(s, s) + mark(s),
  },
  {
    file: "android-icon-background.png",
    note: "الطبقة الخلفية للأيقونة التكيّفية",
    width: 1024, height: 1024,
    body: (s) => gradient(s, s),
  },
  {
    file: "android-icon-foreground.png",
    note: "الطبقة الأمامية — شفّافة، والعلامة داخل المنطقة الآمنة",
    width: 1024, height: 1024, transparent: true,
    body: (s) => mark(s, { ratio: MARK_SPAN * ADAPTIVE_VISIBLE }),
  },
  {
    file: "android-icon-monochrome.png",
    note: "طبقة Material You — صورة ظلّية يلوّنها النظام",
    width: 1024, height: 1024, transparent: true,
    body: (s) => mark(s, { ratio: MARK_SPAN * ADAPTIVE_VISIBLE, dark: true }),
  },
  {
    file: "splash-icon.png",
    note: "شاشة البداية — العلامة والكلمة بالأبيض فوق خلفية زمرّدية",
    width: SPLASH, height: SPLASH, transparent: true,
    body: () =>
      mark(SPLASH, { ratio: 0.36, cy: 400 }) +
      fitted(WORDMARK, { cx: SPLASH / 2, cy: 680, span: 440, by: "width", family: wordFamily }),
  },
  {
    file: "favicon.png",
    note: "أيقونة المتصفّح — الحرف أكبر لأنها تُعرض بـ ١٦ بكسل",
    width: 256, height: 256,
    body: (s) => gradient(s, s) + mark(s, { ratio: 0.72 }),
  },
  {
    // Next.js يلتقط هذين الاسمين تلقائياً من مجلّد app ويضيف وسوم الربط.
    file: "icon.png", pkg: "web",
    note: "أيقونة تبويب المتصفّح في الويب",
    width: 256, height: 256,
    body: (s) => gradient(s, s) + mark(s, { ratio: 0.72 }),
  },
  {
    file: "apple-icon.png", pkg: "web",
    note: "أيقونة الويب عند إضافتها لشاشة آيفون",
    width: 180, height: 180,
    body: (s) => gradient(s, s) + mark(s),
  },
  // العلامة وحدها بلا خلفية: تضعها الواجهتان داخل مربّعها الزمرّدي في الرأس.
  // بحجمٍ صغير لا بمقاس المصدر — ملفٌّ بألف بكسل يُعرض بعشرين حمولةٌ بلا فائدة.
  {
    file: "brand-mark.png",
    note: "العلامة داخل رأس التطبيق",
    width: 128, height: 128, transparent: true,
    body: (s) => mark(s, { ratio: 1 }),
  },
  {
    file: "brand-mark.png", pkg: "webPublic",
    note: "العلامة داخل رأس لوحة الويب",
    width: 128, height: 128, transparent: true,
    body: (s) => mark(s, { ratio: 1 }),
  },
];

// ── التوليد ──────────────────────────────────────────────────────────────────
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
});
const page = await browser.newPage();

for (const a of assets) {
  const body = a.body(a.width);
  await page.setViewportSize({ width: a.width, height: a.height });
  await page.setContent(html({ ...a, body }), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);

  // نقيس حبر كل نصّ بعد أن يجهز الخط، ثم نضعه في مركزه بالمقاس المطلوب.
  //
  // بالقياس على canvas لا بـgetBBox: الأخير يعيد صندوق سطرٍ كامل بارتفاع الخطّ
  // (١١٧ لكل حرفٍ مهما كان)، فحرفٌ قصيرٌ كـ«د» — حبره ٤٥ — يُقاس على ١١٧
  // فيخرج بثلث الحجم المطلوب وينزل عن المركز. وactualBoundingBox* يعطي حدود
  // الحبر نفسه، فتملأ العلامةُ المدى الذي طُلب لها أياً كان الحرف.
  const missing = await page.evaluate(() => {
    const out = [];
    const ctx = document.createElement("canvas").getContext("2d");
    // ltr ليطابق اتجاه ‎<text>‎ في هذا الملف: لا direction عليه، فيرسم من نقطة
    // الإرساء إلى اليمين وإن كانت حروفه عربية. وrtl هنا يقلب إشارة القياس
    // فتخرج العلامة خارج الإطار.
    ctx.direction = "ltr";
    for (const t of document.querySelectorAll("text[data-fit]")) {
      const { cx, cy, span, by, family } = JSON.parse(t.dataset.fit);
      ctx.font = `700 100px '${family}'`;
      const m = ctx.measureText(t.textContent);
      const box = {
        x: -m.actualBoundingBoxLeft,
        y: -m.actualBoundingBoxAscent,
        width: m.actualBoundingBoxLeft + m.actualBoundingBoxRight,
        height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent,
      };
      if (!box.width || !box.height) { out.push(t.textContent); continue; }
      const basis = by === "width" ? box.width : Math.max(box.width, box.height);
      const s = span / basis;
      t.setAttribute(
        "transform",
        `translate(${cx},${cy}) scale(${s}) translate(${-(box.x + box.width / 2)},${-(box.y + box.height / 2)})`
      );
    }
    return out;
  });
  if (missing.length) throw new Error(`تعذّر قياس النصّ (خط غير محمّل؟): ${missing.join(", ")}`);

  const buf = await page.screenshot({ omitBackground: Boolean(a.transparent) });
  const pkg = a.pkg ?? "mobile";
  const dir = PREVIEW ?? dirs[pkg];
  const file = PREVIEW && a.pkg ? `${pkg}-${a.file}` : a.file;
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, file), buf);
  console.log(`✓ ${pkg.padEnd(6)} ${a.file.padEnd(28)} ${a.width}×${a.height}  ${a.note}`);
}

await browser.close();
