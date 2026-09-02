/**
 * صندوق إشعارات المريض داخل التطبيق.
 *
 * لماذا في جدول الرسائل نفسه لا في جدولٍ ثانٍ: الإشعار في التطبيق ورسالة
 * الواتساب حدثٌ واحد بلسانين — «تأكّد حجزك» يُقال في المكانين. وجدولٌ واحد
 * يعني أن القيد الفريد الذي يمنع تذكيراً مكرّراً يحرس القناتين معاً، وأن
 * سجلّ «ماذا أُرسل لهذا المريض ومتى» يبقى مكاناً واحداً عند أي نزاع.
 *
 * ولا يفشل الحجز لفشل إشعاره: كل نداء هنا يبتلع خطأه. موعدٌ ثُبّت بلا إشعار
 * أهون من موعدٍ ضاع لأن كتابة سطرٍ في الصندوق تعثّرت.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../lib/prisma.js";
import { forbidden, notFound } from "../lib/errors.js";

export type InboxInput = {
  userId: string;
  /** مفتاح منع التكرار — نفس مفاتيح القوالب: booking_confirmed · reminder_24h … */
  template: string;
  title: string;
  body: string;
  /** وجهة الضغط داخل التطبيق */
  linkTo?: string | null;
  appointmentId?: string | null;
};

/**
 * يضيف إشعاراً إلى صندوق مستخدم.
 *
 * التكرار ليس خطأً بل نتيجة متوقّعة: المجدوِل قد يمرّ على الموعد نفسه مرّتين.
 * القيد الفريد يرفض الثاني، ونحن نبتلع الرفض بصمت — هذا هو السلوك المطلوب.
 */
export async function notifyInApp(
  input: InboxInput,
  client: Prisma.TransactionClient | PrismaClient = defaultPrisma,
): Promise<boolean> {
  try {
    await client.notificationLog.create({
      data: {
        userId: input.userId,
        appointmentId: input.appointmentId ?? null,
        channel: "IN_APP",
        template: input.template,
        title: input.title,
        renderedBody: input.body,
        linkTo: input.linkTo ?? null,
        // لا طابور ولا مزوّد: الكتابة في القاعدة هي التسليم
        status: "SENT",
        sentAt: new Date(),
      },
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    return false;
  }
}

export type InboxItem = {
  id: string;
  title: string;
  body: string;
  linkTo: string | null;
  isRead: boolean;
  createdAt: string;
};

/** آخر ما وصل المريض، مع عدد ما لم يقرأه بعد. */
export async function listInbox(
  userId: string,
  limit = 50,
  client: PrismaClient = defaultPrisma,
): Promise<{ items: InboxItem[]; unread: number }> {
  const [rows, unread] = await Promise.all([
    client.notificationLog.findMany({
      where: { userId, channel: "IN_APP" },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 100),
      select: { id: true, title: true, renderedBody: true, linkTo: true, readAt: true, createdAt: true },
    }),
    countUnread(userId, client),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      title: row.title ?? "إشعار",
      body: row.renderedBody ?? "",
      linkTo: row.linkTo,
      isRead: row.readAt !== null,
      createdAt: row.createdAt.toISOString(),
    })),
    unread,
  };
}

/** يُقرأ في كل فتحة للشاشة الرئيسية، فله فهرسه الخاص */
export async function countUnread(userId: string, client: PrismaClient = defaultPrisma): Promise<number> {
  return client.notificationLog.count({ where: { userId, channel: "IN_APP", readAt: null } });
}

/** يؤشّر إشعاراً واحداً مقروءاً. القراءة لا تُتراجع، فإعادة التأشير لا تضرّ. */
export async function markRead(
  userId: string,
  id: string,
  client: PrismaClient = defaultPrisma,
): Promise<{ unread: number }> {
  const row = await client.notificationLog.findUnique({ where: { id }, select: { userId: true } });
  if (!row) throw notFound("NOTIFICATION_NOT_FOUND", "الإشعار غير موجود");
  if (row.userId !== userId) throw forbidden("NOT_YOUR_NOTIFICATION", "هذا الإشعار ليس لك");

  await client.notificationLog.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { unread: await countUnread(userId, client) };
}

/** «تأشير الكل مقروءاً» — الزرّ الذي يفرّغ النقطة الحمراء دفعة واحدة */
export async function markAllRead(userId: string, client: PrismaClient = defaultPrisma): Promise<{ unread: number }> {
  await client.notificationLog.updateMany({
    where: { userId, channel: "IN_APP", readAt: null },
    data: { readAt: new Date() },
  });
  return { unread: 0 };
}
