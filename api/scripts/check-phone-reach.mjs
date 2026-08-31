/**
 * يفحص ما يمكن فحصه من طرف الحاسوب، ويطبع الرابط الذي يُجرَّب من الهاتف.
 *
 * ما لا يفحصه ولا يمكنه: جدار الحماية. ويندوز لا يحجب حركة الجهاز إلى نفسه،
 * فالفحص من الحاسوب ينجح وإن كان المنفذ محجوباً عن كل جهاز آخر. الهاتف وحده
 * يحكم في ذلك — ولهذا يُطبع الرابط في آخر السطور.
 *
 * التشغيل: npm run check:phone
 */
import { networkInterfaces } from "node:os";

const PORT = Number(process.env.PORT ?? 3000);
const TIMEOUT_MS = 4000;

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

async function probe(host) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`http://${host}:${PORT}/health`, { signal: abort.signal });
    return response.ok ? "يجيب" : `يجيب بالرمز ${response.status}`;
  } catch (error) {
    return error?.name === "AbortError" ? "معلّق" : "لا اتصال";
  } finally {
    clearTimeout(timer);
  }
}

const lines = [];
const loopback = await probe("127.0.0.1");
lines.push(`  127.0.0.1:${PORT}`.padEnd(28) + loopback);

const lan = lanAddresses();
// نفحص كل عنوان مرّة واحدة ونحتفظ بالنتيجة: الفحص المكرّر يضاعف الانتظار
const results = new Map();
for (const ip of lan) {
  results.set(ip, await probe(ip));
  lines.push(`  ${ip}:${PORT}`.padEnd(28) + results.get(ip));
}

console.log(["", "  فحص وصول الخادم", ...lines, ""].join("\n"));

if (loopback !== "يجيب") {
  console.log(["  ← الخادم لا يعمل. شغّله في نافذة أخرى:", "      cd api && npm run dev", ""].join("\n"));
  process.exit(1);
}
if (lan.length === 0) {
  console.log(["  ← لا عنوان على شبكة محلية. تأكد أنّ الحاسوب موصول بالواي-فاي.", ""].join("\n"));
  process.exit(1);
}
const unreachable = lan.filter((ip) => results.get(ip) !== "يجيب");
if (unreachable.length) {
  console.log([`  ← الخادم لا يستمع على ${unreachable.join("، ")} — راجع إعداده.`, ""].join("\n"));
  process.exit(1);
}

console.log(
  [
    "  الخادم سليم على كل عناوين الحاسوب.",
    "",
    "  يبقى جدار الحماية، ولا يُفحص من هنا: ويندوز لا يحجب حركة الجهاز إلى",
    "  نفسه، فهذا الفحص ينجح وإن كان المنفذ محجوباً عن كل جهاز آخر.",
    "",
    "  افتح هذا من متصفّح الهاتف — الهاتف وحده يحكم:",
    ...lan.map((ip) => `      http://${ip}:${PORT}/health`),
    "",
    "  ظهرت صفحة  ⇒ المنفذ مفتوح والعطل في مكان آخر.",
    "  علّق أو رفض ⇒ جدار الحماية. افتح PowerShell كمسؤول ونفّذ:",
    `      New-NetFirewallRule -DisplayName "Mawid API" -Direction Inbound -LocalPort ${PORT} -Protocol TCP -Action Allow`,
    "",
  ].join("\n"),
);
