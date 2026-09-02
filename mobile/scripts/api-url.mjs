/**
 * يضبط أو يمسح EXPO_PUBLIC_API_URL في mobile/.env.
 *
 * لماذا يلزم مسحُه: رابط النفق يُحقن في الحزمة وقت بنائها، فإن أُعيد تشغيل
 * النفق تبدّل الرابط وبقي في التطبيق رابطٌ ميت لا يُحلّ اسمه أصلاً — ويظهر
 * ذلك كرفض اتصال يُتّهم به الخادم وهو يعمل.
 *
 * وفي دورة التطوير اليومية لا حاجة إليه: نسخة التطوير تأخذ شفرتها من Metro
 * على الحاسوب، فالهاتف على الشبكة نفسها، والعنوان المحلي يُستنتج وحده.
 *
 *   npm run api:auto            يمسح السطر — يعود الاستنتاج التلقائي
 *   npm run api:set -- <عنوان>  يثبّت عنواناً بعينه
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENV = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), ".env");
const KEY = "EXPO_PUBLIC_API_URL";
const url = process.argv.slice(2).find((a) => !a.startsWith("-"));

const current = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
const had = new RegExp(`^${KEY}=(.*)$`, "m").exec(current)?.[1]?.trim();

if (url) {
  const line = `${KEY}=${url}`;
  writeFileSync(
    ENV,
    new RegExp(`^${KEY}=.*$`, "m").test(current)
      ? current.replace(new RegExp(`^${KEY}=.*$`, "m"), line)
      : `${current.replace(/\n*$/, current ? "\n" : "")}${line}\n`,
  );
  console.log(`\n  ثُبّت العنوان: ${url}\n  أعد تشغيل Metro ليصل التعديل.\n`);
} else {
  if (!had) {
    console.log("\n  لا عنوان مثبّت — الاستنتاج التلقائي يعمل أصلاً.\n");
    process.exit(0);
  }
  const next = current.replace(new RegExp(`^${KEY}=.*\\n?`, "m"), "");
  writeFileSync(ENV, next);
  console.log(
    [
      "",
      `  مُسح العنوان المثبّت (كان: ${had})`,
      "  سيستنتج التطبيق عنوان حاسوبك من خادم Metro.",
      "",
      "  أعد تشغيل Metro ليصل التعديل:  npm start",
      "",
    ].join("\n"),
  );
}
