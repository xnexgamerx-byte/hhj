/**
 * محتوى الواجهة الذي يحرّره المالك: لافتات الرئيسية وإعداداتها.
 *
 * الغاية أن يبدّل المالك صور الواجهة وعددها ومدّة تبديلها بلا إصدارٍ جديد من
 * التطبيق — الإصدار يمرّ بمراجعة المتجر ويأخذ أياماً، واللافتة إعلانٌ موسميّ.
 */
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/prisma.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { removeImage } from "../../lib/uploads.js";

/** حدود مدّة التبديل: أقلّ من ثانيتين لا يُقرأ، وأكثر من دقيقة لا يُلاحَظ أنه يبدّل */
export const ROTATE_MIN = 2;
export const ROTATE_MAX = 60;
export const ROTATE_DEFAULT = 5;

const ROTATE_KEY = "banner_rotate_seconds";

export type BannerInput = {
  imageUrl?: string | null;
  title?: string | null;
  body?: string | null;
  linkKind?: string | null;
  linkValue?: string | null;
  isActive?: boolean;
};

const LINK_KINDS = ["specialty", "clinic", "doctor", "url"] as const;

function clean(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

/** لافتةٌ بلا صورة ولا عنوان مستطيلٌ فارغ — نرفضها عند الإنشاء لا عند العرض */
function validate(input: BannerInput, existing?: { imageUrl: string | null; title: string | null }) {
  const imageUrl = input.imageUrl !== undefined ? clean(input.imageUrl) : (existing?.imageUrl ?? null);
  const title = input.title !== undefined ? clean(input.title) : (existing?.title ?? null);
  if (!imageUrl && !title) throw badRequest("EMPTY_BANNER", "اللافتة تحتاج صورة أو عنواناً على الأقل");
  if (input.linkKind && !LINK_KINDS.includes(input.linkKind as (typeof LINK_KINDS)[number])) {
    throw badRequest("BAD_LINK_KIND", "وجهة غير معروفة للافتة");
  }
}

export async function listBanners(client: PrismaClient = defaultPrisma) {
  return client.banner.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
}

/**
 * ما يراه التطبيق: الفعّالة وحدها ومعها مدّة التبديل.
 *
 * المدّة تُرسل مع اللافتات لا في نداءٍ منفصل: الشاشة تحتاجهما معاً، ونداءان
 * على شبكة الجوال يعنيان أن اللافتة قد تبدأ بمدّةٍ ثم تقفز إلى أخرى.
 */
export async function getPublicBanners(client: PrismaClient = defaultPrisma) {
  const [banners, rotateSeconds] = await Promise.all([
    client.banner.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, imageUrl: true, title: true, body: true, linkKind: true, linkValue: true },
    }),
    getRotateSeconds(client),
  ]);
  return { banners, rotateSeconds };
}

export async function createBanner(input: BannerInput, client: PrismaClient = defaultPrisma) {
  validate(input);
  // في آخر الصفّ: المالك يضيف ثم يرتّب، لا العكس
  const last = await client.banner.aggregate({ _max: { sortOrder: true } });
  return client.banner.create({
    data: {
      imageUrl: clean(input.imageUrl),
      title: clean(input.title),
      body: clean(input.body),
      linkKind: clean(input.linkKind),
      linkValue: clean(input.linkValue),
      sortOrder: (last._max.sortOrder ?? 0) + 1,
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateBanner(id: string, input: BannerInput, client: PrismaClient = defaultPrisma) {
  const existing = await client.banner.findUnique({ where: { id } });
  if (!existing) throw notFound("BANNER_NOT_FOUND", "اللافتة غير موجودة");
  validate(input, existing);

  const nextImage = input.imageUrl !== undefined ? clean(input.imageUrl) : undefined;
  const updated = await client.banner.update({
    where: { id },
    data: {
      ...(nextImage !== undefined ? { imageUrl: nextImage } : {}),
      ...(input.title !== undefined ? { title: clean(input.title) } : {}),
      ...(input.body !== undefined ? { body: clean(input.body) } : {}),
      ...(input.linkKind !== undefined ? { linkKind: clean(input.linkKind) } : {}),
      ...(input.linkValue !== undefined ? { linkValue: clean(input.linkValue) } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  // الصورة القديمة تُحذف بعد نجاح التحديث لا قبله: لو فشل التحديث لبقيت
  // اللافتة تشير إلى ملفٍّ مسحناه
  if (nextImage !== undefined && existing.imageUrl && existing.imageUrl !== nextImage) {
    await removeImage(existing.imageUrl);
  }
  return updated;
}

export async function deleteBanner(id: string, client: PrismaClient = defaultPrisma) {
  const existing = await client.banner.findUnique({ where: { id } });
  if (!existing) throw notFound("BANNER_NOT_FOUND", "اللافتة غير موجودة");
  await client.banner.delete({ where: { id } });
  await removeImage(existing.imageUrl);
}

/** يعيد الترتيب كما رتّبه المالك — الترتيب المرسل هو الترتيب النهائي */
export async function reorderBanners(ids: string[], client: PrismaClient = defaultPrisma) {
  const existing = await client.banner.findMany({ select: { id: true } });
  const known = new Set(existing.map((b) => b.id));
  if (ids.length !== known.size || ids.some((id) => !known.has(id))) {
    throw badRequest("BAD_ORDER", "قائمة الترتيب لا تطابق اللافتات الموجودة");
  }
  await client.$transaction(
    ids.map((id, index) => client.banner.update({ where: { id }, data: { sortOrder: index + 1 } })),
  );
  return listBanners(client);
}

/* ── الإعدادات ───────────────────────────────────────────────── */

export async function getRotateSeconds(client: PrismaClient = defaultPrisma): Promise<number> {
  const row = await client.appSetting.findUnique({ where: { key: ROTATE_KEY } });
  const value = Number(row?.value);
  // قيمةٌ تالفة في القاعدة لا تُعطّل الشاشة الرئيسية — تعود إلى الافتراضي
  return Number.isFinite(value) && value >= ROTATE_MIN && value <= ROTATE_MAX ? value : ROTATE_DEFAULT;
}

export async function setRotateSeconds(seconds: number, client: PrismaClient = defaultPrisma): Promise<number> {
  if (!Number.isFinite(seconds) || seconds < ROTATE_MIN || seconds > ROTATE_MAX) {
    throw badRequest("BAD_ROTATE", `مدّة التبديل بين ${ROTATE_MIN} و${ROTATE_MAX} ثانية`);
  }
  const value = String(Math.round(seconds));
  await client.appSetting.upsert({ where: { key: ROTATE_KEY }, create: { key: ROTATE_KEY, value }, update: { value } });
  return Number(value);
}
