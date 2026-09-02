/**
 * فحص شامل لكل حلقة في السلسلة، ينتهي بقول ما يجب فعله.
 *
 * لماذا: أعطال هذا المشروع يكاد يكون كلّها في الوصل لا في الشفرة — خادم
 * متوقف، نفق أُغلق، Metro غير مشغّل، عنوان مثبّت مات. وكلٌّ منها يظهر في
 * التطبيق برسالة واحدة تكاد تكون نفسها، فيُبحث عن العطل في غير موضعه.
 *
 * هذا يفحص الحلقات كلّها في أمر واحد ويقول أيّها انقطعت.
 *
 * التشغيل: npm run doctor
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.join(API_DIR, "..");
const PORT = Number(process.env.PORT ?? 3000);
const WEB_PORT = Number(process.env.WEB_PORT ?? 3001);
const METRO_PORT = 8081;

const OK = "\x1b[1;32m✔\x1b[0m";
const NO = "\x1b[1;31m✘\x1b[0m";
const MEH = "\x1b[1;33m•\x1b[0m";

const rows = [];
const fixes = [];
function row(name, mark, detail) {
  rows.push(`  ${mark}  ${name.padEnd(22)}${detail}`);
}

async function reach(url, ms = 4000) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), ms);
  try {
    const response = await fetch(url, { signal: abort.signal });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, status: 0, timedOut: error?.name === "AbortError" };
  } finally {
    clearTimeout(timer);
  }
}

function lanAddresses() {
  const out = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address)) out.push(entry.address);
    }
  }
  return out;
}

// ── قاعدة البيانات ────────────────────────────────────────────────
let dbUp = false;
{
  let prisma;
  try {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    await prisma.$queryRaw`select 1`;
    dbUp = true;
  } catch {
    row("قاعدة البيانات", NO, "لا اتصال");
    fixes.push("شغّل قاعدة البيانات:  docker compose up -d   (أو خدمة PostgreSQL عندك)");
  }

  // العدّ في محاولة منفصلة: خطأٌ فيه عيبٌ في هذا الفحص لا انقطاعٌ في القاعدة،
  // وخلطُهما يجعل الأداة تشخّص عطلاً غير موجود — وهو أسوأ من ألّا تفحص
  if (dbUp) {
    try {
      const [doctors, clinics, appointments] = await Promise.all([
        prisma.doctor.count(),
        prisma.clinic.count(),
        prisma.appointment.count(),
      ]);
      const empty = doctors === 0;
      row("قاعدة البيانات", empty ? MEH : OK, `${doctors} طبيب · ${clinics} عيادة · ${appointments} موعد`);
      if (empty) fixes.push("القاعدة بلا أطباء — بيانات العرض:  cd api && npm run db:demo");
    } catch (error) {
      row("قاعدة البيانات", MEH, `متصلة، وتعذّر العدّ: ${String(error?.message).split("\n")[0].slice(0, 60)}`);
    }
  }
  await prisma?.$disconnect().catch(() => {});
}

// ── الخادم ────────────────────────────────────────────────────────
const api = await reach(`http://127.0.0.1:${PORT}/health`);
row("الخادم", api.ok ? OK : NO, api.ok ? `يعمل على ${PORT}` : "متوقف");
if (!api.ok && dbUp) fixes.push(`شغّل الخادم واترك نافذته:  cd api && npm run dev`);

// ── عناوين الشبكة ─────────────────────────────────────────────────
const lan = lanAddresses();
row("عنوان الشبكة", lan.length ? OK : MEH, lan.length ? lan.join("، ") : "لا عنوان محلي — تحقق من الواي-فاي");

// ── العنوان المثبّت في التطبيق ────────────────────────────────────
const mobileEnv = path.join(ROOT, "mobile", ".env");
const pinned = existsSync(mobileEnv)
  ? /^EXPO_PUBLIC_API_URL=(.*)$/m.exec(readFileSync(mobileEnv, "utf8"))?.[1]?.trim()
  : null;

if (!pinned) {
  row("عنوان التطبيق", OK, "استنتاج تلقائي من Metro");
} else {
  const probe = await reach(`${pinned}/health`, 8000);
  row("عنوان التطبيق", probe.ok ? OK : NO, `${pinned}${probe.ok ? " · يجيب" : " · لا يجيب"}`);
  if (!probe.ok) {
    fixes.push(
      /trycloudflare|ngrok/.test(pinned)
        ? "العنوان المثبّت نفقٌ ميت. للتطوير على الشبكة نفسها:  cd mobile && npm run api:auto\n     أو افتح نفقاً جديداً:  cd api && npm run dev:public\n     ثم أعد تشغيل Metro في الحالتين."
        : `العنوان المثبّت لا يجيب. للاستنتاج التلقائي:  cd mobile && npm run api:auto`,
    );
  }
}

// ── اللوحات وMetro ────────────────────────────────────────────────
const web = await reach(`http://127.0.0.1:${WEB_PORT}/`);
row("لوحات الويب", web.ok ? OK : MEH, web.ok ? `تعمل على ${WEB_PORT}` : "متوقفة");
if (!web.ok) fixes.push(`لوحات المالك والعيادة:  cd web && npm run dev`);

const metro = await reach(`http://127.0.0.1:${METRO_PORT}/status`);
row("Metro", metro.ok ? OK : MEH, metro.ok ? `يعمل على ${METRO_PORT}` : "متوقف");
if (!metro.ok) fixes.push(`لنسخة التطوير على الهاتف:  cd mobile && npm start`);

// ── الحزم الأصيلة ─────────────────────────────────────────────────
const native = spawnSync("node", ["scripts/check-native-versions.mjs"], {
  cwd: path.join(ROOT, "mobile"),
  encoding: "utf8",
});
const nativeOk = native.status === 0;
row("الحزم الأصيلة", nativeOk ? OK : NO, nativeOk ? "توافق إصدار Expo" : "فيها ما لا يوافق");
if (!nativeOk) fixes.push("راجع التفصيل:  cd mobile && npm run check:native");

// ── الخرج ─────────────────────────────────────────────────────────
console.log(["", "  \x1b[1mموعد · فحص شامل\x1b[0m", "", ...rows, ""].join("\n"));

if (fixes.length === 0) {
  console.log("  \x1b[1;32mكل الحلقات موصولة.\x1b[0m\n");
  if (lan.length && api.ok) {
    console.log(`  للتأكد من الهاتف، افتح من متصفّحه:  http://${lan[0]}:${PORT}/health\n`);
  }
} else {
  console.log("  \x1b[1mما يجب فعله:\x1b[0m\n");
  for (const fix of fixes) console.log(`   ← ${fix}`);
  console.log("");
}
process.exit(fixes.length ? 1 : 0);
