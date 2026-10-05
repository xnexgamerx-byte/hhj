/**
 * ينقل الصور المرفوعة من خادمٍ قديم إلى قرص هذا الخادم — يُستعمل عند الانتقال
 * من Render إلى Railway: الحاوية تشغّله عند كل إقلاعٍ ما دام ‎UPLOADS_SOURCE‎
 * معيَّناً (‎scripts/container-start.sh‎). ويدوياً:
 *
 *   npm run uploads:pull -- https://doctorsehti-api.onrender.com
 *
 * لا يحتاج دخولاً إلى قرص Render: الصور تُخدم علناً من ‎/uploads/…‎ وأسماؤها في
 * القاعدة المنقولة، فيُسأل كل رابطٍ مذكورٍ فيها ويُحفظ بالاسم نفسه.
 *
 * واسم كل صورةٍ بصمةُ محتواها (‎lib/uploads.ts‎)، فيُتحقّق من كل ملفٍّ بعد
 * نزوله: ما وصل مبتوراً أو غيرَ ما طُلب يُرفض ولا يُحفظ. وتكراره آمن: ما نزل
 * سليماً قبلاً لا يُنزَّل ثانية.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma.js";
import { UPLOAD_DIR, UPLOAD_ROUTE } from "../src/lib/uploads.js";

const source = process.argv[2]?.replace(/\/+$/, "");
if (!source || !/^https?:\/\//.test(source)) {
  console.error("اكتب عنوان الخادم القديم: npm run uploads:pull -- https://doctorsehti-api.onrender.com");
  process.exit(1);
}

/**
 * اسمُ ملفٍّ وحده بلا مسار ولا ‎..‎ — القيم تصل من القاعدة، وأعمدة الصور فيها
 * تقبل أي نصّ يرسله المالك، فلا يُكتب بها خارج مجلّد الصور
 */
const SAFE_NAME = new RegExp(`^${UPLOAD_ROUTE}/([A-Za-z0-9_-]+\\.(?:png|jpg|webp))$`);
/** صيغة البصمة: أول ٣٢ خانة من sha256 المحتوى */
const FINGERPRINT = /^([0-9a-f]{32})\./;

function intact(name: string, bytes: Buffer): boolean {
  const expected = FINGERPRINT.exec(name)?.[1];
  // اسمٌ ليس على صيغة البصمة يُقبل كما هو: لا شيء يُقارن به
  return !expected || createHash("sha256").update(bytes).digest("hex").slice(0, 32) === expected;
}

/** كل صورةٍ مرفوعة تذكرها القاعدة — الروابط الخارجية (‎https://…‎) ليست على قرصنا فلا تُنقل */
async function referencedUploads(): Promise<string[]> {
  const [doctors, clinics, banners] = await Promise.all([
    prisma.doctor.findMany({ select: { photoUrl: true, licenseDocUrl: true } }),
    prisma.clinic.findMany({ select: { photoUrl: true } }),
    prisma.banner.findMany({ select: { imageUrl: true } }),
  ]);
  const values = [
    ...doctors.flatMap((doctor) => [doctor.photoUrl, doctor.licenseDocUrl]),
    ...clinics.map((clinic) => clinic.photoUrl),
    ...banners.map((banner) => banner.imageUrl),
  ];
  return [...new Set(values.filter((value): value is string => Boolean(value?.startsWith(`${UPLOAD_ROUTE}/`))))];
}

async function main() {
  const uploads = await referencedUploads();
  await mkdir(UPLOAD_DIR, { recursive: true });

  let pulled = 0;
  let present = 0;
  const failed: string[] = [];

  for (const url of uploads) {
    const name = SAFE_NAME.exec(url)?.[1];
    if (!name) {
      failed.push(`${url} — اسمٌ غير مقبول`);
      continue;
    }
    const target = path.join(UPLOAD_DIR, name);

    const existing = await readFile(target).catch(() => null);
    if (existing && intact(name, existing)) {
      present++;
      continue;
    }

    try {
      const response = await fetch(`${source}${url}`, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`الخادم القديم ردّ ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!intact(name, bytes)) throw new Error("المحتوى لا يطابق بصمة الاسم");
      await writeFile(target, bytes);
      pulled++;
    } catch (error) {
      failed.push(`${url} — ${(error as Error).message}`);
    }
  }

  console.log(`الصور المذكورة في القاعدة: ${uploads.length}`);
  console.log(`  نزلت الآن: ${pulled}`);
  console.log(`  موجودة سليمةً قبلاً: ${present}`);
  if (failed.length > 0) {
    console.log(`  تعذّرت: ${failed.length}`);
    for (const line of failed) console.log(`    ${line}`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
