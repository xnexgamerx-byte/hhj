/**
 * يبني اللوحات ملفّاتٍ ثابتة لـCloudflare Pages.
 *
 *   NEXT_PUBLIC_API_URL=https://api.example.com npm run build:static
 *
 * الناتج في ‎out/‎ ومعه ‎_headers‎ من ‎cloudflare/‎. وعنوان الخادم يُكتب داخل
 * الملفّات وقت البناء لا وقت التشغيل، فبناءٌ بلا عنوانٍ حقيقي موقعٌ يفتح ولا
 * يجد خادمه. لذلك يُرفض على Cloudflare (حيث ‎CF_PAGES‎ معيَّن) إن غاب العنوان
 * أو كان محلّياً أو بلا https — الموقع هناك https، والمتصفّح يحجب نداءه لخادمٍ
 * بـhttp. وعلى جهاز المطوّر يُنبَّه فقط، فالتجربة المحلّية مقصودة.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.NEXT_PUBLIC_API_URL?.trim() ?? "";
const local = /^https?:\/\/(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.)/i.test(url);

const problem = !url
  ? "NEXT_PUBLIC_API_URL غير معيَّن"
  : local
    ? `NEXT_PUBLIC_API_URL محلّي: ${url}`
    : !url.startsWith("https://")
      ? `NEXT_PUBLIC_API_URL بلا https: ${url}`
      : null;

if (problem) {
  if (process.env.CF_PAGES) {
    console.error(
      `\x1b[1;31m${problem}\nعيّنه في إعدادات مشروع Cloudflare Pages بعنوان الخادم، مثل https://api.example.com\x1b[0m`,
    );
    process.exit(1);
  }
  console.warn(`\x1b[33m${problem} — يصلح للتجربة على هذا الجهاز وحده\x1b[0m`);
}

// shell: true كي يجد next من node_modules/.bin على ويندوز أيضاً، كما في next-port.mjs
const result = spawnSync("next", ["build"], {
  cwd: WEB,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, STATIC_EXPORT: "1", NEXT_TELEMETRY_DISABLED: "1" },
});
if (result.status !== 0) process.exit(result.status ?? 1);

copyFileSync(path.join(WEB, "cloudflare", "_headers"), path.join(WEB, "out", "_headers"));
console.log(`\nالموقع جاهز في out/ — يكلّم الخادم على ${url || "http://localhost:3000"}`);
