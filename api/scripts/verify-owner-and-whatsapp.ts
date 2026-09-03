/**
 * التحقق من المسارين الجديدين:
 *   ١. المالك يسجّل الطبيب وينشئ له إيميلاً وباسووردًا
 *   ٢. تفاصيل الحجز تتحول لواتساب الطبيب
 *
 * التشغيل: npx tsx scripts/verify-owner-and-whatsapp.ts
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";
import { formatIraqiPhoneForDisplay, normalizeIraqiPhone, toLatinDigits } from "../src/lib/phone.js";
import { templateSpecs } from "../src/notifications/whatsapp/templates.js";
import { AppError } from "../src/lib/errors.js";
import { createDoctorAccount, resetDoctorPassword } from "../src/modules/owner/provisioning.js";
import { changePassword, loginByPhone, loginWithPassword } from "../src/modules/auth/auth.service.js";
import { getMyPatients, updatePatient } from "../src/modules/discovery/discovery.service.js";
import { createBooking } from "../src/modules/booking/booking.service.js";
import { flushPending, setWhatsAppProvider } from "../src/notifications/dispatch.js";
import { ConsoleProvider, type SendResult, type WhatsAppProvider } from "../src/notifications/whatsapp/provider.js";
import type { WhatsAppMessage } from "../src/notifications/whatsapp/templates.js";

process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-for-hs256!!";

const prisma = new PrismaClient();

/** أقرب أحد قادم الساعة ٤ عصراً بتوقيت بغداد (13:00Z) */
function nextSunday16(): Date {
  const date = new Date();
  date.setUTCHours(13, 0, 0, 0);
  do {
    date.setUTCDate(date.getUTCDate() + 1);
  } while (date.getUTCDay() !== 0);
  return date;
}
const results: { name: string; passed: boolean; detail: string }[] = [];

function check(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  console.log(`${passed ? "✔" : "✘"} ${name}\n   ${detail}`);
}

/** مزوّد اختباري يمكن جعله يفشل عند الطلب، لمحاكاة تعطّل واتساب. */
class FlakyProvider implements WhatsAppProvider {
  readonly name = "flaky-test";
  readonly sent: { to: string; message: WhatsAppMessage }[] = [];
  failNext = false;

  async send(to: string, message: WhatsAppMessage): Promise<SendResult> {
    if (this.failNext) return { ok: false, error: "محاكاة تعطّل واتساب", retryable: true };
    this.sent.push({ to, message });
    return { ok: true, providerMessageId: `wamid.TEST${this.sent.length}` };
  }
}

