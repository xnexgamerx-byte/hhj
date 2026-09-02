/**
 * ينسخ بيانات أيقونات التخصصات ورسماتها من الجوال إلى الويب.
 *
 *   node scripts/sync-specialty-icons.mjs           يكتب نسخة الويب
 *   node scripts/sync-specialty-icons.mjs --check   يفشل إن تأخّرت
 *
 * المصدر الوحيد هو مجلّد src/components في الجوال. الحزمتان لا تتشاركان
 * node_modules فلا يمكن استيراده مباشرة، والنسخ اليدوي يعني أن الأيقونتين
 * تفترقان بصمت — فنولّد نسخة الويب ونفشل إن لم تعد مطابقة.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(HERE, "..", "src", "components");
const WEB = path.resolve(HERE, "..", "..", "web", "src", "lib");

/** [ملف المصدر, ملف الهدف, أول سطرٍ يُنقل, رمزٌ لا بدّ من وجوده] */
const FILES = [
  ["specialty-paths.ts", "specialty-paths.ts", "export type Shape", "SPECIALTY_SHAPES"],
  ["specialty-art.ts", "specialty-art.ts", "export const SPECIALTY_ART", "SPECIALTY_ART"],
];

let stale = 0;
for (const [from, to, marker, symbol] of FILES) {
  const source = await readFile(path.join(MOBILE, from), "utf8");
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`لم أجد «${marker}» في ${from}`);
  const body = source.slice(start);
  if (!body.includes(symbol)) throw new Error(`لم أجد ${symbol} في ${from}`);

  const generated = `// ⚠︎ ملفّ مولَّد — لا تعدّله. حرّر mobile/src/components/${from}
// ثم شغّل: cd mobile && node scripts/sync-specialty-icons.mjs

${body}`;

  const target = path.join(WEB, to);
  const current = await readFile(target, "utf8").catch(() => null);
  if (current === generated) {
    console.log(`  ${to} مطابق`);
    continue;
  }
  if (process.argv.includes("--check")) {
    console.error(`✘ ${to} متأخّر عن المصدر. شغّل السكربت بلا --check.`);
    stale += 1;
    continue;
  }
  await writeFile(target, generated);
  console.log(`✓ حدّثت ${path.relative(process.cwd(), target)}`);
}
process.exit(stale ? 1 : 0);
