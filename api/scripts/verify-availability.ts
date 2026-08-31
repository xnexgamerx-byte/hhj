/**
 * التحقق من محرك الأوقات المتاحة.
 *
 * السؤال الذي يجيب عليه: هل يختفي الوقت من شاشة المريض بمجرد حجزه،
 * وهل يظهر للطبيب أنه محجوز؟
 *
 * التشغيل: npx tsx scripts/verify-availability.ts
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";
import { AppError } from "../src/lib/errors.js";
import { addDaysISO, zonedToUtc } from "../src/lib/timezone.js";
import { getAvailability } from "../src/modules/availability/availability.service.js";
import { setWeeklySchedule, addException } from "../src/modules/doctor/schedule.service.js";
import { getScopedAppointments } from "../src/modules/staff/staff.service.js";
import { createBooking, cancelBooking } from "../src/modules/booking/booking.service.js";
import { setWhatsAppProvider } from "../src/notifications/dispatch.js";
import { ConsoleProvider } from "../src/notifications/whatsapp/provider.js";
import { searchDoctors, listSpecialtiesWithCounts } from "../src/modules/discovery/discovery.service.js";

process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-for-hs256!!";
setWhatsAppProvider(new ConsoleProvider(() => {}));

const prisma = new PrismaClient();
const TZ = "Asia/Baghdad";
const results: { name: string; passed: boolean; detail: string }[] = [];

function check(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  console.log(`${passed ? "✔" : "✘"} ${name}\n   ${detail}`);
}

/** أقرب تاريخ قادم يقع في يوم الأسبوع المطلوب (٠ = الأحد) */
function nextWeekday(weekday: number): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  do {
    date.setUTCDate(date.getUTCDate() + 1);
  } while (date.getUTCDay() !== weekday);
  return date.toISOString().slice(0, 10);
}

