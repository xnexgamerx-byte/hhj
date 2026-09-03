/**
 * حالة إعداد واتساب، والقوالب الجاهزة للتقديم.
 *
 *   npm run whatsapp
 *
 * لماذا أداة: الطريق الرسمي الوحيد لإرسال واتساب تلقائياً هو Cloud API من
 * ميتا، وتشغيله سلسلةُ خطواتٍ خارج الكود — حساب أعمال، رقمٌ مخصّص، قوالب
 * تُراجَع. وحين لا تصل رسالة، السؤال دائماً «أين انقطعت السلسلة؟» وهذه تجيب.
 *
 * وتطبع نصوص القوالب مولّدةً من الكود نفسه، فما يُلصق في مدير القوالب هو
 * حرفياً ما سيُرسَل — لا نسخةٌ تفترق عنه بعد أول تعديل.
 */
import { templateSpecs } from "../src/notifications/whatsapp/templates.js";

const GRAPH = "https://graph.facebook.com/v21.0";
const B = (t: string) => `\x1b[1m${t}\x1b[0m`;
const OK = "\x1b[1;32m✔\x1b[0m";
const NO = "\x1b[1;31m✘\x1b[0m";
const MEH = "\x1b[1;33m•\x1b[0m";

const token = process.env.WHATSAPP_TOKEN;
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

async function graph<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(`${GRAPH}/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    if (!response.ok) return { ok: false, error: `${response.status} — ${text.slice(0, 300)}` };
    return { ok: true, data: JSON.parse(text) as T };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

async function main() {
  console.log(`\n  ${B("واتساب الطبيب")}\n`);

  // ── ١. أوراق الاعتماد ──
  console.log(`  ${B("١· المتغيّرات")}`);
  console.log(`    ${token ? OK : NO} WHATSAPP_TOKEN${token ? ` (${token.length} حرفاً)` : " — غير موجود"}`);
  console.log(`    ${phoneNumberId ? OK : NO} WHATSAPP_PHONE_NUMBER_ID${phoneNumberId ? ` (${phoneNumberId})` : " — غير موجود"}`);
  console.log(`    ${wabaId ? OK : MEH} WHATSAPP_BUSINESS_ACCOUNT_ID${wabaId ? ` (${wabaId})` : " — اختياري، وبدونه لا نفحص القوالب"}`);

  if (!token || !phoneNumberId) {
    console.log(`\n    ${MEH} بلا هذين المتغيّرين يعمل التطبيق بالمزوّد الاحتياطي:`);
    console.log("      لا تُرسَل رسالة تلقائياً، لكن كل رسالةٍ تُحفظ ومعها رابط wa.me");
    console.log("      يفتح محادثة الطبيب بالنصّ جاهزاً — يُرسلها المالك بلمسة من لوحته.");
  }

  // ── ٢. الرقم ──
  if (token && phoneNumberId) {
    console.log(`\n  ${B("٢· الرقم")}`);
    const number = await graph<{ display_phone_number?: string; verified_name?: string; quality_rating?: string }>(
      `${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
    );
    if (!number.ok) {
      console.log(`    ${NO} تعذّر قراءة الرقم — ${number.error}`);
      console.log("      غالباً: رمزٌ منتهٍ، أو معرّف رقمٍ من حسابٍ آخر.");
    } else {
      console.log(`    ${OK} ${number.data.display_phone_number ?? "?"} — ${number.data.verified_name ?? "?"}`);
      if (number.data.quality_rating) console.log(`      تقييم الجودة: ${number.data.quality_rating}`);
    }
  }

  // ── ٣. القوالب ──
  const specs = templateSpecs();
  console.log(`\n  ${B("٣· القوالب")}`);

  if (token && wabaId) {
    const list = await graph<{ data?: { name: string; language: string; status: string; components?: { type: string; text?: string }[] }[] }>(
      `${wabaId}/message_templates?limit=100`,
    );
    if (!list.ok) {
      console.log(`    ${NO} تعذّرت قراءة القوالب — ${list.error}`);
    } else {
      const found = list.data.data ?? [];
      for (const spec of specs) {
        const match = found.find((t) => t.name === spec.name && t.language === spec.language);
        if (!match) {
          console.log(`    ${NO} ${spec.name} (${spec.language}) — غير مقدَّم`);
          continue;
        }
        const body = match.components?.find((c) => c.type === "BODY")?.text ?? "";
        const count = new Set(body.match(/\{\{\d+\}\}/g) ?? []).size;
        const approved = match.status === "APPROVED";
        const fits = count === spec.placeholders;
        console.log(`    ${approved && fits ? OK : NO} ${spec.name} — ${match.status}، ${count} وسيطة`);
        if (!fits) {
          console.log(
            `      ${NO} الكود يرسل ${spec.placeholders} وسيطة والقالب يتوقّع ${count}: ترفضه ميتا بخطأ ٤xx فلا تصل الرسالة.`,
          );
          console.log("        عدّل القالب في مدير القوالب ليطابق النصّ أدناه.");
        }
      }
    }
  } else {
    console.log(`    ${MEH} لم نفحص الاعتماد (يلزم WHATSAPP_BUSINESS_ACCOUNT_ID)`);
  }

  // ── ٤. ما يُلصق في مدير القوالب ──
  console.log(`\n  ${B("٤· النصوص — الصقها كما هي في مدير القوالب")}`);
  console.log("    business.facebook.com ← WhatsApp Manager ← Message Templates ← Create\n");
  for (const spec of specs) {
    console.log(`  ${B(`── ${spec.name} ──`)}`);
    console.log(`  الاسم: ${spec.name}   ·   اللغة: العربية (${spec.language})   ·   الفئة: Utility`);
    console.log("  النصّ:");
    console.log(
      spec.body
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n"),
    );
    console.log(`  أمثلة الوسائط: ${spec.example.map((v, i) => `{{${i + 1}}}=${v}`).join("  ·  ")}\n`);
  }

  console.log(`  ${B("ملاحظتان")}`);
  console.log("    • الفئة Utility لا Marketing: الأولى للمعاملات وتكلفتها أقلّ، والثانية");
  console.log("      تحتاج موافقةً أصعب وقد تُرفض لرسالةٍ تشغيلية كهذه.");
  console.log("    • الرقم الذي يُربط بالـAPI لا يعود صالحاً لتطبيق واتساب العادي.");
  console.log("      اختر رقماً مخصّصاً للمنصّة لا رقم أحدٍ يستعمله يومياً.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
