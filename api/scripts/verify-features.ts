/**
 * التحقق من التذكيرات والتقييمات ولوحة السكرتير والعمولات.
 * التشغيل: npx tsx scripts/verify-features.ts
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";
import { AppError } from "../src/lib/errors.js";
import { createBooking } from "../src/modules/booking/booking.service.js";
import { runReminders } from "../src/modules/reminders/reminders.service.js";
import { createReview, listDoctorReviews, listReviewableVisits, setReviewPublished } from "../src/modules/reviews/reviews.service.js";
import {
  createStaffAccount,
  createWalkInBooking,
  getScopedAppointments,
  setScopedAppointmentStatus,
  shiftSessionAppointments,
} from "../src/modules/staff/staff.service.js";
import {
  getCommissionSummary,
  getDuesByClinic,
  listSettlements,
  settleClinic,
} from "../src/modules/commissions/commissions.service.js";
import { timeToMinutes, utcToZonedTime } from "../src/lib/timezone.js";
import { setWhatsAppProvider } from "../src/notifications/dispatch.js";
import type { SendResult, WhatsAppProvider } from "../src/notifications/whatsapp/provider.js";
import type { WhatsAppMessage } from "../src/notifications/whatsapp/templates.js";

process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-for-hs256!!";

const prisma = new PrismaClient();
const TZ = "Asia/Baghdad";
const results: { name: string; passed: boolean }[] = [];

function check(name: string, passed: boolean, detail = "") {
  results.push({ name, passed });
  console.log(`${passed ? "✔" : "✘"} ${name}${detail ? `\n   ${detail}` : ""}`);
}

class Recorder implements WhatsAppProvider {
  readonly name = "recorder";
  readonly sent: { to: string; message: WhatsAppMessage }[] = [];
  async send(to: string, message: WhatsAppMessage): Promise<SendResult> {
    this.sent.push({ to, message });
    return { ok: true, providerMessageId: `wamid.T${this.sent.length}` };
  }
}

const recorder = new Recorder();
setWhatsAppProvider(recorder);

/** يبني عيادة كاملة بجدول يغطي كل أيام الأسبوع */
async function buildClinic(suffix: string, commission = 0) {
  const district = await prisma.district.findFirstOrThrow({ where: { slug: "karkh", governorate: { slug: "baghdad" } } });
  const specialty = await prisma.specialty.findFirstOrThrow({ where: { slug: "pediatrics" } });

  const user = await prisma.user.create({
    data: { email: `d.${suffix}@clinic.iq`, fullName: `طبيب ${suffix}`, role: "DOCTOR", passwordHash: await hashPassword("Pass123456") },
  });
  const doctor = await prisma.doctor.create({
    data: { userId: user.id, whatsappNumber: "+9647701234567", specialties: { create: [{ specialtyId: specialty.id, isPrimary: true }] } },
  });
  const clinic = await prisma.clinic.create({
    data: { nameAr: `عيادة ${suffix}`, governorateId: district.governorateId, districtId: district.id },
  });
  const practice = await prisma.doctorClinic.create({
    data: {
      doctorId: doctor.id,
      clinicId: clinic.id,
      feeAmount: 25000,
      commissionAmount: commission,
      bookingMode: "SLOT",
      slotMinutes: 20,
      bookingHorizonDays: 90,
      // دوام على مدار الساعة كل الأيام حتى لا تعتمد النتيجة على ساعة تشغيل الاختبار
      schedules: { create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "00:00", endTime: "23:59" })) },
    },
  });
  return { doctorUser: user, doctor, clinic, practice };
}

async function buildPatient(suffix: string, name = "علي حسن") {
  const account = await prisma.user.create({ data: { phone: `+96477${suffix}`, fullName: name, role: "PATIENT" } });
  const patient = await prisma.patient.create({ data: { accountId: account.id, fullName: name, isSelf: true } });
  return { account, patient };
}

const SLOT_MINUTES = 20;
const DAY_END = timeToMinutes("23:59");

/**
 * أقرب فترة متاحة على شبكة العشرين دقيقة، بعد ساعات محددة من الآن.
 *
 * دوام العيادة الاختبارية ٠٠:٠٠–٢٣:٥٩، فالفترة التي تبدأ ٢٣:٤٠ لا تتّسع قبل
 * منتصف الليل والمحرّك يستبعدها. نتخطّاها إلى أول فترة في اليوم التالي كي لا
 * تتعلّق نتيجة الاختبار بالساعة التي شُغّل فيها.
 */
