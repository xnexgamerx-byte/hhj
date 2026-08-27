/**
 * التقييمات.
 *
 * الشرط الحاكم: **لا يقيّم إلا من حضر فعلاً.** بلا هذا الشرط تصبح التقييمات
 * بلا قيمة خلال أسابيع — منافس يكتب تقييماً سيئاً، وطبيب يكتب لنفسه عشرة جيدة.
 * لذلك التقييم مربوط بحجز مكتمل، والقيد الفريد عليه يمنع تقييمين لنفس الزيارة.
 */
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/prisma.js";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.js";

/** كم يوماً بعد الزيارة يبقى التقييم مسموحاً — بعدها تبهت الذاكرة. */
const REVIEW_WINDOW_DAYS = 30;

export async function createReview(
  accountId: string,
  appointmentId: string,
  input: { rating: number; comment?: string | null },
  client: PrismaClient = defaultPrisma,
) {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw badRequest("INVALID_RATING", "التقييم من ١ إلى ٥");
  }

  const appointment = await client.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: { select: { accountId: true } },
      doctorClinic: { select: { doctorId: true } },
      review: { select: { id: true } },
    },
  });
  if (!appointment) throw notFound("APPOINTMENT_NOT_FOUND", "الحجز غير موجود");
  if (appointment.patient.accountId !== accountId) {
    throw forbidden("NOT_YOUR_APPOINTMENT", "لا يمكنك تقييم زيارة لا تخصك");
  }
  if (appointment.status !== "COMPLETED") {
    throw forbidden("NOT_COMPLETED", "يمكنك التقييم بعد أن تؤشّر العيادة انتهاء كشفك");
  }
  if (appointment.review) throw conflict("ALREADY_REVIEWED", "قيّمتَ هذه الزيارة سابقاً");

  const completedAt = appointment.completedAt ?? appointment.sessionStart;
  if (Date.now() - completedAt.getTime() > REVIEW_WINDOW_DAYS * 86_400_000) {
    throw forbidden("REVIEW_WINDOW_CLOSED", "انتهت مهلة تقييم هذه الزيارة");
  }

  const comment = input.comment?.trim() || null;

  return client.$transaction(async (tx) => {
    const review = await tx.review.create({
      data: {
        appointmentId,
        doctorId: appointment.doctorClinic.doctorId,
        rating: input.rating,
        comment,
        // الدرجة تُحتسب فوراً، والتعليق ينتظر مراجعة المالك
        isPublished: comment === null,
      },
      select: { id: true, rating: true, comment: true, isPublished: true, createdAt: true },
    });

    await refreshDoctorRating(appointment.doctorClinic.doctorId, tx);
    return review;
  });
}

/** يعيد حساب متوسط الطبيب وعدد تقييماته. يُستدعى داخل معاملة التقييم. */
async function refreshDoctorRating(doctorId: string, tx: PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) {
  const aggregate = await tx.review.aggregate({
    where: { doctorId },
    _avg: { rating: true },
    _count: { _all: true },
  });

  await tx.doctor.update({
    where: { id: doctorId },
    data: {
      ratingAvg: Math.round((aggregate._avg.rating ?? 0) * 10) / 10,
      ratingCount: aggregate._count._all,
    },
  });
}

/** التقييمات المنشورة لطبيب — ما يراه المريض في ملفه. */
export async function listDoctorReviews(doctorId: string, client: PrismaClient = defaultPrisma) {
  const reviews = await client.review.findMany({
    where: { doctorId, isPublished: true, comment: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { appointment: { include: { patient: { select: { fullName: true } } } } },
  });

  return reviews.map((review) => ({
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt.toISOString(),
    // الاسم الأول فقط — التقييم ليس مكاناً لنشر أسماء المرضى كاملة
    patientName: review.appointment.patient.fullName.split(" ")[0],
  }));
}

/** الزيارات التي يستطيع المريض تقييمها الآن. */
export async function listReviewableVisits(accountId: string, client: PrismaClient = defaultPrisma) {
  const since = new Date(Date.now() - REVIEW_WINDOW_DAYS * 86_400_000);

  const appointments = await client.appointment.findMany({
    where: {
      patient: { accountId },
      status: "COMPLETED",
      review: null,
      sessionStart: { gte: since },
    },
    orderBy: { sessionStart: "desc" },
    include: {
      doctorClinic: { include: { doctor: { include: { user: { select: { fullName: true } } } } } },
    },
  });

  return appointments.map((appointment) => ({
    appointmentId: appointment.id,
    reference: appointment.reference,
    doctorName: `${appointment.doctorClinic.doctor.title} ${appointment.doctorClinic.doctor.user.fullName}`,
    visitedAt: appointment.sessionStart.toISOString(),
  }));
}

/** مراجعة المالك للتعليقات قبل نشرها. */
export async function setReviewPublished(
  reviewId: string,
  isPublished: boolean,
  client: PrismaClient = defaultPrisma,
) {
  const review = await client.review.findUnique({ where: { id: reviewId }, select: { id: true } });
  if (!review) throw notFound("REVIEW_NOT_FOUND", "التقييم غير موجود");
  return client.review.update({ where: { id: reviewId }, data: { isPublished }, select: { id: true, isPublished: true } });
}

/** التعليقات المنتظرة مراجعة المالك. */
export async function listPendingReviews(client: PrismaClient = defaultPrisma) {
  const reviews = await client.review.findMany({
    where: { isPublished: false, comment: { not: null } },
    orderBy: { createdAt: "asc" },
    take: 50,
    include: {
      doctor: { include: { user: { select: { fullName: true } } } },
      appointment: { include: { patient: { select: { fullName: true } } } },
    },
  });

  return reviews.map((review) => ({
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt.toISOString(),
    doctorName: `${review.doctor.title} ${review.doctor.user.fullName}`,
    patientName: review.appointment.patient.fullName,
  }));
}