async function main() {
  const suffix = Date.now().toString().slice(-8);

  const district = await prisma.district.findFirstOrThrow({
    where: { slug: "karkh", governorate: { slug: "baghdad" } },
  });
  const specialty = await prisma.specialty.findFirstOrThrow({ where: { slug: "cardiology" } });

  const doctorUser = await prisma.user.create({
    data: {
      email: `slot.${suffix}@clinic.iq`,
      fullName: "سارة العبيدي",
      role: "DOCTOR",
      passwordHash: await hashPassword("Doctor12345"),
    },
  });
  const doctor = await prisma.doctor.create({
    data: {
      userId: doctorUser.id,
      whatsappNumber: "+9647701234567",
      specialties: { create: [{ specialtyId: specialty.id, isPrimary: true }] },
    },
  });
  const clinic = await prisma.clinic.create({
    data: { nameAr: "عيادة القلب", governorateId: district.governorateId, districtId: district.id, timezone: TZ },
  });
  const practice = await prisma.doctorClinic.create({
    data: {
      doctorId: doctor.id,
      clinicId: clinic.id,
      feeAmount: 30000,
      bookingMode: "SLOT",
      slotMinutes: 20,
      bookingHorizonDays: 60,
    },
  });

  const account = await prisma.user.create({
    data: { phone: `+96477${suffix}`, fullName: "زينب كريم", role: "PATIENT" },
  });
  const patient = await prisma.patient.create({
    data: { accountId: account.id, fullName: "زينب كريم", isSelf: true },
  });

  // ── ١. الطبيب يحدد أوقاته ───────────────────────────────────────
  await setWeeklySchedule(
    doctorUser.id,
    practice.id,
    [
      { weekday: 1, startTime: "16:00", endTime: "19:00" }, // الإثنين
      { weekday: 3, startTime: "09:00", endTime: "12:00" }, // الأربعاء
    ],
    prisma,
  );

  // الأيام تُشتقّ من إثنين المرساة لا من اليوم الحالي: لو شُغّل الفحص يوم إثنين
  // لعاد nextWeekday(2) بثلاثاءٍ يسبق الإثنين القادم — أي خارج المدى المسؤول عنه.
  const monday = nextWeekday(1);
  const tuesday = addDaysISO(monday, 1);
  const wednesday = addDaysISO(monday, 2);

  const twoWeeks = await getAvailability(practice.id, monday, addDaysISO(monday, 13), {}, prisma);
  const mondayDay = twoWeeks.find((d) => d.date === monday)!;
  const tuesdayDay = twoWeeks.find((d) => d.date === tuesday)!;

  check(
    "الأيام التي حددها الطبيب فقط هي التي تفتح للحجز",
    mondayDay.sessions.length === 1 && tuesdayDay.sessions.length === 0,
    `الإثنين ${mondayDay.sessions.length} فترة، والثلاثاء ${tuesdayDay.sessions.length} — لأن الطبيب لم يحدد الثلاثاء`,
  );

  // ٤ عصراً إلى ٧ مساءً بمدة كشف ٢٠ دقيقة ⇐ ٩ فترات
  const mondaySession = mondayDay.sessions[0];
  check(
    "الفترات تُولَّد بمدة الكشف التي حددها الطبيب",
    mondaySession.slots.length === 9 &&
      mondaySession.slots[0].time === "16:00" &&
      mondaySession.slots.at(-1)!.time === "18:40",
    `${mondaySession.slots.length} فترة من ${mondaySession.slots[0].time} إلى ${mondaySession.slots.at(-1)!.time} كل ٢٠ دقيقة`,
  );

  // ── ٢. الحجز يقفل الوقت ─────────────────────────────────────────
  const chosen = mondaySession.slots[2]; // 16:40
  const booking = await createBooking(
    { doctorClinicId: practice.id, patientId: patient.id, bookedByUserId: account.id, startAt: new Date(chosen.start) },
    prisma,
  );

  const patientView = await getAvailability(practice.id, monday, monday, { includeTaken: false }, prisma);
  const doctorView = await getAvailability(practice.id, monday, monday, { includeTaken: true }, prisma);

  const stillVisible = patientView[0].sessions[0].slots.some((s) => s.start === chosen.start);
  const doctorSeesTaken = doctorView[0].sessions[0].slots.find((s) => s.start === chosen.start)?.taken;

  check(
    "الوقت المحجوز يختفي من شاشة المريض",
    !stillVisible && patientView[0].sessions[0].slots.length === 8,
    `بقيت ${patientView[0].sessions[0].slots.length} فترة بعد حجز ${chosen.time} — والمحجوزة لم تعد تظهر`,
  );
  check(
    "الطبيب يرى الفترة محجوزة لا مخفية",
    doctorSeesTaken === true && doctorView[0].sessions[0].slots.length === 9,
    `لوحة الطبيب تعرض ٩ فترات، واحدة منها (${chosen.time}) مؤشَّرة كمحجوزة`,
  );

  // ── ٣. لا يمكن حجز نفس الوقت مرة أخرى ──────────────────────────
  let secondBlocked = "";
  try {
    await createBooking(
      { doctorClinicId: practice.id, patientId: patient.id, bookedByUserId: account.id, startAt: new Date(chosen.start) },
      prisma,
    );
  } catch (error) {
    if (error instanceof AppError) secondBlocked = error.code;
  }
  check("محاولة حجز وقت محجوز تُرفض", secondBlocked === "SLOT_TAKEN", `رُفضت بالرمز ${secondBlocked}`);

  // ── ٤. الإلغاء يعيد الوقت للظهور ────────────────────────────────
  await cancelBooking(booking.appointmentId, "PATIENT", account.id, "تغيّر ظرفي", prisma);
  const afterCancel = await getAvailability(practice.id, monday, monday, {}, prisma);
  check(
    "إلغاء الحجز يعيد الوقت للظهور للمرضى",
    afterCancel[0].sessions[0].slots.length === 9,
    `عادت ${afterCancel[0].sessions[0].slots.length} فترة بعد الإلغاء`,
  );

  // ── ٥. الحجز خارج جدول الطبيب مرفوض ────────────────────────────
  let outsideBlocked = "";
  try {
    await createBooking(
      {
        doctorClinicId: practice.id,
        patientId: patient.id,
        bookedByUserId: account.id,
        startAt: zonedToUtc(tuesday, "17:00", TZ), // الثلاثاء ليس يوم دوام
      },
      prisma,
    );
  } catch (error) {
    if (error instanceof AppError) outsideBlocked = error.code;
  }
  check(
    "الحجز في يوم لا يداوم فيه الطبيب مرفوض",
    outsideBlocked === "NOT_AVAILABLE",
    "لا يستطيع العميل اختراع فترة دوام — الخادم يشتقّها من جدول الطبيب",
  );

  let offGridBlocked = "";
  try {
    await createBooking(
      {
        doctorClinicId: practice.id,
        patientId: patient.id,
        bookedByUserId: account.id,
        startAt: zonedToUtc(monday, "16:07", TZ), // خارج شبكة الفترات
      },
      prisma,
    );
  } catch (error) {
    if (error instanceof AppError) offGridBlocked = error.code;
  }
  check(
    "الحجز في وقت لا يقع على شبكة الفترات مرفوض",
    offGridBlocked === "NOT_AVAILABLE",
    "٤:٠٧ مرفوض لأن الفترات تبدأ كل ٢٠ دقيقة",
  );

  // ── ٦. إجازة يوم كامل ───────────────────────────────────────────
  await addException(doctorUser.id, practice.id, { date: wednesday, type: "CLOSED", reason: "سفر" }, prisma);
  const withHoliday = await getAvailability(practice.id, wednesday, wednesday, {}, prisma);
  check(
    "إجازة الطبيب تغلق اليوم كاملاً",
    withHoliday[0].isClosed && withHoliday[0].sessions.length === 0 && withHoliday[0].closedReason === "سفر",
    `${wednesday} مغلق بسبب: ${withHoliday[0].closedReason}`,
  );

  // ── ٧. إغلاق فترة جزئية ────────────────────────────────────────
  const nextMonday = addDaysISO(monday, 7);
  await addException(
    doctorUser.id,
    practice.id,
    { date: nextMonday, type: "CLOSED", startTime: "17:00", endTime: "18:00", reason: "اجتماع" },
    prisma,
  );
  const partial = await getAvailability(practice.id, nextMonday, nextMonday, {}, prisma);
  const times = partial[0].sessions[0].slots.map((s) => s.time);
  check(
    "إغلاق فترة جزئية يحذف ساعتها فقط",
    !partial[0].isClosed && !times.includes("17:00") && !times.includes("17:40") && times.includes("18:00"),
    `بقيت ${times.length} فترة: ${times.join("، ")}`,
  );

  // ── ٨. نمط رقم الدور: السعة تنقص والفترة الممتلئة تُخفى ────────
  const queueClinic = await prisma.clinic.create({
    data: { nameAr: "عيادة الدور", governorateId: district.governorateId, districtId: district.id, timezone: TZ },
  });
  const queuePractice = await prisma.doctorClinic.create({
    data: {
      doctorId: doctor.id,
      clinicId: queueClinic.id,
      feeAmount: 20000,
      bookingMode: "QUEUE",
      capacityPerSession: 3,
      bookingHorizonDays: 60,
      schedules: { create: [{ weekday: 5, startTime: "16:00", endTime: "20:00" }] },
    },
  });

  const friday = nextWeekday(5);
  const fridaySession = (await getAvailability(queuePractice.id, friday, friday, {}, prisma))[0].sessions[0];
  const queueStart = new Date(fridaySession.sessionStart);

  const numbers: number[] = [];
  for (let i = 0; i < 3; i++) {
    const result = await createBooking(
      { doctorClinicId: queuePractice.id, patientId: patient.id, bookedByUserId: account.id, startAt: queueStart },
      prisma,
    );
    numbers.push(result.queueNumber);
  }

  const afterThree = await getAvailability(queuePractice.id, friday, friday, {}, prisma);
  let fullBlocked = "";
  try {
    await createBooking(
      { doctorClinicId: queuePractice.id, patientId: patient.id, bookedByUserId: account.id, startAt: queueStart },
      prisma,
    );
  } catch (error) {
    if (error instanceof AppError) fullBlocked = error.code;
  }

  check(
    "نمط رقم الدور: الأرقام تتسلسل والفترة الممتلئة تُخفى",
    numbers.join(",") === "1,2,3" && afterThree[0].sessions.length === 0 && fullBlocked === "SESSION_FULL",
    `أدوار ${numbers.join("، ")} من سعة ٣ — ثم اختفت الفترة ورُفض الرابع بالرمز ${fullBlocked}`,
  );

  // ── ٩. الأوقات الماضية لا تظهر ──────────────────────────────────
  const past = await getAvailability(
    practice.id,
    monday,
    monday,
    { now: zonedToUtc(monday, "17:30", TZ) },
    prisma,
  );
  const futureOnly = past[0].sessions[0]?.slots.map((s) => s.time) ?? [];
  check(
    "الفترات التي مضت لا تظهر للحجز",
    futureOnly.every((t) => t >= "17:30") && futureOnly.includes("17:40"),
    `عند الساعة ٥:٣٠ تبقى: ${futureOnly.join("، ") || "لا شيء"}`,
  );

  // ── ١٠. لوحة الطبيب ترى مرضى اليوم ─────────────────────────────
  const fridayList = await getScopedAppointments(doctorUser.id, friday, prisma);
  check(
    "لوحة الطبيب تعرض مرضى اليوم بالترتيب",
    fridayList.length === 3 && fridayList[0].queueNumber === 1 && fridayList[0].patientName === "زينب كريم",
    `${fridayList.length} مرضى يوم ${friday}، أولهم الدور ${fridayList[0].queueNumber}`,
  );

  // ── ١١. المريض يجد الطبيب في البحث ─────────────────────────────
  const specialties = await listSpecialtiesWithCounts(district.governorateId, prisma);
  const cardiology = specialties.find((s) => s.slug === "cardiology");
  const found = await searchDoctors({ governorateId: district.governorateId, specialtyId: specialty.id }, prisma);
  const target = found.find((d) => d.id === doctor.id);

  check(
    "التخصص يعرض عدد أطبائه والبحث يجد الطبيب مع أقرب موعد",
    !!cardiology && cardiology.doctorCount >= 1 && !!target && !!target.nextAvailable,
    `تخصص ${cardiology?.nameAr} فيه ${cardiology?.doctorCount} طبيب — وأقرب موعد لـ${target?.fullName}: ${target?.nextAvailable?.weekdayName} ${target?.nextAvailable?.date} (${target?.nextAvailable?.freeCount} مكان)`,
  );

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