function slotIn(hours: number): Date {
  const at = new Date(Date.now() + hours * 3_600_000);
  at.setUTCMinutes(Math.ceil(at.getUTCMinutes() / SLOT_MINUTES) * SLOT_MINUTES, 0, 0);
  while (timeToMinutes(utcToZonedTime(at, TZ)) + SLOT_MINUTES > DAY_END) {
    at.setUTCMinutes(at.getUTCMinutes() + SLOT_MINUTES);
  }
  return at;
}

async function main() {
  const suffix = Date.now().toString().slice(-8);

  // ═══ التذكيرات ═══════════════════════════════════════════════
  {
    const { practice } = await buildClinic(`r${suffix}`);
    const phone = `1${suffix.slice(1)}`;
    const { account, patient } = await buildPatient(phone);

    const startAt = slotIn(24);
    await createBooking(
      { doctorClinicId: practice.id, patientId: patient.id, bookedByUserId: account.id, startAt },
      prisma,
    );
    recorder.sent.length = 0;

    // نُشغّل المجدوِل كأن الآن قبل الموعد بأربع وعشرين ساعة
    const first = await runReminders(new Date(startAt.getTime() - 24 * 3_600_000), prisma);
    // نعدّ تذكيرات هذا المريض وحده: العدّاد العام يشمل حجوزات تشغيلات سابقة
    // تقع في نفس نافذة العشر دقائق، فيسقط الاختبار على قاعدة فيها بيانات
    const mine = recorder.sent.filter(
      (m) => m.to.includes(phone) && m.message.templateName === "appointment_reminder",
    );
    check(
      "التذكير يُرسل قبل الموعد بيوم",
      mine.length === 1 && mine[0].message.body.includes("غداً") && first.delivered >= 1,
      `أُرسل لهذا المريض ${mine.length} من ${first.delivered} · «${mine[0]?.message.body.split("\n")[0]}»`,
    );

    const second = await runReminders(new Date(startAt.getTime() - 24 * 3_600_000), prisma);
    check(
      "تشغيل المجدوِل مرتين لا يُرسل التذكير مرتين",
      second.delivered === 0 && second.skipped.alreadySent >= 1,
      `أُرسل ${second.delivered} ومُرسَل سابقاً ${second.skipped.alreadySent} — القيد الفريد رفض الصف الثاني`,
    );

    recorder.sent.length = 0;
    const twoHour = await runReminders(new Date(startAt.getTime() - 2 * 3_600_000), prisma);
    const mineTwoHour = recorder.sent.filter((m) => m.to.includes(phone));
    check(
      "تذكير الساعتين يُرسل منفصلاً عن تذكير اليوم",
      mineTwoHour.length === 1 && twoHour.delivered >= 1,
      `نوعان مختلفان فلا يتعارضان مع القيد — أُرسل لهذا المريض ${mineTwoHour.length}`,
    );
  }

  // ═══ التقييمات ═══════════════════════════════════════════════
  {
    const { doctor, practice } = await buildClinic(`v${suffix}`);
    const { account, patient } = await buildPatient(`2${suffix.slice(1)}`);

    const booking = await createBooking(
      { doctorClinicId: practice.id, patientId: patient.id, bookedByUserId: account.id, startAt: slotIn(3) },
      prisma,
    );

    let blocked = "";
    try {
      await createReview(account.id, booking.appointmentId, { rating: 5 }, prisma);
    } catch (error) {
      if (error instanceof AppError) blocked = error.code;
    }
    check("لا يُقبل تقييم قبل أن تؤشّر العيادة انتهاء الكشف", blocked === "NOT_COMPLETED", `رُفض بالرمز ${blocked}`);

    await prisma.appointment.update({
      where: { id: booking.appointmentId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    const reviewable = await listReviewableVisits(account.id, prisma);
    check("الزيارة المكتملة تظهر في قائمة ما يمكن تقييمه", reviewable.length === 1, `${reviewable.length} زيارة`);

    const review = await createReview(account.id, booking.appointmentId, { rating: 5, comment: "طبيب ممتاز ومتعاون" }, prisma);
    const afterFirst = await prisma.doctor.findUniqueOrThrow({ where: { id: doctor.id } });
    check(
      "التقييم يُحتسب في متوسط الطبيب فوراً",
      afterFirst.ratingAvg === 5 && afterFirst.ratingCount === 1,
      `المتوسط ${afterFirst.ratingAvg} من ${afterFirst.ratingCount} تقييم`,
    );

    const beforePublish = await listDoctorReviews(doctor.id, prisma);
    await setReviewPublished(review.id, true, prisma);
    const afterPublish = await listDoctorReviews(doctor.id, prisma);
    check(
      "التعليق لا يظهر للمرضى قبل مراجعة المالك",
      beforePublish.length === 0 && afterPublish.length === 1 && afterPublish[0].patientName === "علي",
      "وبعد النشر يظهر بالاسم الأول فقط",
    );

    let twice = "";
    try {
      await createReview(account.id, booking.appointmentId, { rating: 1 }, prisma);
    } catch (error) {
      if (error instanceof AppError) twice = error.code;
    }
    check("لا يُقبل تقييمان لنفس الزيارة", twice === "ALREADY_REVIEWED", `رُفض بالرمز ${twice}`);

    const { account: other } = await buildPatient(`3${suffix.slice(1)}`, "شخص آخر");
    let foreign = "";
    try {
      await createReview(other.id, booking.appointmentId, { rating: 1 }, prisma);
    } catch (error) {
      if (error instanceof AppError) foreign = error.code;
    }
    check("لا يقيّم أحد زيارة لا تخصه", foreign === "NOT_YOUR_APPOINTMENT", `رُفض بالرمز ${foreign}`);
  }

  // ═══ لوحة السكرتير ═══════════════════════════════════════════
  {
    const owner = await prisma.user.create({
      data: { email: `own.${suffix}@mawid.iq`, fullName: "مالك", role: "OWNER", passwordHash: await hashPassword("Owner12345") },
    });
    const mine = await buildClinic(`s${suffix}`);
    const other = await buildClinic(`o${suffix}`);

    const staff = await createStaffAccount(
      owner.id,
      { fullName: "زينب السكرتيرة", email: `st.${suffix}@clinic.iq`, clinicId: mine.clinic.id },
      prisma,
    );
    check(
      "المالك ينشئ حساب سكرتير بباسوورد أولي",
      !!staff.temporaryPassword && staff.email === `st.${suffix}@clinic.iq`,
      `الباسوورد المولَّد: ${staff.temporaryPassword}`,
    );

    // حجز يدوي لمريض بلا تطبيق
    const walkIn = await createWalkInBooking(
      staff.userId,
      {
        doctorClinicId: mine.practice.id,
        fullName: "كريم عبد الله",
        phone: `077${suffix}`,
        startAt: slotIn(4).toISOString(),
        note: "حضر بلا موعد",
      },
      prisma,
    );
    const created = await prisma.appointment.findUniqueOrThrow({
      where: { id: walkIn.appointmentId },
      include: { patient: { include: { account: true } } },
    });
    check(
      "السكرتير يضيف حجزاً يدوياً لمريض حضر بلا تطبيق",
      !!walkIn.reference && created.createdByStaffId === staff.staffId && created.patient.account.phone === `+964077${suffix}`.replace("+9640", "+964"),
      `الحجز ${walkIn.reference} وأُنشئ حساب للمريض برقمه فيصله التذكير`,
    );

    // التاريخ بتوقيت العيادة لا بالتوقيت العالمي: موعد الساعة ٢١:٣٠ عالمياً
    // يقع في اليوم التالي ببغداد، والسكرتير يفكّر بتوقيت عيادته
    const clinicDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(created.slotStart);
    const list = await getScopedAppointments(staff.userId, clinicDate, prisma);
    check(
      "السكرتير يرى حجوزات عيادته فقط",
      list.length >= 1 && list.every((row) => row.practiceId === mine.practice.id),
      `${list.length} حجز، كلها من عيادته`,
    );

    await setScopedAppointmentStatus(staff.userId, walkIn.appointmentId, "CONFIRMED", prisma);
    const marked = await prisma.appointment.findUniqueOrThrow({ where: { id: walkIn.appointmentId } });
    check("السكرتير يؤشّر حضور المريض", marked.arrivedAt !== null);

    let crossClinic = "";
    try {
      await createWalkInBooking(
        staff.userId,
        { doctorClinicId: other.practice.id, fullName: "شخص", phone: `078${suffix}`, startAt: slotIn(5).toISOString() },
        prisma,
      );
    } catch (error) {
      if (error instanceof AppError) crossClinic = error.code;
    }
    check("السكرتير لا يتصرّف بعيادة لا تخصه", crossClinic === "NOT_YOUR_PRACTICE", `رُفض بالرمز ${crossClinic}`);

    // تأجيل جماعي
    const shiftStart = new Date(created.sessionStart);
    const shifted = await shiftSessionAppointments(
      staff.userId,
      { doctorClinicId: mine.practice.id, sessionStart: shiftStart.toISOString(), minutes: 60 },
      prisma,
    );
    const afterShift = await prisma.appointment.findUniqueOrThrow({ where: { id: walkIn.appointmentId } });
    check(
      "التأجيل الجماعي يزيح مواعيد الفترة كلها",
      shifted.shifted >= 1 && afterShift.slotStart.getTime() === created.slotStart.getTime() + 3_600_000,
      `أُزيح ${shifted.shifted} موعد ساعة واحدة`,
    );
  }

  // ═══ العمولة ═════════════════════════════════════════════════
  {
    const owner = await prisma.user.create({
      data: { email: `com.${suffix}@mawid.iq`, fullName: "مالك العمولات", role: "OWNER", passwordHash: await hashPassword("Owner12345") },
    });
    const { practice, clinic } = await buildClinic(`c${suffix}`, 5000);
    const { account, patient } = await buildPatient(`5${suffix.slice(1)}`);
    const staff = await createStaffAccount(
      owner.id,
      { fullName: "سكرتير العمولات", email: `cs.${suffix}@clinic.iq`, clinicId: clinic.id },
      prisma,
    );

    const visit = await createBooking(
      { doctorClinicId: practice.id, patientId: patient.id, bookedByUserId: account.id, startAt: slotIn(2) },
      prisma,
    );

    const beforeArrival = await prisma.commission.count({ where: { appointmentId: visit.appointmentId } });
    check(
      "لا عمولة على حجز لم يحضر صاحبه بعد",
      beforeArrival === 0,
      "العيادة لا تدفع عن مريض لم يأتِ — وهذا ما يجعلها تقبل الاتفاق",
    );

    await setScopedAppointmentStatus(staff.userId, visit.appointmentId, "CONFIRMED", prisma);
    const afterArrival = await prisma.commission.findFirst({ where: { appointmentId: visit.appointmentId } });
    check(
      "العمولة تُسجَّل لحظة تأشير الحضور",
      afterArrival?.amount === 5000 && afterArrival.status === "DUE",
      `${afterArrival?.amount} دينار مستحقة على العيادة`,
    );

    // «حضر» ثم «تم الكشف» نداءان متتاليان — يجب ألا يسجّلا عمولتين
    await setScopedAppointmentStatus(staff.userId, visit.appointmentId, "COMPLETED", prisma);
    const count = await prisma.commission.count({ where: { appointmentId: visit.appointmentId } });
    check(
      "تأشير الحضور ثم انتهاء الكشف لا يسجّل عمولتين",
      count === 1,
      "القيد الفريد على الزيارة يرفض الصف الثاني",
    );

    // تصحيح تأشير خاطئ يُلغي العمولة
    await setScopedAppointmentStatus(staff.userId, visit.appointmentId, "NO_SHOW", prisma);
    const afterReversal = await prisma.commission.count({ where: { appointmentId: visit.appointmentId } });
    check("تصحيح التأشير إلى «لم يحضر» يُلغي العمولة", afterReversal === 0);

    // زيارتان محسوبتان
    await setScopedAppointmentStatus(staff.userId, visit.appointmentId, "CONFIRMED", prisma);
    const second = await createBooking(
      { doctorClinicId: practice.id, patientId: patient.id, bookedByUserId: account.id, startAt: slotIn(3) },
      prisma,
    );
    await setScopedAppointmentStatus(staff.userId, second.appointmentId, "CONFIRMED", prisma);

    const dues = await getDuesByClinic(prisma);
    const mine = dues.find((row) => row.clinicId === clinic.id);
    check(
      "المالك يرى المستحق على كل عيادة مجمَّعاً",
      mine?.visits === 2 && mine.amount === 10000,
      `${mine?.clinicName}: ${mine?.visits} زيارة بـ${mine?.amount} دينار`,
    );

    const settlement = await settleClinic(owner.id, clinic.id, "تحصيل نقدي", prisma);
    const afterSettle = await getDuesByClinic(prisma);
    const settledRows = await prisma.commission.count({ where: { clinicId: clinic.id, status: "SETTLED" } });
    check(
      "تسجيل التحصيل يغلق عمولات العيادة دفعة واحدة",
      settlement.amount === 10000 &&
        settlement.count === 2 &&
        settledRows === 2 &&
        !afterSettle.some((row) => row.clinicId === clinic.id),
      `قُبض ${settlement.amount} دينار عن ${settlement.count} زيارة، ولم يبقَ مستحق`,
    );

    const history = await listSettlements(prisma);
    const summary = await getCommissionSummary(prisma);
    check(
      "سجل التحصيلات يحفظ ماذا قُبض ومتى ومن أي عيادة",
      history.some((row) => row.id === settlement.settlementId && row.amount === 10000) &&
        summary.collectedThisMonth >= 10000,
      `${history.length} تحصيل مسجَّل، والمقبوض هذا الشهر ${summary.collectedThisMonth}`,
    );

    let nothingDue = "";
    try {
      await settleClinic(owner.id, clinic.id, null, prisma);
    } catch (error) {
      if (error instanceof AppError) nothingDue = error.code;
    }
    check("لا يُسجَّل تحصيل على عيادة بلا مستحقات", nothingDue === "NOTHING_DUE", `رُفض بالرمز ${nothingDue}`);
  }

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
