/**
 * يفتح للخادم المحلي عنواناً عاماً على الإنترنت عبر نفق Cloudflare.
 *
 * لماذا: التطبيق على هاتفٍ في شبكة أخرى لا يصل إلى 192.168.x — ذلك العنوان
 * لا معنى له خارج شبكة البيت. النفق يعطي رابط https عاماً يصل من أي شبكة،
 * بلا حساب ولا بطاقة.
 *
 * حدوده الصريحة: يبقى ما دام حاسوبك يعمل، ويتبدّل رابطه في كل تشغيل. فهو
 * للتجربة والعرض، والدوام يحتاج استضافة.
 *
 * التشغيل: npm run tunnel
 *          npm run tunnel -- --write   ← يكتب الرابط في mobile/.env أيضاً
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOBILE_ENV = path.join(API_DIR, "..", "mobile", ".env");
const PORT = Number(process.env.PORT ?? 3000);
const WRITE = process.argv.includes("--write");

const QUICK_TUNNEL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

function installHelp() {
  console.error(
    [
      "",
      "  لم أجد cloudflared. ثبّته مرة واحدة ثم أعد الأمر:",
      "",
      "    winget install --id Cloudflare.cloudflared",
      "",
      "  أو نزّل cloudflared-windows-amd64.exe من صفحة إصدارات Cloudflare",
      "  وضعه في مجلد ضمن PATH.",
      "",
    ].join("\n"),
  );
}

/** يضع أو يحدّث سطر EXPO_PUBLIC_API_URL في mobile/.env */
function writeMobileEnv(url) {
  const line = `EXPO_PUBLIC_API_URL=${url}`;
  const current = existsSync(MOBILE_ENV) ? readFileSync(MOBILE_ENV, "utf8") : "";
  const next = /^EXPO_PUBLIC_API_URL=.*$/m.test(current)
    ? current.replace(/^EXPO_PUBLIC_API_URL=.*$/m, line)
    : `${current.replace(/\n*$/, current ? "\n" : "")}${line}\n`;
  writeFileSync(MOBILE_ENV, next);
}

async function apiIsUp() {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 2500);
  try {
    return (await fetch(`http://127.0.0.1:${PORT}/health`, { signal: abort.signal })).ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

if (!(await apiIsUp())) {
  console.log(
    [
      "",
      "  \x1b[1;33m⚠  الخادم متوقف\x1b[0m",
      `     النفق سيُفتح على المنفذ ${PORT} ولا شيء يستمع عليه.`,
      "     شغّله في نافذة أخرى:  cd api && npm run dev",
      "",
    ].join("\n"),
  );
}

const child = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${PORT}`], {
  shell: process.platform === "win32",
});

child.on("error", (error) => {
  if (error.code === "ENOENT") installHelp();
  else console.error(`تعذّر تشغيل cloudflared: ${error.message}`);
  process.exit(1);
});

let announced = false;
function watch(chunk) {
  const text = chunk.toString();
  if (!announced) {
    const url = QUICK_TUNNEL.exec(text)?.[0];
    if (url) {
      announced = true;
      if (WRITE) writeMobileEnv(url);
      console.log(
        [
          "",
          "  \x1b[1;32m✔ الخادم صار له عنوان عام\x1b[0m",
          `     ${url}`,
          "",
          WRITE
            ? "  كُتب في mobile/.env. أعد تشغيل Metro ليصل التعديل:"
            : "  ضعه في mobile/.env ثم أعد تشغيل Metro:",
          WRITE ? "       cd mobile && npm start" : `       EXPO_PUBLIC_API_URL=${url}`,
          "",
          "  ولنسخة تعمل وحدها على أي شبكة بلا حاسوبك: ضع العنوان نفسه في",
          "  mobile/eas.json داخل preview ثم:  cd mobile && npm run build:apk",
          "",
          "  \x1b[2mالرابط يتبدّل في كل تشغيل، ويبقى ما دام هذا الأمر يعمل.",
          "  ولأنّ الطلبات تصل عبر وسيط، ضع TRUST_PROXY=true في api/.env",
          "  ليُقرأ عنوان الزائر الحقيقي في حدود المعدّل.\x1b[0m",
          "",
        ].join("\n"),
      );
    }
  }
}

child.stdout?.on("data", watch);
child.stderr?.on("data", watch);
child.on("exit", (code) => process.exit(code ?? 0));
