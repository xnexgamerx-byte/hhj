/**
 * التحقق من التذكيرات والتقييمات ولوحة السكرتير والعربون.
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
import { markPaidManually, setPaymentProvider, startPayment } from "../src/modules/payments/payments.service.js";
import { ManualProvider } from "../src/modules/payments/provider.js";
import { releaseExpiredHolds } from "../src/scheduler.js";
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
setPaymentProvider(new ManualProvider());

/** يبني عيادة كاملة بجدول يغطي كل أيام الأسبوع */
async function buildClinic(suffix: string, deposit = 0) {
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
      depositAmount: deposit,
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

/** أقرب فترة متاحة على شبكة العشرين دقيقة، بعد ساعات محددة من الآن */
function slotIn(hours: number): Date {
  const at = new Date(Date.now() + hours * 3_600_000);
  at.setUTCMinutes(Math.ceil(at.getUTCMinutes() / 20) * 20, 0, 0);
  return at;
}

async function main() {
  const suffix = Date.now().toString().slice(-8);

  // ═══ التذكيرات ═══════════════════════════════════════════════
  {
    const { practice } = await buildClinic(`r${suffix}`);
    const { account, patient } = await buildPatient(`1${suffix.slice(1)}`);

    const startAt = slotIn(24);
    await createBooking(
      { doctorClinicId: practice.id, patientId: patient.id, bookedByUserId: account.id, startAt },
      prisma,
    );
    recorder.sent.length = 0;

    // نُشغّل المجدوِل كأن الآن قبل الموعد بأربع وعشرين ساعة
    const first = await runReminders(new Date(startAt.getTime() - 24 * 3_600_000), prisma);
    const reminder = recorder.sent.find((m) => m.message.templateName === "appointment_reminder");
    check(
      "التذكير يُرسل قبل الموعد بيوم",
      first.delivered === 1 && !!reminder && reminder.message.body.includes("غداً"),
      `أُرسل ${first.delivered} · القالب ${reminder?.message.templateName} · «${reminder?.message.body.split("\n")[0]}»`,
    );

    const second = await runReminders(new Date(startAt.getTime() - 24 * 3_600_000), prisma);
    check(
      "تشغيل المجدوِل مرتين لا يُرسل التذكير مرتين",
      second.delivered === 0 && second.skipped.alreadySent >= 1,
      `أُرسل ${second.delivered} ومُرسَل سابقاً ${second.skipped.alreadySent} — القيد الفريد رفض الصف الثاني`,
    );

    const twoHour = await runReminders(new Date(startAt.getTime() - 2 * 3_600_000), prisma);
    check(
      "تذكير الساعتين يُرسل منفصلاً عن تذكير اليوم",
      twoHour.delivered === 1,
      "نوعان مختلفان فلا يتعارضان مع القيد",
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

  // ═══ العربون ═════════════════════════════════════════════════
  {
    const { practice } = await buildClinic(`p${suffix}`, 10000);
    const { account, patient } = await buildPatient(`4${suffix.slice(1)}`);
    recorder.sent.length = 0;

    const booking = await createBooking(
      { doctorClinicId: practice.id, patientId: patient.id, bookedByUserId: account.id, startAt: slotIn(6) },
      prisma,
    );
    check(
      "الحجز في عيادة تطلب عربوناً يُحجز مؤقتاً ولا يُشعَر الطبيب بعد",
      booking.status === "HELD" && booking.depositAmount === 10000 && !booking.whatsapp.queued && !!booking.holdExpiresAt,
      `الحالة ${booking.status} ومهلة الدفع حتى ${booking.holdExpiresAt?.slice(11, 16)} — والسبب: ${booking.whatsapp.reason}`,
    );

    const payment = await startPayment(account.id, booking.appointmentId, "http://localhost/my", prisma);
    check("بدء الدفع ينشئ عملية بمبلغ العربون", payment.amount === 10000 && payment.provider === "manual");

    await markPaidManually(account.id, booking.appointmentId, prisma);
    const paid = await prisma.appointment.findUniqueOrThrow({ where: { id: booking.appointmentId } });
    const notified = recorder.sent.some((m) => m.message.templateName === "new_booking");
    check(
      "دفع العربون يؤكّد الحجز ويرسل تفاصيله للطبيب",
      paid.status === "CONFIRMED" && paid.paymentStatus === "PAID" && paid.holdExpiresAt === null && notified,
      "الإشعار يُؤجَّل حتى الدفع فلا يصل الطبيب حجز لم يكتمل",
    );

    // حجز آخر لا يُدفع، ثم تنتهي مهلته
    const stale = await createBooking(
      { doctorClinicId: practice.id, patientId: patient.id, bookedByUserId: account.id, startAt: slotIn(7) },
      prisma,
    );
    await prisma.appointment.update({
      where: { id: stale.appointmentId },
      data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });
    const released = await releaseExpiredHolds();
    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: stale.appointmentId } });
    check(
      "الحجز غير المدفوع يُحرَّر بعد انتهاء مهلته",
      released >= 1 && after.lockKey === null && after.cancelReason === "انتهت مهلة الدفع",
      "الوقت عاد شاغراً لمريض آخر مع بقاء الصف في السجل",
    );
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
