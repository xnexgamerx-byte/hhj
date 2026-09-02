/**
 * تخزين الصور التي يرفعها المالك.
 *
 * على القرص لا في قاعدة البيانات: صورةُ لافتةٍ بنصف ميغابايت في عمود يجعل كل
 * استعلامٍ يمرّ بها أثقل، والقاعدة ليست خادم ملفّات.
 *
 * تحذير للنشر لاحقاً: القرص في أغلب المنصّات السحابية مؤقّت — يُمسح مع كل
 * إعادة تشغيل. حين نستضيف فعلاً ينتقل هذا إلى تخزينٍ كائنيّ (S3 أو R2)،
 * وواجهةُ الدالتين هنا هي ما يتبدّل خلفه لا نداءاتها في المسارات.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { badRequest } from "./errors.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.resolve(HERE, "..", "..", "uploads");
export const UPLOAD_ROUTE = "/uploads";

/** ٤ ميغابايت: صورة لافتةٍ بعرض ١٢٠٠ بكسل تبقى دونها بكثير */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * الأنواع المقبولة وبصماتها الأولى.
 *
 * نحكم بالبايتات لا بالامتداد ولا بترويسة العميل: كلاهما يكتبه من يرفع،
 * وملفٌّ اسمه ‎.png وفيه سكربت يبقى سكربتاً. البصمة لا تُزوَّر بسهولة.
 */
const SIGNATURES: { ext: string; mime: string; test: (b: Buffer) => boolean }[] = [
  { ext: "png", mime: "image/png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "jpg", mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "webp", mime: "image/webp", test: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
];

export type StoredFile = { url: string; fileName: string; bytes: number; mime: string };

/** يحفظ صورةً بعد التحقّق من نوعها الحقيقي، ويعيد رابطها العام. */
export async function storeImage(buffer: Buffer): Promise<StoredFile> {
  if (buffer.length === 0) throw badRequest("EMPTY_FILE", "الملف فارغ");
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw badRequest("FILE_TOO_LARGE", "الصورة أكبر من ٤ ميغابايت. اضغطها أو اختر أصغر");
  }

  const kind = SIGNATURES.find((s) => s.test(buffer));
  if (!kind) throw badRequest("BAD_IMAGE", "الملف ليس صورة PNG أو JPG أو WEBP");

  // الاسم من محتوى الملف: رفعُ الصورة نفسها مرّتين لا يملأ القرص بنسختين،
  // ولا يمكن لمن يرفع أن يختار مساراً (‎../‎) فيكتب خارج المجلّد
  const digest = createHash("sha256").update(buffer).digest("hex").slice(0, 32);
  const fileName = `${digest}.${kind.ext}`;

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, fileName), buffer);

  return { url: `${UPLOAD_ROUTE}/${fileName}`, fileName, bytes: buffer.length, mime: kind.mime };
}

/**
 * يحذف صورةً مرفوعة إن كانت من مجلّدنا.
 *
 * لا يفشل إن غابت: الحذف يُنادى عند حذف لافتةٍ أو تبديل صورة، ونجاحه ليس
 * شرطاً لنجاح العملية — ملفٌّ يتيمٌ على القرص أهون من لافتةٍ تأبى الحذف.
 */
export async function removeImage(url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith(`${UPLOAD_ROUTE}/`)) return;
  const fileName = path.basename(url);
  // اسم الملف من صنعنا دائماً (بصمةٌ وامتداد)، وأيّ شكلٍ آخر يعني رابطاً خارجياً
  if (!/^[0-9a-f]{32}\.(png|jpg|webp)$/.test(fileName)) return;
  await unlink(path.join(UPLOAD_DIR, fileName)).catch(() => {});
}
