/**
 * يجهّز api/.env — يُستدعى من setup.sh.
 *
 * بالـNode لا ببايثون: المشروع نودچس أصلاً، وبايثون غير مضمون على ويندوز
 * (Git Bash يعطي «Python was not found» ويسقط السكربت كلّه).
 *
 *   node scripts/setup-env.mjs --check   يفحص الاعتمادات ولا يلمس ملفاً
 *   node scripts/setup-env.mjs           ينشئ الملف أو يحدّث سطرَي المالك
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

function die(message) {
  console.error(`\x1b[1;31m${message}\x1b[0m`);
  process.exit(1);
}

// نعدّ الأحرف لا البايتات: الخادم يعدّ الأحرف، فباسوورد عربي من خمسة أحرف
// كان يمرّ من فحص الصدفة ثم يرفضه الخادم
const length = [...password].length;
if (length < 10) die(`OWNER_PASSWORD قصير: ${length} حرفاً، والمطلوب ١٠ على الأقل.`);
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) die(`OWNER_EMAIL لا يبدو إيميلاً: ${email}`);

if (process.argv.includes("--check")) process.exit(0);

const created = !existsSync(ENV);
if (created) {
  if (!existsSync(EXAMPLE)) die("لم أجد api/.env.example");
  copyFileSync(EXAMPLE, ENV);
}

// الملف الموجود لا يُمسّ إلا إن مُرّرت اعتمادات المالك صراحةً، وحتى حينها
// نغيّر سطرَيها وحدهما: تبديل JWT_SECRET يُبطل الجلسات القائمة
if (!created && !given) {
  console.log("api/.env موجود — تُرك كما هو.");
  process.exit(0);
}

const replacements = new Map([
  ["OWNER_EMAIL", email],
  ["OWNER_PASSWORD", password],
]);
if (created) {
  replacements.set("JWT_SECRET", randomBytes(48).toString("base64"));
  replacements.set("DATABASE_URL", "postgresql://mawid:mawid@localhost:5432/mawid?schema=public");
}

const lines = readFileSync(ENV, "utf8").split(/\r?\n/);
const out = lines.map((line) => {
  for (const [key, value] of replacements) {
    if (line.startsWith(`${key}=`)) return `${key}="${value}"`;
  }
  return line;
});
writeFileSync(ENV, out.join("\n").replace(/\n*$/, "\n"), "utf8");

console.log(
  created
    ? `أُنشئ api/.env بسر توقيع عشوائي — حساب المالك: ${email}`
    : `حُدِّث حساب المالك في api/.env: ${email}`,
);
