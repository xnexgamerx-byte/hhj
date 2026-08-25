/**
 * التحقق من أن قاعدة البيانات نفسها تمنع الحجز المزدوج.
 *
 * التشغيل: npx tsx scripts/verify-booking-lock.ts
 *
 * لا يكفي التحقق في الكود: بين قراءة «هذا الوقت فارغ» وكتابة الحجز توجد فجوة،
 * وضغطتان متزامنتان تمرّان من خلالها. القيد الفريد في قاعدة البيانات هو
 * ما يجعل ذلك مستحيلاً. هذا السكربت يثبت أنه يعمل — بما في ذلك تحت التزامن.
 */
import { PrismaClient, Prisma, BookingMode, AppointmentStatus } from "@prisma/client";

const prisma = new PrismaClient();
const results: { name: string; passed: boolean; detail: string }[] = [];

function check(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  console.log(`${passed ? "✔" : "✘"} ${name}\n   ${detail}`);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const ref = () => `T-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

async function buildFixtures() {
  const district = await prisma.district.findFirstOrThrow({
    where: { slug: "karkh", governorate: { slug: "baghdad" } },
    include: { governorate: true },
  });

  const doctorUser = await prisma.user.create({
    data: { phone: `+9647${Date.now().toString().slice(-9)}`, fullName: "طبيب اختبار", role: "DOCTOR" },
  });
  const doctor = await prisma.doctor.create({
    data: { userId: doctorUser.id, isPublished: true, isActive: true },
  });
  const clinic = await prisma.clinic.create({
    data: {
      nameAr: "عيادة اختبار",
      governorateId: district.governorateId,
      districtId: district.id,
      landmark: "مقابل مستشفى اختباري",
    },
  });

  const slotPractice = await prisma.doctorClinic.create({
    data: { doctorId: doctor.id, clinicId: clinic.id, feeAmount: 25000, bookingMode: "SLOT", slotMinutes: 20 },
  });

  const queueClinic = await prisma.clinic.create({
    data: { nameAr: "عيادة اختبار ٢", governorateId: district.governorateId, districtId: district.id },
  });
  const queuePractice = await prisma.doctorClinic.create({
    data: { doctorId: doctor.id, clinicId: queueClinic.id, feeAmount: 20000, bookingMode: "QUEUE", capacityPerSession: 20 },
  });

  const account = await prisma.user.create({
    data: { phone: `+9648${Date.now().toString().slice(-9)}`, fullName: "حساب اختبار", role: "PATIENT" },
  });
  const patients = await Promise.all(
    ["مريض أ", "مريض ب", "مريض ج"].map((fullName) =>
      prisma.patient.create({ data: { accountId: account.id, fullName } }),
    ),
  );

  return { slotPractice, queuePractice, account, patients };
}

type Fixtures = Awaited<ReturnType<typeof buildFixtures>>;

function bookingData(
  practiceId: string,
  patientId: string,
  accountId: string,
  mode: BookingMode,
  sessionStart: Date,
  slotStart: Date,
  queueNumber: number,
) {
  const sessionEnd = new Date(sessionStart.getTime() + 3 * 60 * 60 * 1000);
  return {
    reference: ref(),
    doctorClinicId: practiceId,
    patientId,
    bookedByUserId: accountId,
    bookingMode: mode,
    sessionStart,
    sessionEnd,
    slotStart,
    queueNumber,
    status: AppointmentStatus.CONFIRMED,
    lockKey: true,
  };
}

async function main() {
  const fx: Fixtures = await buildFixtures();
  const { slotPractice, queuePractice, account, patients } = fx;

  const session = new Date("2026-09-01T13:00:00.000Z"); // ٤ عصراً بتوقيت بغداد
  const slot = new Date("2026-09-01T13:20:00.000Z");

  // ── ١. نمط الوقت المحدد: مريضان على نفس الفترة ──────────────────
  await prisma.appointment.create({
    data: bookingData(slotPractice.id, patients[0].id, account.id, "SLOT", session, slot, 0),
  });
  let blocked = false;
  try {
    await prisma.appointment.create({
      data: bookingData(slotPractice.id, patients[1].id, account.id, "SLOT", session, slot, 0),
    });
  } catch (error) {
    blocked = isUniqueViolation(error);
  }
  check("نمط الوقت المحدد يرفض حجز نفس الفترة مرتين", blocked, blocked
    ? "الحجز الثاني رُفض من قاعدة البيانات (P2002)"
    : "الحجز الثاني نجح — القيد لا يعمل");

  // ── ٢. الإلغاء يحرّر الفترة ─────────────────────────────────────
  const first = await prisma.appointment.findFirstOrThrow({
    where: { doctorClinicId: slotPractice.id, slotStart: slot, lockKey: true },
  });
  await prisma.appointment.update({
    where: { id: first.id },
    data: { status: "CANCELLED_BY_PATIENT", lockKey: null, cancelledAt: new Date() },
  });
  let rebooked = false;
  try {
    await prisma.appointment.create({
      data: bookingData(slotPractice.id, patients[1].id, account.id, "SLOT", session, slot, 0),
    });
    rebooked = true;
  } catch {
    rebooked = false;
  }
  const cancelledStillThere = await prisma.appointment.count({
    where: { doctorClinicId: slotPractice.id, slotStart: slot, lockKey: null },
  });
  check("الإلغاء يحرّر الفترة ويُبقي سجل الملغى", rebooked && cancelledStillThere === 1, rebooked
    ? `أُعيد حجز الفترة، وبقي ${cancelledStillThere} حجز ملغى في السجل`
    : "الفترة بقيت محجوزة رغم الإلغاء");

  // ── ٣. نمط رقم الدور ────────────────────────────────────────────
  await prisma.appointment.create({
    data: bookingData(queuePractice.id, patients[0].id, account.id, "QUEUE", session, session, 1),
  });
  let queueBlocked = false;
  try {
    await prisma.appointment.create({
      data: bookingData(queuePractice.id, patients[1].id, account.id, "QUEUE", session, session, 1),
    });
  } catch (error) {
    queueBlocked = isUniqueViolation(error);
  }
  await prisma.appointment.create({
    data: bookingData(queuePractice.id, patients[1].id, account.id, "QUEUE", session, session, 2),
  });
  const queueCount = await prisma.appointment.count({
    where: { doctorClinicId: queuePractice.id, lockKey: true },
  });
  check("نمط رقم الدور يرفض تكرار نفس الرقم ويقبل التالي", queueBlocked && queueCount === 2,
    queueBlocked ? `الدور ١ رُفض مرتين، والدور ٢ قُبل — المجموع ${queueCount}` : "تكرر نفس رقم الدور");

  // ── ٤. الاختبار الحقيقي: ست محاولات متزامنة على فترة واحدة ──────
  const contested = new Date("2026-09-01T14:00:00.000Z");
  const attempts = await Promise.allSettled(
    Array.from({ length: 6 }, (_, i) =>
      prisma.appointment.create({
        data: bookingData(slotPractice.id, patients[i % 3].id, account.id, "SLOT", session, contested, 0),
      }),
    ),
  );
  const won = attempts.filter((a) => a.status === "fulfilled").length;
  const rejected = attempts.filter(
    (a) => a.status === "rejected" && isUniqueViolation((a as PromiseRejectedResult).reason),
  ).length;
  check("ست محاولات متزامنة ⇒ حجز واحد فقط ينجح", won === 1 && rejected === 5,
    `نجح ${won} ورُفض ${rejected} بخطأ القيد الفريد`);

  // ── الخلاصة ─────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} اختبارات نجحت`);
  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