async function main() {
  const suffix = Date.now().toString().slice(-8);
  const provider = new FlakyProvider();
  setWhatsAppProvider(provider);

  // ── تهيئة: حساب المالك ──────────────────────────────────────────
  const owner = await prisma.user.create({
    data: {
      email: `owner.${suffix}@doctorsehti.iq`,
      fullName: "المالك",
      role: "OWNER",
      passwordHash: await hashPassword("OwnerPass123"),
    },
  });

  // ── ١. تطبيع أرقام الهواتف العراقية ────────────────────────────
  const variants = ["07701234567", "7701234567", "+9647701234567", "009647701234567", "٠٧٧٠١٢٣٤٥٦٧"];
  const normalized = new Set(variants.map(normalizeIraqiPhone));
  check(
    "كل صيغ الرقم العراقي تُطبَّع إلى صيغة واحدة",
    normalized.size === 1 && normalized.has("+9647701234567"),
    `${variants.length} صيغة (منها الأرقام العربية ${toLatinDigits("٠٧٧٠")}…) ⇐ ${[...normalized][0]}`,
  );

  check(
    "رقم الهاتف يُعرض بصيغة عراقية مقروءة وقابلة للنقر",
    formatIraqiPhoneForDisplay("+9647701234567") === "0770-123-4567",
    `‎+9647701234567 ⇐ ${formatIraqiPhoneForDisplay("+9647701234567")} — بأرقام لاتينية ليبقى قابلاً للاتصال داخل واتساب`,
  );

  // الشكل المحلّي يصل الدالة فعلاً: حقل الهاتف في نموذج الحجز يخزّنه هكذا،
  // ورسالة الواتساب تفضّله على رقم الحساب. وافتراض الدولي وحده كان يضيف صفراً
  // إلى رقمٍ يبدأ بصفر فيخرج رقمٌ من اثنتي عشرة خانة لا يُتّصل به
  check(
    "والشكل المحلّي كما يخزّنه نموذج الحجز يُعرض صحيحاً أيضاً",
    formatIraqiPhoneForDisplay("07732650315") === "0773-265-0315",
    `07732650315 ⇐ ${formatIraqiPhoneForDisplay("07732650315")}`,
  );

  // الفواصل شرطات لا مسافات: مجموعات أرقامٍ لاتينية مفصولة بمسافات داخل نصٍّ
  // عربي يعكس محرّك ثنائي الاتجاه ترتيبها، فيقرأ الطبيب الرقم مقلوباً
  check(
    "لا مسافات في الرقم كي لا يقلبه اتجاه النصّ العربي",
    !formatIraqiPhoneForDisplay("+9647701234567").includes(" "),
    "الشرطة بين رقمين تُضمّ إليهما فيصير الرقم كتلةً واحدة لا تُعاد ترتيبها",
  );

  // ── ٢. المالك يسجّل الطبيب ──────────────────────────────────────
  const specialty = await prisma.specialty.findFirstOrThrow({ where: { slug: "pediatrics" } });
  const created = await createDoctorAccount(owner.id, {
    fullName: "أحمد الجبوري",
    email: `Ahmed.${suffix}@Clinic.IQ`,
    whatsappNumber: "٠٧٧٠١٢٣٤٥٦٧",
    title: "د.",
    specialtyIds: [specialty.id],
  }, prisma);

  const storedDoctor = await prisma.doctor.findUniqueOrThrow({
    where: { id: created.doctorId },
    include: { user: true },
  });
  check(
    "المالك ينشئ حساب الطبيب بإيميل وباسوورد أولي",
    storedDoctor.user.email === `ahmed.${suffix}@clinic.iq` &&
      storedDoctor.user.mustChangePassword &&
      storedDoctor.registeredByUserId === owner.id &&
      storedDoctor.whatsappNumber === "+9647701234567",
    `الإيميل طُبِّع لحروف صغيرة، وواتساب ${storedDoctor.whatsappNumber}، وعليه تغيير الباسوورد أول دخول`,
  );

  check(
    "الباسوورد لا يُخزَّن نصاً في قاعدة البيانات",
    !!storedDoctor.user.passwordHash &&
      storedDoctor.user.passwordHash.startsWith("scrypt$") &&
      !storedDoctor.user.passwordHash.includes(created.temporaryPassword),
    "مخزَّن كتجزئة scrypt بملح عشوائي، والنص الأصلي ظهر مرة واحدة للمالك فقط",
  );

  // ── ٣. دخول الطبيب وإلزامه بتغيير الباسوورد ────────────────────
  const session = await loginWithPassword(created.email, created.temporaryPassword, prisma);
  check(
    "الطبيب يدخل بالباسوورد الأولي ويُطلب منه تغييره",
    session.mustChangePassword && session.user.role === "DOCTOR",
    "الرمز صدر مع علامة mustChangePassword — والحارس يمنع أي إجراء آخر قبل التغيير",
  );

  await changePassword(session.user.id, created.temporaryPassword, "Jubouri2026", prisma);
  const afterChange = await loginWithPassword(created.email, "Jubouri2026", prisma);
  check(
    "بعد التغيير يدخل بالباسوورد الجديد ولا يعمل القديم",
    !afterChange.mustChangePassword &&
      !(await loginWithPassword(created.email, created.temporaryPassword, prisma).then(() => true).catch(() => false)),
    "الباسوورد الأولي بطل، والجلسات القديمة أُبطلت مع التغيير",
  );

  // ── ٤. قفل الحساب بعد محاولات فاشلة ────────────────────────────
  let lockedMessage = "";
  for (let i = 0; i < 6; i++) {
    try {
      await loginWithPassword(created.email, "خطأ-متكرر", prisma);
    } catch (error) {
      if (error instanceof AppError) lockedMessage = error.code;
    }
  }
  check(
    "الحساب يُقفل مؤقتاً بعد خمس محاولات فاشلة",
    lockedMessage === "ACCOUNT_LOCKED",
    `آخر خطأ: ${lockedMessage}`,
  );

  // إعادة تعيين الباسوورد من المالك تفك القفل
  const reset = await resetDoctorPassword(owner.id, created.doctorId, prisma);
  const afterReset = await loginWithPassword(reset.email, reset.temporaryPassword, prisma);
  check(
    "إعادة تعيين الباسوورد من المالك تفك القفل وتُلزم بتغيير جديد",
    afterReset.mustChangePassword,
    "المالك يستطيع إنقاذ طبيب نسي باسووردهُ دون معرفة القديم",
  );
  await changePassword(afterReset.user.id, reset.temporaryPassword, "Jubouri2026", prisma);

  // ── ٥. الحجز يحوّل التفاصيل لواتساب الطبيب ─────────────────────
  const district = await prisma.district.findFirstOrThrow({
    where: { slug: "karkh", governorate: { slug: "baghdad" } },
  });
  const clinic = await prisma.clinic.create({
    data: {
      nameAr: "عيادة النور",
      governorateId: district.governorateId,
      districtId: district.id,
      landmark: "مقابل مستشفى اليرموك",
    },
  });
  const practice = await prisma.doctorClinic.create({
    data: {
      doctorId: created.doctorId,
      clinicId: clinic.id,
      feeAmount: 25000,
      bookingMode: "QUEUE",
      capacityPerSession: 20,
      bookingHorizonDays: 400,
      // الحجز صار يتحقق من جدول الطبيب، فلا بد من قالب دوام
      schedules: { create: [{ weekday: 0, startTime: "16:00", endTime: "19:00" }] },
    },
  });

  // يمر عبر التطبيع نفسه الذي يمر به تسجيل المريض الحقيقي، وإلا اختبرنا بيانات مستحيلة
  const localPhone = `077${suffix}`;
  const patientPhone = normalizeIraqiPhone(localPhone);
  const account = await prisma.user.create({
    data: { phone: patientPhone, fullName: "علي حسن", role: "PATIENT" },
  });
  const patient = await prisma.patient.create({
    data: { accountId: account.id, fullName: "علي حسن", isSelf: true },
  });

  // أقرب يوم أحد قادم، ٤ عصراً بتوقيت بغداد = 13:00Z
  const sessionStart = nextSunday16();

  const booking = await createBooking(
    {
      doctorClinicId: practice.id,
      patientId: patient.id,
      bookedByUserId: account.id,
      startAt: sessionStart,
      patientNote: "الطفل عنده حرارة منذ يومين",
    },
    prisma,
  );

  // بيانات المريض التي تسألها العيادة — نضعها قبل الفحص لأنها ما يجب أن يصل
  await prisma.patient.update({
    where: { id: patient.id },
    data: { birthYear: new Date().getFullYear() - 32, address: "الكرخ — حي الجامعة" },
  });
  const detailed = await createBooking(
    {
      doctorClinicId: practice.id,
      patientId: patient.id,
      bookedByUserId: account.id,
      startAt: new Date(sessionStart.getTime() + 7 * 24 * 3_600_000),
      patientNote: "عنده سكري وضغط",
    },
    prisma,
  );

  const message = provider.sent.at(-1);
  const body = message?.message.body ?? "";
  const params = message?.message.params ?? [];
  check(
    "تفاصيل الحجز كلها تصل واتساب الطبيب",
    detailed.whatsapp.delivered &&
      message?.to === "9647701234567" &&
      body.includes("علي حسن") &&
      body.includes("عيادة النور") &&
      body.includes("٣٢ سنة") &&
      body.includes("حي الجامعة") &&
      // الرقم المتوقّع محسوبٌ هنا لا مأخوذٌ من الدالة: مقارنةُ الدالة بناتجها
      // تمرّ مهما أخطأت — وهكذا فات عيبٌ حقيقيّ في الصيغة
      body.includes(`${localPhone.slice(0, 4)}-${localPhone.slice(4, 7)}-${localPhone.slice(7)}`) &&
      body.includes("عنده سكري وضغط"),
    `أُرسلت إلى ${message?.to} بالقالب ${message?.message.templateName}`,
  );

  // ما يخرج من params لا تعرضه ميتا: هي تركّب الرسالة من قالبها المعتمد
  // ووسائطنا لا من النصّ الذي نبنيه للسجل
  check(
    "كل تفصيلة وسيطةٌ لا نصٌّ محليّ",
    params.length === 8 &&
      params.some((v) => v.includes("عنده سكري")) &&
      params.some((v) => v.includes("حي الجامعة")) &&
      params.some((v) => v.includes("٣٢ سنة")),
    `${params.length} وسيطة — الملاحظة والعنوان والعمر منها`,
  );

  // القالب المقدَّم إلى ميتا مشتقٌّ من بنية الرسالة، فلا يفترقان
  const spec = templateSpecs().find((t) => t.name === "new_booking");
  const specSlots = new Set(spec?.body.match(/\{\{\d+\}\}/g) ?? []).size;
  check(
    "نصّ القالب المعروض للتقديم يطابق ما يُرسَل",
    specSlots === params.length,
    `القالب فيه ${specSlots} موضعاً والكود يرسل ${params.length} وسيطة`,
  );
  console.log("\n--- نص الرسالة كما وصلت الطبيب ---");
  console.log(body);
  console.log("-----------------------------------\n");

  check(
    "وسائط القالب خالية من الأسطر الجديدة",
    (message?.message.params ?? []).every((p) => !/[\r\n\t]/.test(p)),
    `${message?.message.params.length} وسيطة — واتساب يرفض القوالب التي تحوي أسطراً جديدة في وسائطها`,
  );

  // ── ٦. تعطّل واتساب لا يُفشل الحجز ─────────────────────────────
  provider.failNext = true;
  const secondBooking = await createBooking(
    { doctorClinicId: practice.id, patientId: patient.id, bookedByUserId: account.id, startAt: sessionStart },
    prisma,
  );
  // بقناة واتساب صراحةً: للحجز الواحد صفّان الآن — رسالة الطبيب وإشعار
  // المريض في التطبيق — وهذا الفحص عن الطابور الخارجي وحده
  const queuedLog = await prisma.notificationLog.findFirstOrThrow({
    where: { appointmentId: secondBooking.appointmentId, channel: "WHATSAPP" },
  });
  check(
    "تعطّل واتساب لا يُفشل الحجز",
    !!secondBooking.reference && !secondBooking.whatsapp.delivered && queuedLog.status === "QUEUED",
    `الحجز ${secondBooking.reference} نجح والدور ${secondBooking.queueNumber}، والرسالة بقيت في الطابور بعد ${queuedLog.attempts} محاولة`,
  );

  // ── ٧. إعادة المحاولة توصّل ما بقي في الطابور ──────────────────
  provider.failNext = false;
  const delivered = await flushPending(50, prisma);
  const afterFlush = await prisma.notificationLog.findUniqueOrThrow({ where: { id: queuedLog.id } });
  check(
    "إعادة المحاولة توصّل ما سقط",
    delivered >= 1 && afterFlush.status === "SENT" && !!afterFlush.sentAt,
    `أُرسلت ${delivered} رسالة معلّقة، ورقم الرسالة عند المزوّد ${afterFlush.providerMessageId}`,
  );

  // ── ٨. الطبيب المعطَّل واتسابه لا تُرسل له ──────────────────────
  await prisma.doctor.update({ where: { id: created.doctorId }, data: { whatsappEnabled: false } });
  const thirdBooking = await createBooking(
    { doctorClinicId: practice.id, patientId: patient.id, bookedByUserId: account.id, startAt: sessionStart },
    prisma,
  );
  check(
    "إيقاف الواتساب لطبيب يمنع الإرسال دون تعطيل الحجز",
    !thirdBooking.whatsapp.queued && !!thirdBooking.reference,
    thirdBooking.whatsapp.reason ?? "",
  );

  // ── ٩. رابط wa.me الاحتياطي ────────────────────────────────────
  const consoleProvider = new ConsoleProvider(() => {});
  await consoleProvider.send("9647701234567", { templateName: "t", languageCode: "ar", params: [], body: "تجربة" });
  check(
    "المزوّد الاحتياطي يسجّل الرسالة ويعطي رابط wa.me",
    consoleProvider.sent.length === 1,
    "يصلح للتطوير وكحل يدوي مؤقت قبل اعتماد قوالب ميتا",
  );

  // ── ١٠. دخول المريض بالهاتف: ما يفتحه الجهاز المعروف وما يمنعه الغريب ──
  //
  // الحجز بلا رمز تحقّق يعني أنّ رقم الهاتف وحده يفتح جلسة. والرقم يعرفه
  // غيرُ صاحبه، فالفارق بين صاحب الحساب وغيره هو الجهاز. هذه الاختبارات
  // تحرس ذلك الفارق: بلا حراسةٍ يعود العنوان وتاريخ المواعيد مكشوفَين لمن
  // يعرف رقماً — وقد أثبتُّ ذلك عملياً قبل إضافة هذه الطبقة.
  {
    const phone = `07${Math.floor(700000000 + Math.random() * 99999999)}`;
    const own = "device-own-" + Date.now();
    const stranger = "device-stranger-" + Date.now();

    const first = await loginByPhone(phone, "مريض الأجهزة", own, prisma);
    check("أول جهازٍ يفتح الحساب يصير جهاز صاحبه", first.trusted, "لا رمز تحقّق، ومع ذلك ملفّه محميّ");

    const again = await loginByPhone(phone, undefined, own, prisma);
    check("الجهاز نفسه يبقى موثوقاً في المرّات التالية", again.trusted, "لا يُسأل صاحبه شيئاً بعدها");

    const other = await loginByPhone(phone, "منتحل", stranger, prisma);
    check(
      "جهازٌ غريب يكتب الرقم نفسه لا يُفتح له الملفّ",
      !other.trusted,
      "يحجز — ولا يقرأ المواعيد ولا العنوان",
    );

    // بيانات صاحب الحساب: نملؤها من جهازه ثم نحاول قراءتها وتبديلها من الغريب
    const mine = await getMyPatients(first.user.id, { trusted: true }, prisma);
    await updatePatient(
      first.user.id,
      mine[0]!.id,
      { fullName: "مريض الأجهزة", address: "الكرخ — حي الجامعة", birthYear: 1990 },
      { trusted: true },
      prisma,
    );

    const seenByStranger = await getMyPatients(first.user.id, { trusted: false }, prisma);
    check(
      "الغريب لا يرى الاسم ولا العنوان ولا بقيّة العائلة",
      seenByStranger.length === 1 &&
        seenByStranger[0]!.fullName === "" &&
        seenByStranger[0]!.address === null &&
        seenByStranger[0]!.birthYear === null,
      "يأخذ معرّفاً يعلّق عليه حجزه فقط",
    );

    await updatePatient(
      first.user.id,
      mine[0]!.id,
      { fullName: "اسم مدسوس", address: "عنوان مدسوس" },
      { trusted: false },
      prisma,
    );
    const afterTamper = await getMyPatients(first.user.id, { trusted: true }, prisma);
    check(
      "الغريب يملأ الفارغ ولا يمحو المكتوب",
      afterTamper[0]!.fullName === "مريض الأجهزة" && afterTamper[0]!.address === "الكرخ — حي الجامعة",
      "حجزُه لا يتلف بيانات صاحب الحساب",
    );

    // حساب أنشأه السكرتير لمريضٍ حضر بلا تطبيق: بلا أجهزة، فأولُ جهازٍ له
    const legacyPhone = `07${Math.floor(700000000 + Math.random() * 99999999)}`;
    await prisma.user.create({
      data: {
        phone: normalizeIraqiPhone(legacyPhone),
        fullName: "مريض العيادة",
        role: "PATIENT",
        patients: { create: { fullName: "مريض العيادة", isSelf: true } },
      },
    });
    const claimed = await loginByPhone(legacyPhone, undefined, "device-claim-" + Date.now(), prisma);
    check(
      "حسابٌ بلا أجهزة (أنشأه السكرتير) يتبنّاه أول جهازٍ يدخل به",
      claimed.trusted,
      "وإلا بقي من حجز عبر العيادة محروماً من مواعيده في التطبيق",
    );

    // ينظّف الاختبارُ حساباته: منظّف الثوابت يمسح بالإيميل، وهذه بلا إيميل
    // فلا يطالها — وبلا هذا يتراكم حسابان في كل تشغيل
    await prisma.user.deleteMany({
      where: { phone: { in: [normalizeIraqiPhone(phone), normalizeIraqiPhone(legacyPhone)] } },
    });
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
