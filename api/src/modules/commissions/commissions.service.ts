/**
 * العمولات.
 *
 * نموذج الربح: المنصة تأخذ عمولة من العيادة عن كل مريض **يحضر فعلاً**.
 * لا دفع من المريض إطلاقاً — يدفع أجرته للعيادة كما اعتاد.
 *
 * الربط بالحضور لا بالحجز مقصود: العيادة ترفض الدفع عن مريض لم يأتِ، وربط
 * العمولة بالحضور يجعل مصلحة المنصة ومصلحة العيادة واحدة — كلاهما يريد
 * مريضاً يصل، لا حجزاً على الورق.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/prisma.js";
import { badRequest, notFound } from "../../lib/errors.js";

/**
 * يسجّل عمولة الزيارة عند تأشير الحضور.
 *
 * يُستدعى عند كل تغيير حالة، ويعتمد على القيد الفريد على appointmentId
 * لا على فحصٍ مسبق: تأشير الحضور ثم «تم الكشف» نداءان متتاليان، وأي فحص
 * في الكود يمرّ منه الثاني فتُسجَّل عمولتان على زيارة واحدة.
 */
export async function accrueCommission(
  appointmentId: string,
  client: PrismaClient | Prisma.TransactionClient = defaultPrisma,
): Promise<{ created: boolean; amount: number }> {
  const appointment = await client.appointment.findUnique({
    where: { id: appointmentId },
    include: { doctorClinic: { select: { commissionAmount: true, doctorId: true, clinicId: true } } },
  });
  if (!appointment) return { created: false, amount: 0 };

  const amount = appointment.doctorClinic.commissionAmount;
  if (amount <= 0) return { created: false, amount: 0 };

  try {
    await client.commission.create({
      data: {
        appointmentId,
        doctorClinicId: appointment.doctorClinicId,
        clinicId: appointment.doctorClinic.clinicId,
        doctorId: appointment.doctorClinic.doctorId,
        amount,
        earnedAt: appointment.arrivedAt ?? appointment.completedAt ?? new Date(),
      },
    });
    return { created: true, amount };
  } catch (error) {
    // القيد الفريد رفض الصف: عمولة هذه الزيارة مسجَّلة سابقاً
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { created: false, amount };
    }
    throw error;
  }
}

/**
 * يُلغي عمولة زيارة تبيّن أن المريض لم يحضرها.
 * يحدث حين يؤشّر السكرتير الحضور خطأً ثم يصحّحه إلى «لم يحضر».
 */
export async function reverseCommission(
  appointmentId: string,
  client: PrismaClient | Prisma.TransactionClient = defaultPrisma,
): Promise<boolean> {
  const commission = await client.commission.findUnique({
    where: { appointmentId },
    select: { id: true, status: true },
  });
  // ما حُصِّل لا يُحذف — يبقى في السجل لأن المالك قبض مقابله فعلاً
  if (!commission || commission.status !== "DUE") return false;

  await client.commission.delete({ where: { id: commission.id } });
  return true;
}

