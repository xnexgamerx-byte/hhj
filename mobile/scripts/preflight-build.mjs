/**
 * فحص ما قبل البناء السحابي.
 *
 * البناء على EAS يستغرق نحو ربع ساعة، ويفشل على أخطاء يكشفها التوليد المحلي
 * في ثوانٍ: إضافة إعداد لا تُقلع، مفتاح في app.json لم يعد له معنى، وحدة
 * أصيلة لا تُربط. هذا يشغّل نفس التوليد ثم ينظّف أثره.
 *
 * التشغيل: npm run check:build
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PKG = path.join(ROOT, "package.json");
const ANDROID = path.join(ROOT, "android");

// prebuild يعدّل package.json وينشئ android/ — نحفظ الأصل لنعيده مهما حدث
const original = readFileSync(PKG, "utf8");
const hadAndroid = existsSync(ANDROID);

function restore() {
  writeFileSync(PKG, original);
  if (!hadAndroid) rmSync(ANDROID, { recursive: true, force: true });
}

// spawnSync لا execFileSync: الأخير يعيد مجرى الخرج وحده عند النجاح، وprebuild
// يكتب تنبيهاته في مجرى الخطأ — فكان الفحص يمرّ على كل تنبيه صامتاً
const run = spawnSync("npx", ["expo", "prebuild", "--platform", "android", "--no-install"], {
  cwd: ROOT,
  encoding: "utf8",
  shell: process.platform === "win32",
});
const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
const failed = run.status !== 0;
restore();

// إضافات الإعداد تنبّه بـ» ولا تُفشل التوليد، وتنبيهها اليوم عطلٌ غداً
const warnings = output
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.startsWith("»"));

if (failed) {
  console.error("✘ فشل توليد مشروع أندرويد:\n");
  console.error(output.trimEnd());
  process.exit(1);
}
if (warnings.length) {
  console.error("✘ توليد مشروع أندرويد نجح بتنبيهات:\n");
  for (const w of warnings) console.error(`  ${w}`);
  console.error("\nعالجها قبل البناء السحابي — التنبيه هنا أرخص من فشلٍ بعد ربع ساعة.");
  process.exit(1);
}

console.log("✔ مشروع أندرويد يُولَّد بلا تنبيهات");
