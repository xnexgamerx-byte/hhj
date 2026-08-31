/**
 * يجهّز api/.env ويصلح ما تلف منه — يُستدعى من setup.sh ومن npm run env:fix.
 *
 * بالـNode لا ببايثون: المشروع نودچس أصلاً، وبايثون غير مضمون على ويندوز
 * (Git Bash يعطي «Python was not found» ويسقط السكربت كلّه).
 *
 *   node scripts/setup-env.mjs --check   يفحص اعتمادات المالك ولا يلمس ملفاً
 *   node scripts/setup-env.mjs           ينشئ الملف، ويصلح المعطوب، ويحدّث المالك
 *
 * يقرأ OWNER_EMAIL وOWNER_PASSWORD من البيئة، وOWNER_GIVEN إن مُرّرا صراحةً.
 */
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV = path.join(API_DIR, ".env");
const EXAMPLE = path.join(API_DIR, ".env.example");

const email = process.env.OWNER_EMAIL ?? "";
const password = process.env.OWNER_PASSWORD ?? "";
const given = Boolean(process.env.OWNER_GIVEN);
const checkOnly = process.argv.includes("--check");

// نفس ما يشترطه الخادم في src/server.ts — لو اختلفا صار الإعداد يقول «تمّ»
// ثم يرفض الخادم الإقلاع، وهو أسوأ عطلٍ في السكربت: صحيحٌ ظاهراً وخاطئ فعلاً
const SECRET_MIN = 32;
const DEFAULT_DB = "postgresql://mawid:mawid@localhost:5432/mawid?schema=public";

function die(message) {
  console.error(`\x1b[1;31m${message}\x1b[0m`);
  process.exit(1);
}

/** يقرأ قيمة مفتاح من نصّ الملف بعد نزع علامات الاقتباس */
function valueOf(text, key) {
  const line = text.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  if (line === undefined) return null;
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
}

// ── فحص اعتمادات المالك ───────────────────────────────────────────
// لا يُطبَّق على تشغيلٍ مجرّد للإصلاح: من يصلح ملفاً موجوداً لا يمرّر اعتمادات
const wantsOwner = Boolean(email || password);
if (wantsOwner) {
  // نعدّ الأحرف لا البايتات: الخادم يعدّ الأحرف، فباسوورد عربي من خمسة أحرف
  // كان يمرّ من فحص الصدفة ثم يرفضه الخادم
  const length = [...password].length;
  if (length < 10) die(`OWNER_PASSWORD قصير: ${length} حرفاً، والمطلوب ١٠ على الأقل.`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) die(`OWNER_EMAIL لا يبدو إيميلاً: ${email}`);
}

if (checkOnly) process.exit(0);

// ── إنشاء الملف إن غاب ────────────────────────────────────────────
const created = !existsSync(ENV);
if (created) {
  if (!existsSync(EXAMPLE)) die("لم أجد api/.env.example");
  copyFileSync(EXAMPLE, ENV);
}

let text = readFileSync(ENV, "utf8");
const replacements = new Map();
const repaired = [];

// ── إصلاح ما لا يقلع الخادم بدونه ─────────────────────────────────
// سرّ التوقيع يُولَّد كلّما كان مفقوداً أو أقصر من الحدّ، لا عند الإنشاء وحده:
// ملفٌ خلّفه تشغيلٌ سابق منقطع يحمل JWT_SECRET="" من المثال، وكان يبقى فارغاً
// إلى الأبد فيقف الخادم عند كل تشغيل برسالة لا يربطها أحد بالإعداد.
// وتوليدُه هنا لا يُبطل جلسةً: سرٌّ بهذا القصر يعني أنّ الخادم لم يعمل قط.
const secret = valueOf(text, "JWT_SECRET");
if (secret === null || secret.length < SECRET_MIN) {
  replacements.set("JWT_SECRET", randomBytes(48).toString("base64"));
  if (!created) repaired.push("JWT_SECRET");
}

// ورابط القاعدة يُملأ إن غاب فقط. لا نبدّل قيمةً موجودة مهما بدت لنا خاطئة:
// من نصّب PostgreSQL على جهازه مباشرةً يستعمل المستخدم postgres لا mawid،
// فتبديلُه "إصلاحاً" يقطع اتصالاً كان يعمل — وهذا ما حدث فعلاً.
const db = valueOf(text, "DATABASE_URL");
if (!db) {
  replacements.set("DATABASE_URL", DEFAULT_DB);
  if (!created) repaired.push("DATABASE_URL");
}

// ── اعتمادات المالك ───────────────────────────────────────────────
// ملفٌ موجود لا تُمسّ اعتماداته إلا إن مُرّرت صراحةً
if (wantsOwner && (created || given)) {
  replacements.set("OWNER_EMAIL", email);
  replacements.set("OWNER_PASSWORD", password);
}

if (replacements.size === 0) {
  console.log("api/.env سليم — تُرك كما هو.");
  process.exit(0);
}

// ── الكتابة: تبديل السطر الموجود، وإلحاق المفقود ──────────────────
// نسخة احتياطية قبل الكتابة: تعديلٌ خاطئ على .env يوقف المشروع كلّه،
// وبلا نسخةٍ لا يبقى للمستخدم ما يرجع إليه
if (!created) copyFileSync(ENV, `${ENV}.bak`);

const seen = new Set();
const lines = text.split(/\r?\n/).map((line) => {
  for (const [key, value] of replacements) {
    if (line.startsWith(`${key}=`)) {
      seen.add(key);
      return `${key}="${value}"`;
    }
  }
  return line;
});
for (const [key, value] of replacements) {
  if (!seen.has(key)) lines.push(`${key}="${value}"`);
}
writeFileSync(ENV, lines.join("\n").replace(/\n*$/, "\n"), "utf8");

if (created) {
  console.log(`أُنشئ api/.env بسر توقيع عشوائي — حساب المالك: ${email}`);
} else {
  if (repaired.length) console.log(`أُصلح في api/.env: ${repaired.join("، ")}`);
  if (replacements.has("OWNER_EMAIL")) console.log(`حُدِّث حساب المالك في api/.env: ${email}`);
}