/** ملخص المستحق على كل عيادة — ما يفتحه المالك أول الشهر. */
export async function getDuesByClinic(client: PrismaClient = defaultPrisma) {
  const grouped = await client.commission.groupBy({
    by: ["clinicId"],
    where: { status: "DUE" },
    _sum: { amount: true },
    _count: { _all: true },
    _min: { earnedAt: true },
    _max: { earnedAt: true },
  });
  if (grouped.length === 0) return [];

  const clinics = await client.clinic.findMany({
    where: { id: { in: grouped.map((g) => g.clinicId) } },
    select: {
      id: true,
      nameAr: true,
      phone: true,
      governorate: { select: { nameAr: true } },
    },
  });
  const byId = new Map(clinics.map((c) => [c.id, c]));

  return grouped
    .map((row) => ({
      clinicId: row.clinicId,
      clinicName: byId.get(row.clinicId)?.nameAr ?? "—",
      governorate: byId.get(row.clinicId)?.governorate.nameAr ?? "—",
      phone: byId.get(row.clinicId)?.phone ?? null,
      visits: row._count._all,
      amount: row._sum.amount ?? 0,
      firstVisitAt: row._min.earnedAt?.toISOString() ?? null,
      lastVisitAt: row._max.earnedAt?.toISOString() ?? null,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/** تفصيل الزيارات المستحقة على عيادة — ما يعرضه المالك عند المطالبة. */
export async function getClinicDues(clinicId: string, client: PrismaClient = defaultPrisma) {
  const rows = await client.commission.findMany({
    where: { clinicId, status: "DUE" },
    orderBy: { earnedAt: "asc" },
    include: {
      doctor: { include: { user: { select: { fullName: true } } } },
      appointment: { include: { patient: { select: { fullName: true } } } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    earnedAt: row.earnedAt.toISOString(),
    reference: row.appointment.reference,
    patientName: row.appointment.patient.fullName,
    doctorName: `${row.doctor.title} ${row.doctor.user.fullName}`,
  }));
}

/**
 * تسجيل تحصيل: المالك قبض من العيادة، فتُغلق عمولاتها المستحقة دفعة واحدة.
 * تُنفَّذ بمعاملة: إما تُغلق كلها أو لا شيء، وإلا بقيت زيارات مطالَباً بها
 * وقد دُفع مقابلها.
 */
export async function settleClinic(
  ownerId: string,
  clinicId: string,
  note: string | null,
  client: PrismaClient = defaultPrisma,
) {
  const clinic = await client.clinic.findUnique({ where: { id: clinicId }, select: { id: true } });
  if (!clinic) throw notFound("CLINIC_NOT_FOUND", "العيادة غير موجودة");

  const due = await client.commission.findMany({
    where: { clinicId, status: "DUE" },
    select: { id: true, amount: true },
  });
  if (due.length === 0) throw badRequest("NOTHING_DUE", "لا توجد عمولات مستحقة على هذه العيادة");

  const amount = due.reduce((sum, row) => sum + row.amount, 0);

  return client.$transaction(async (tx) => {
    const settlement = await tx.settlement.create({
      data: { clinicId, amount, count: due.length, note, collectedByUserId: ownerId },
    });

    await tx.commission.updateMany({
      where: { id: { in: due.map((row) => row.id) } },
      data: { status: "SETTLED", settlementId: settlement.id },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: ownerId,
        action: "COMMISSIONS_SETTLED",
        entity: "Settlement",
        entityId: settlement.id,
        after: { clinicId, amount, count: due.length },
      },
    });

    return { settlementId: settlement.id, amount, count: due.length };
  });
}

/** إسقاط عمولة واحدة — لزيارة اختُلف عليها. */
export async function waiveCommission(
  ownerId: string,
  commissionId: string,
  reason: string,
  client: PrismaClient = defaultPrisma,
) {
  const commission = await client.commission.findUnique({
    where: { id: commissionId },
    select: { id: true, status: true },
  });
  if (!commission) throw notFound("COMMISSION_NOT_FOUND", "العمولة غير موجودة");
  if (commission.status !== "DUE") throw badRequest("NOT_DUE", "لا يمكن إسقاط عمولة محصَّلة");

  await client.$transaction(async (tx) => {
    await tx.commission.update({
      where: { id: commissionId },
      data: { status: "WAIVED", waivedReason: reason.trim() || null },
    });
    await tx.auditLog.create({
      data: { actorUserId: ownerId, action: "COMMISSION_WAIVED", entity: "Commission", entityId: commissionId, after: { reason } },
    });
  });
}

/** سجل التحصيلات — «ماذا قبضتُ ومتى ومن أي عيادة». */
export async function listSettlements(client: PrismaClient = defaultPrisma) {
  const rows = await client.settlement.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      clinic: { select: { nameAr: true, governorate: { select: { nameAr: true } } } },
      collectedBy: { select: { fullName: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    clinicName: row.clinic.nameAr,
    governorate: row.clinic.governorate.nameAr,
    amount: row.amount,
    count: row.count,
    note: row.note,
    collectedBy: row.collectedBy.fullName,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** أرقام العمولات للوحة المالك. */
export async function getCommissionSummary(client: PrismaClient = defaultPrisma) {
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);

  const [due, settledThisMonth, clinicsWithoutRate] = await Promise.all([
    client.commission.aggregate({ where: { status: "DUE" }, _sum: { amount: true }, _count: { _all: true } }),
    client.settlement.aggregate({ where: { createdAt: { gte: monthAgo } }, _sum: { amount: true } }),
    client.doctorClinic.count({ where: { isActive: true, commissionAmount: 0 } }),
  ]);

  return {
    dueAmount: due._sum.amount ?? 0,
    dueVisits: due._count._all,
    collectedThisMonth: settledThisMonth._sum.amount ?? 0,
    practicesWithoutRate: clinicsWithoutRate,
  };
}
