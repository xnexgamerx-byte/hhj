/**
 * يشغّل Next على منفذ قابل للتغيير.
 *
 *   WEB_PORT=3011 npm run dev
 *
 * بديل عن كتابة ‎-p 3001‎ في package.json: توسيع ‎${WEB_PORT}‎ هناك يعمل في
 * الصدفة ولا يعمل في cmd على ويندوز، فيبقى المنفذ ثابتاً ويصطدم بمشروع آخر.
 */
import { spawnSync } from "node:child_process";

const port = process.env.WEB_PORT ?? process.env.PORT ?? "3001";
const mode = process.argv[2] === "start" ? "start" : "dev";

// shell: true كي يجد next من node_modules/.bin على ويندوز أيضاً.
// وتُطفأ قياسات Next: منصّة مواعيد طبية لا ترسل شيئاً عن استعمالها إلى طرف
// ثالث، ولو كان مجهّلاً — والقرار يخصّ من ينشرها لا من يبنيها.
const result = spawnSync("next", [mode, "-p", port], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});
process.exit(result.status ?? 1);
