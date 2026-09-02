/**
 * يشغّل الخادم والنفق معاً في نافذة واحدة.
 *
 * لماذا: الاثنان لا معنى لأحدهما بلا الآخر — نفقٌ إلى منفذٍ ميت يعطي 502،
 * وخادمٌ بلا نفق لا يصله هاتف خارج الشبكة. وفصلُهما في نافذتين يجعل إغلاق
 * إحداهما سهواً يظهر كعطلٍ في الأخرى: النفق يسقط فتبدو الرسالة كأنّ الخادم
 * تعطّل، والعكس. جمعُهما يجعلهما يقومان ويسقطان معاً.
 *
 * التشغيل: npm run dev:public
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOBILE_ENV = path.join(API_DIR, "..", "mobile", ".env");
const PORT = Number(process.env.PORT ?? 3000);
const QUICK_TUNNEL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

const children = [];
let shuttingDown = false;

function stopAll(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill();
  process.exit(code);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stopAll(130));

/** يسبق كل سطر بوسمٍ ملوّن كي يُعرف مصدره في نافذة واحدة */
function prefixed(stream, tag, color) {
  let rest = "";
  stream?.on("data", (chunk) => {
    const lines = (rest + chunk.toString()).split("\n");
    rest = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) console.log(`\x1b[${color}m${tag}\x1b[0m │ ${line}`);
  });
}

function run(command, args, tag, color) {
  const child = spawn(command, args, { cwd: API_DIR, shell: process.platform === "win32" });
  children.push(child);
  prefixed(child.stdout, tag, color);
  prefixed(child.stderr, tag, color);
  return child;
}

async function healthy() {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 1500);
  try {
    return (await fetch(`http://127.0.0.1:${PORT}/health`, { signal: abort.signal })).ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function writeMobileEnv(url) {
  const line = `EXPO_PUBLIC_API_URL=${url}`;
  const current = existsSync(MOBILE_ENV) ? readFileSync(MOBILE_ENV, "utf8") : "";
  writeFileSync(
    MOBILE_ENV,
    /^EXPO_PUBLIC_API_URL=.*$/m.test(current)
      ? current.replace(/^EXPO_PUBLIC_API_URL=.*$/m, line)
      : `${current.replace(/\n*$/, current ? "\n" : "")}${line}\n`,
  );
}

// ── الخادم أولاً ──────────────────────────────────────────────────
const tsx = path.join(API_DIR, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
const server = run(existsSync(tsx) ? tsx : "npx", existsSync(tsx) ? ["watch", "src/server.ts"] : ["tsx", "watch", "src/server.ts"], "خادم", "36");
server.on("exit", (code) => {
  console.log("\x1b[36mخادم\x1b[0m │ توقّف — أُغلق النفق معه.");
  stopAll(code ?? 1);
});

// النفق لا يُفتح قبل أن يجيب الخادم: نفقٌ إلى منفذٍ ميت يعطي 502 ويُوهم بعطلٍ
// في مكان آخر
process.stdout.write("  بانتظار الخادم");
let up = false;
for (let i = 0; i < 60 && !up; i++) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  up = await healthy();
  if (!up) process.stdout.write(".");
}
console.log(up ? " ✓" : " ✘");
if (!up) {
  console.error("  الخادم لم يجب خلال دقيقة — راجع سطوره أعلاه.");
  stopAll(1);
}

// ── ثم النفق ──────────────────────────────────────────────────────
const tunnel = run("cloudflared", ["tunnel", "--url", `http://localhost:${PORT}`], "نفق ", "35");

tunnel.on("error", (error) => {
  if (error.code === "ENOENT") {
    console.log(
      [
        "",
        "  \x1b[1;33mcloudflared غير مثبّت — الخادم يعمل محلياً فقط.\x1b[0m",
        "     للوصول من أي شبكة، ثبّته مرة واحدة ثم أعد الأمر:",
        "       winget install --id Cloudflare.cloudflared",
        "",
      ].join("\n"),
    );
  } else {
    console.error(`تعذّر تشغيل cloudflared: ${error.message}`);
  }
});

let announced = false;
function watchForUrl(stream) {
  stream?.on("data", (chunk) => {
    if (announced) return;
    const url = QUICK_TUNNEL.exec(chunk.toString())?.[0];
    if (!url) return;
    announced = true;
    writeMobileEnv(url);
    console.log(
      [
        "",
        "  \x1b[1;32m✔ الخادم والنفق يعملان\x1b[0m",
        `     ${url}`,
        "",
        "  كُتب في mobile/.env. شغّل Metro في نافذة أخرى:",
        "       cd mobile && npm start",
        "",
        "  \x1b[2mاترك هذه النافذة مفتوحة: إغلاقها يوقف الاثنين معاً.\x1b[0m",
        "",
      ].join("\n"),
    );
  });
}
watchForUrl(tunnel.stdout);
watchForUrl(tunnel.stderr);
