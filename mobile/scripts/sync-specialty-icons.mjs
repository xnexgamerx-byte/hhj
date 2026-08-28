/**
 * ينسخ أشكال أيقونات التخصصات من الجوال إلى الويب.
 *
 *   node scripts/sync-specialty-icons.mjs
 *
 * المصدر الوحيد هو src/components/specialty-paths.ts. الحزمتان لا تتشاركان
 * node_modules فلا يمكن استيراده مباشرة، والنسخ اليدوي يعني أن الأيقونتين
 * تفترقان بصمت — فنولّد نسخة الويب ونفشل إن لم تعد مطابقة.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(HERE, "..", "src", "components", "specialty-paths.ts");
const TARGET = path.resolve(HERE, "..", "..", "web", "src", "lib", "specialty-paths.ts");

const source = await readFile(SOURCE, "utf8");
const marker = "export type Shape";
const body = source.slice(source.indexOf(marker));
if (!body.includes("SPECIALTY_SHAPES")) throw new Error("لم أجد بيانات الأشكال في المصدر");

const generated = `// ⚠︎ ملفّ مولَّد — لا تعدّله. حرّر mobile/src/components/specialty-paths.ts
// ثم شغّل: cd mobile && node scripts/sync-specialty-icons.mjs

${body}`;

const current = await readFile(TARGET, "utf8").catch(() => null);
if (current === generated) {
  console.log("نسخة الويب مطابقة — لا تغيير.");
} else {
  if (process.argv.includes("--check")) {
    console.error("نسخة الويب متأخّرة عن المصدر. شغّل السكربت بلا --check.");
    process.exit(1);
  }
  await writeFile(TARGET, generated);
  console.log(`✓ حدّثت ${path.relative(process.cwd(), TARGET)}`);
}
