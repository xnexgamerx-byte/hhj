/**
 * ملخص لوحة المالك — الأرقام التي يحتاج رؤيتها بنظرة واحدة.
 */
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/prisma.js";
import { WEEKDAY_NAMES_AR, WEEKDAY_SHORT_AR } from "../../lib/timezone.js";

/**
 * يكمل الأيام التي لا حجوزات فيها بصفر.
 * بدونها يرسم المنحنى عموداً واحداً يملأ العرض عند وجود يوم واحد فقط،
 * ويختفي معنى «المقارنة عبر الزمن» الذي وُجد المنحنى من أجله.
 */
function fillMissingDays(rows: { day: Date; count: bigint }[], days: number) {
  const counts = new Map(rows.map((row) => [row.day.toISOString().slice(0, 10), Number(row.count)]));
  const series: { date: string; weekdayName: string; shortName: string; count: number }[] = [];

  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(Date.now() - offset * 86_400_000);
    const iso = date.toISOString().slice(0, 10);
    series.push({
      date: iso,
      weekdayName: WEEKDAY_NAMES_AR[date.getUTCDay()],
      shortName: WEEKDAY_SHORT_AR[date.getUTCDay()],
      count: counts.get(iso) ?? 0,
    });
  }
  return series;
}

export async function getOwnerSummary(client: PrismaClient = defaultPrisma) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 86_400_000);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);

  const [
    doctorCount,
    activeDoctorCount,
    pendingPasswordCount,
    clinicCount,
    patientAccountCount,
    todayBookings,
    weekBookings,
    monthBookings,
    noShowCount,
    completedCount,
    whatsappStats,
    doctorsWithoutWhatsApp,
    doctorsWithoutSchedule,
    byGovernorate,
    recentBookings,
  ] = await Promise.all([
    client.doctor.count(),
    client.doctor.count({ where: { isActive: true, isPublished: true } }),
    client.user.count({ where: { role: "DOCTOR", mustChangePassword: true } }),
    client.clinic.count({ where: { isActive: true } }),
    client.user.count({ where: { role: "PATIENT" } }),
    client.appointment.count({ where: { createdAt: { gte: todayStart, lt: todayEnd } } }),
    client.appointment.count({ where: { createdAt: { gte: weekAgo } } }),
    client.appointment.count({ where: { createdAt: { gte: monthAgo } } }),
    client.appointment.count({ where: { status: "NO_SHOW", sessionStart: { gte: monthAgo } } }),
    client.appointment.count({ where: { status: "COMPLETED", sessionStart: { gte: monthAgo } } }),
    client.notificationLog.groupBy({
      by: ["status"],
      where: { channel: "WHATSAPP" },
      _count: { _all: true },
    }),
    client.doctor.count({
      where: { isActive: true, OR: [{ whatsappNumber: null }, { whatsappEnabled: false }] },
    }),
    client.doctor.count({
      where: { isActive: true, practices: { none: { schedules: { some: { isActive: true } } } } },
    }),
    client.clinic.groupBy({
      by: ["governorateId"],
      where: { isActive: true },
      _count: { _all: true },
      orderBy: { _count: { governorateId: "desc" } },
      take: 6,
    }),
    client.appointment.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        patient: { select: { fullName: true } },
        doctorClinic: {
          include: {
            clinic: { select: { nameAr: true } },
            doctor: { include: { user: { select: { fullName: true } } } },
          },
        },
      },
    }),
  ]);

  const governorateIds = byGovernorate.map((g) => g.governorateId);
  const governorates = await client.governorate.findMany({
    where: { id: { in: governorateIds } },
    select: { id: true, nameAr: true },
  });
  const governorateName = new Map(governorates.map((g) => [g.id, g.nameAr]));

  const whatsapp = { QUEUED: 0, SENT: 0, FAILED: 0 } as Record<string, number>;
  for (const row of whatsappStats) whatsapp[row.status] = row._count._all;

  const finished = noShowCount + completedCount;

  // حجوزات آخر ١٤ يوماً لرسم منحنى بسيط
  const dailySeries = await client.$queryRaw<{ day: Date; count: bigint }[]>`
    SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
    FROM appointments
    WHERE "createdAt" >= ${new Date(now.getTime() - 14 * 86_400_000)}
    GROUP BY 1 ORDER BY 1 ASC
  `;

  return {
    doctors: {
      total: doctorCount,
      active: activeDoctorCount,
      awaitingFirstLogin: pendingPasswordCount,
      withoutWhatsApp: doctorsWithoutWhatsApp,
      withoutSchedule: doctorsWithoutSchedule,
    },
    clinics: clinicCount,
    patients: patientAccountCount,
    bookings: { today: todayBookings, week: weekBookings, month: monthBookings },
    attendance: {
      completed: completedCount,
      noShow: noShowCount,
      noShowRate: finished > 0 ? Math.round((noShowCount / finished) * 100) : 0,
    },
    whatsapp,
    topGovernorates: byGovernorate.map((g) => ({
      name: governorateName.get(g.governorateId) ?? "—",
      clinics: g._count._all,
    })),
    dailyBookings: fillMissingDays(dailySeries, 14),
    recentBookings: recentBookings.map((b) => ({
      id: b.id,
      reference: b.reference,
      status: b.status,
      patientName: b.patient.fullName,
      doctorName: `${b.doctorClinic.doctor.title} ${b.doctorClinic.doctor.user.fullName}`,
      clinicName: b.doctorClinic.clinic.nameAr,
      sessionStart: b.sessionStart.toISOString(),
      createdAt: b.createdAt.toISOString(),
    })),
  };
}
