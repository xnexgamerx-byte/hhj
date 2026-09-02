/**
 * يبني APK يحمل شفرته داخله، فيعمل على أي شبكة بلا حاسوبك.
 *
 * الفرق عن build:dev: تلك نسخة تطوير تأخذ شفرتها من Metro، فهي مربوطة
 * بشبكة الحاسوب بطبيعتها. وهذه تحمل الشفرة داخلها، فلا يبقى إلا الخادم —
 * ولذلك يلزمها عنوان عامّ مخزون فيها وقت البناء.
 *
 * ما يفعله: يقرأ EXPO_PUBLIC_API_URL من mobile/.env، ويتحقق أنّه يجيب فعلاً،
 * ويضعه في حالة preview، ويبني، ثم يعيد eas.json كما كان.
 *
 * التشغيل: npm run build:apk
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = path.join(ROOT, ".env");
const EAS_FILE = path.join(ROOT, "eas.json");

function die(lines) {
  console.error(["", ...lines.map((l) => `  ${l}`), ""].join("\n"));
  process.exit(1);
}

// ── العنوان ───────────────────────────────────────────────────────
const env = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
const url = /^EXPO_PUBLIC_API_URL=(.*)$/m.exec(env)?.[1]?.trim().replace(/^["']|["']$/g, "");

if (!url) {
  die([
    "\x1b[1;31mلا يوجد EXPO_PUBLIC_API_URL في mobile/.env\x1b[0m",
    "",
    "نسخةٌ تحمل شفرتها داخلها لا تجد الخادم بنفسها — لا خادم تطوير تسأله —",
    "فيلزمها عنوان مخزون فيها. افتح نفقاً في نافذة أخرى:",
    "",
    "    cd api && npm run tunnel -- --write",
    "",
    "ثم أعد هذا الأمر.",
  ]);
}

// عنوانٌ محليّ في نسخةٍ تُوزَّع لا معنى له: كل هاتف سيقصد نفسه
if (/^https?:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url)) {
  die([
    `\x1b[1;31mالعنوان محليّ: ${url}\x1b[0m`,
    "",
    "هذا يعمل ما دام الهاتف في شبكتك، وهو نقيض الغرض من هذه النسخة.",
    "افتح نفقاً ليصير للخادم عنوان عام:",
    "",
    "    cd api && npm run tunnel -- --write",
  ]);
}

// ── هل يجيب فعلاً؟ ────────────────────────────────────────────────
// الفحص قبل البناء لا بعده: بناءٌ ينتهي بعد ربع ساعة إلى تطبيقٍ لا يجد خادمه
// هو أسوأ ما يمكن أن يُنتظر
process.stdout.write(`  أتحقق من ${url} … `);
const abort = new AbortController();
const timer = setTimeout(() => abort.abort(), 8000);
let reachable = false;
try {
  reachable = (await fetch(`${url}/health`, { signal: abort.signal })).ok;
} catch {
  reachable = false;
} finally {
  clearTimeout(timer);
}
console.log(reachable ? "\x1b[1;32mيجيب\x1b[0m" : "\x1b[1;31mلا يجيب\x1b[0m");

if (!reachable) {
  die([
    "العنوان لا يجيب، فلا فائدة من بناء نسخة تقصده.",
    "",
    "تأكد أنّ الخادم يعمل والنفق مفتوح، كلٌّ في نافذته:",
    "    cd api && npm run dev",
    "    cd api && npm run tunnel -- --write",
  ]);
}

// ── الحقن ثم البناء ثم الإعادة ────────────────────────────────────
// نعيد eas.json كما كان: تركُ عنوانٍ مؤقّت فيه يجعل كل git pull لاحق يتعارض،
// ويجعل الملفّ يكذب على من يقرؤه غداً
const original = readFileSync(EAS_FILE, "utf8");
let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  writeFileSync(EAS_FILE, original);
}
process.on("exit", restore);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));

const config = JSON.parse(original);
config.build.preview.env = { ...config.build.preview.env, EXPO_PUBLIC_API_URL: url };
writeFileSync(EAS_FILE, `${JSON.stringify(config, null, 2)}\n`);

console.log(
  [
    "",
    `  العنوان المخزون في النسخة:  ${url}`,
    url.includes("trycloudflare.com")
      ? "  \x1b[2m(نفق مؤقّت: تبقى النسخة صالحة ما دام هذا النفق مفتوحاً)\x1b[0m"
      : "",
    "",
  ]
    .filter((l) => l !== "")
    .join("\n"),
);

const local = path.join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "eas.cmd" : "eas");
const bin = existsSync(local) ? local : "npx";
const args = existsSync(local)
  ? ["build", "--profile", "preview", "--platform", "android", ...process.argv.slice(2)]
  : ["eas-cli@latest", "build", "--profile", "preview", "--platform", "android", ...process.argv.slice(2)];

const child = spawn(bin, args, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
child.on("error", (error) => {
  restore();
  console.error(`تعذّر تشغيل eas: ${error.message}`);
  process.exit(1);
});
child.on("exit", (code) => {
  restore();
  process.exit(code ?? 0);
});
