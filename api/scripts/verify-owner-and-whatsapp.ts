/**
 * التحقق من المسارين الجديدين:
 *   ١. المالك يسجّل الطبيب وينشئ له حساباً برقمه وباسوورد أوليّ
 *   ٢. تفاصيل الحجز تتحول لواتساب الطبيب
 *
 * التشغيل: npx tsx scripts/verify-owner-and-whatsapp.ts
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";
import { formatIraqiPhoneForDisplay, normalizeIraqiPhone, toLatinDigits } from "../src/lib/phone.js";
import { templateSpecs } from "../src/notifications/whatsapp/templates.js";
import { AppError } from "../src/lib/errors.js";
import { createDoctorAccount, resetDoctorPassword, updateDoctorProfile } from "../src/modules/owner/provisioning.js";
import { changePassword, loginByPhone, loginWithPassword, refreshSession } from "../src/modules/auth/auth.service.js";
import { getDoctorProfile, getMyPatients, updatePatient } from "../src/modules/discovery/discovery.service.js";
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
  /** يحاكي مزوّداً حقيقياً: نجاحه يعني وصول الرسالة فعلاً */
  readonly automatic = true;
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
  const doctorPhone = `077${suffix}`;
  const created = await createDoctorAccount(owner.id, {
    fullName: "أحمد الجبوري",
    phone: doctorPhone,
    whatsappNumber: "٠٧٧٠١٢٣٤٥٦٧",
    title: "د.",
    specialtyIds: [specialty.id],
  }, prisma);

  const storedDoctor = await prisma.doctor.findUniqueOrThrow({
    where: { id: created.doctorId },
    include: { user: true },
  });
  check(
    "المالك ينشئ حساب الطبيب برقم هاتفه وباسوورد أولي",
    storedDoctor.user.phone === normalizeIraqiPhone(doctorPhone) &&
      storedDoctor.user.mustChangePassword &&
      storedDoctor.registeredByUserId === owner.id &&
      storedDoctor.whatsappNumber === "+9647701234567",
    `يدخل بـ${storedDoctor.user.phone} بلا إيميل، وواتساب ${storedDoctor.whatsappNumber}، وعليه تغيير الباسوورد أول دخول`,
  );

  check(
    "الباسوورد لا يُخزَّن نصاً في قاعدة البيانات",
    !!storedDoctor.user.passwordHash &&
      storedDoctor.user.passwordHash.startsWith("scrypt$") &&
      !storedDoctor.user.passwordHash.includes(created.temporaryPassword),
    "مخزَّن كتجزئة scrypt بملح عشوائي، والنص الأصلي ظهر مرة واحدة للمالك فقط",
  );

  // ── ٣. دخول الطبيب وإلزامه بتغيير الباسوورد ────────────────────
  const session = await loginWithPassword(created.phone, created.temporaryPassword, prisma);
  check(
    "الطبيب يدخل بالباسوورد الأولي ويُطلب منه تغييره",
    session.mustChangePassword && session.user.role === "DOCTOR",
    "الرمز صدر مع علامة mustChangePassword — والحارس يمنع أي إجراء آخر قبل التغيير",
  );

  await changePassword(session.user.id, created.temporaryPassword, "Jubouri2026", prisma);
  const afterChange = await loginWithPassword(created.phone, "Jubouri2026", prisma);
  check(
    "بعد التغيير يدخل بالباسوورد الجديد ولا يعمل القديم",
    !afterChange.mustChangePassword &&
      !(await loginWithPassword(created.phone, created.temporaryPassword, prisma).then(() => true).catch(() => false)),
    "الباسوورد الأولي بطل، والجلسات القديمة أُبطلت مع التغيير",
  );

  // ── ٤. قفل الحساب بعد محاولات فاشلة ────────────────────────────
  let lockedMessage = "";
  for (let i = 0; i < 6; i++) {
    try {
      await loginWithPassword(created.phone, "خطأ-متكرر", prisma);
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
  const afterReset = await loginWithPassword(reset.phone, reset.temporaryPassword, prisma);
  check(
    "إعادة تعيين الباسوورد من المالك تفك القفل وتُلزم بتغيير جديد",
    afterReset.mustChangePassword,
    "المالك يستطيع إنقاذ طبيب نسي باسووردهُ دون معرفة القديم",
  );
  await changePassword(afterReset.user.id, reset.temporaryPassword, "Jubouri2026", prisma);

  // ── ٤.١ تعديل بيانات الطبيب بعد تسجيله ─────────────────────────
  //
  // ما يُكتب يوم التسجيل ليس نهائياً: يُكتب الاسم خطأً، ويبدّل الطبيب رقمه،
  // ويُضاف تخصصه الدقيق بعد شهر. وبلا تعديلٍ لا مخرج إلا حذف الحساب وتسجيله
  // من جديد — حسابٌ جديد بلا مواعيده ولا تقييماته.
  {
    const subspecialty = await prisma.specialty.findFirstOrThrow({ where: { slug: { not: "pediatrics" } } });
    const firstPhone = `079${suffix}`;
    const editable = await createDoctorAccount(
      owner.id,
      { fullName: "سارة الخفاجى", phone: firstPhone, specialtyIds: [specialty.id] },
      prisma,
    );
    const openSession = await loginWithPassword(firstPhone, editable.temporaryPassword, prisma);

    await updateDoctorProfile(
      owner.id,
      editable.doctorId,
      {
        title: "أ.د.",
        fullName: "سارة الخفاجي",
        specialtyIds: [subspecialty.id, specialty.id],
        yearsOfExperience: 12,
        bio: "  استشارية طب الأطفال، بورد عربي  ",
      },
      prisma,
    );
    const profile = await getDoctorProfile(editable.doctorId, prisma);
    const primary = await prisma.doctorSpecialty.findFirst({ where: { doctorId: editable.doctorId, isPrimary: true } });
    check(
      "المالك يعدّل الاسم واللقب والتخصص والخبرة والنبذة، ويراها المريض فوراً",
      profile.fullName === "سارة الخفاجي" &&
        profile.title === "أ.د." &&
        profile.yearsOfExperience === 12 &&
        profile.bio === "استشارية طب الأطفال، بورد عربي" &&
        profile.specialties.length === 2 &&
        primary?.specialtyId === subspecialty.id,
      `${profile.title} ${profile.fullName} — ${profile.specialties.join(" · ")}`,
    );

    await updateDoctorProfile(owner.id, editable.doctorId, { fullName: "سارة عبد الله الخفاجي" }, prisma);
    const renamed = await getDoctorProfile(editable.doctorId, prisma);
    check(
      "الحقل الغائب من الطلب يبقى كما هو",
      renamed.fullName === "سارة عبد الله الخفاجي" &&
        renamed.title === "أ.د." &&
        renamed.bio === profile.bio &&
        renamed.yearsOfExperience === 12 &&
        renamed.specialties.length === 2,
      "تعديل الاسم وحده لا يمحو التخصص ولا النبذة",
    );

    const newPhone = `075${suffix}`;
    const moved = await updateDoctorProfile(owner.id, editable.doctorId, { phone: newPhone, whatsappNumber: "" }, prisma);
    const opens = (phone: string) =>
      loginWithPassword(phone, editable.temporaryPassword, prisma).then(() => true, () => false);
    const resumed = await refreshSession(openSession.refreshToken, prisma).then((s) => s.user.phone, () => null);
    check(
      "تغيير رقم الهاتف يغيّر رقم الدخول ويُبقي الباسوورد والجلسة القائمة",
      (await opens(newPhone)) && !(await opens(firstPhone)) && resumed === normalizeIraqiPhone(newPhone),
      `يدخل الآن بـ${moved.phone} وبالباسوورد نفسه، والرقم القديم لا يفتح الحساب`,
    );
    check(
      "الواتساب المتروك فارغاً ينتقل مع الرقم الجديد",
      moved.whatsappNumber === normalizeIraqiPhone(newPhone),
      `كان ${normalizeIraqiPhone(firstPhone)} وصار ${moved.whatsappNumber}`,
    );

    await updateDoctorProfile(
      owner.id,
      editable.doctorId,
      { whatsappNumber: "٠٧٧٠١٢٣٤٥٦٧", whatsappEnabled: false },
      prisma,
    );
    const whatsapp = await prisma.doctor.findUniqueOrThrow({
      where: { id: editable.doctorId },
      select: { whatsappNumber: true, whatsappEnabled: true },
    });
    check(
      "رقم واتساب منفصل يُحفظ، وإيقاف الإرسال لا يمحو الرقم",
      whatsapp.whatsappNumber === "+9647701234567" && !whatsapp.whatsappEnabled,
      `${whatsapp.whatsappNumber} موقوف — يعود بتفعيله بلا إعادة كتابته`,
    );

    const failure = (input: Parameters<typeof updateDoctorProfile>[2]) =>
      updateDoctorProfile(owner.id, editable.doctorId, input, prisma).then(
        () => "قُبل",
        (error) => (error instanceof AppError ? error.code : String(error)),
      );

    // رقم الطبيب الأول: حسابٌ قائم، والاسم معه يجب ألّا يُحفظ نصفَ تعديل
    const taken = await failure({ fullName: "اسم لن يُحفظ", phone: created.phone });
    const kept = await prisma.user.findUniqueOrThrow({ where: { id: editable.userId } });
    check(
      "رقمٌ يحمله حسابٌ آخر يُرفض ولا يُحفظ معه شيء",
      taken === "PHONE_TAKEN" && kept.fullName === "سارة عبد الله الخفاجي" && kept.phone === normalizeIraqiPhone(newPhone),
      `${taken} — والاسم المرسل معه لم يُحفظ`,
    );

    const rejected: string[] = [];
    for (const input of [
      { fullName: "س" },
      { yearsOfExperience: -1 },
      { yearsOfExperience: 2.5 },
      { specialtyIds: [999_999] },
      { bio: "ن".repeat(601) },
    ]) {
      rejected.push(await failure(input));
    }
    check(
      "القيم غير المعقولة تُرفض برسالةٍ لا بخطأ خادم",
      rejected.join() === "INVALID_NAME,INVALID_EXPERIENCE,INVALID_EXPERIENCE,INVALID_SPECIALTY,BIO_TOO_LONG",
      rejected.join(" · "),
    );

    const audits = await prisma.auditLog.findMany({
      where: { entityId: editable.doctorId, action: "DOCTOR_UPDATED" },
      select: { actorUserId: true },
    });
    check(
      "كل تعديلٍ ناجح يُسجَّل باسم المالك، والمرفوض لا يُسجَّل",
      audits.length === 4 && audits.every((a) => a.actorUserId === owner.id),
      `${audits.length} قيود في سجل التدقيق`,
    );

    // من سُجّل قبل الدخول بالرقم له إيميلٌ ولا رقم: التعديل لا يشترط الرقم،
    // وإضافته تفتح له الدخول به
    const legacy = await prisma.user.create({
      data: {
        email: `d.legacy.${suffix}@clinic.iq`,
        fullName: "طبيب بالإيميل",
        role: "DOCTOR",
        passwordHash: await hashPassword("Legacy2026x"),
        doctor: { create: { registeredByUserId: owner.id } },
      },
      include: { doctor: true },
    });
    await updateDoctorProfile(owner.id, legacy.doctor!.id, { fullName: "طبيب بالإيميل وحده" }, prisma);
    const stillEmailOnly = await prisma.user.findUniqueOrThrow({ where: { id: legacy.id } });
    const legacyPhone = `076${suffix}`;
    await updateDoctorProfile(owner.id, legacy.doctor!.id, { phone: legacyPhone }, prisma);
    check(
      "طبيبٌ سُجّل بإيميله يُعدَّل بلا رقم، ثم يُضاف له رقمٌ فيدخل به",
      stillEmailOnly.phone === null &&
        stillEmailOnly.fullName === "طبيب بالإيميل وحده" &&
        (await loginWithPassword(legacyPhone, "Legacy2026x", prisma).then(() => true, () => false)) &&
        (await loginWithPassword(legacy.email!, "Legacy2026x", prisma).then(() => true, () => false)),
      "يدخل بالرقم الجديد، ويبقى إيميله يعمل كما كان",
    );

    // حسابٌ بلا إيميل لا يطاله منظّف الثوابت، فيُحذف هنا — ومعه حساب الإيميل
    await prisma.user.deleteMany({ where: { id: { in: [editable.userId, legacy.id] } } });
  }

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

  // يمر عبر التطبيع نفسه الذي يمر به تسجيل المريض الحقيقي، وإلا اختبرنا بيانات مستحيلة.
  // وبادئةٌ غير بادئة الطبيب (078 لا 077): الرقم صار هوية حساب الطبيب أيضاً،
  // فلو تشاركا اللاحقة نفسها اصطدما على قيد التفرّد
  const localPhone = `078${suffix}`;
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

  // ── ٩.١ إبلاغ الطبيب من واتساب المريض حين لا يوجد إرسالٌ تلقائي ──
  //
  // قوالب ميتا تحتاج حساباً واعتماداً يأخذ أياماً، وحتى ذلك الحين لا يصل
  // الطبيبَ شيء. فالحجز يعيد رابطاً يفتح واتساب المريض والرسالة مكتوبة،
  // ويبقى عليه «إرسال» — الطبيب يُبلَّغ اليوم، ومن رقم مريضه فيردّ عليه.
  await prisma.doctor.update({ where: { id: created.doctorId }, data: { whatsappEnabled: true } });
  setWhatsAppProvider(new ConsoleProvider(() => {}));
  const manual = await createBooking(
    { doctorClinicId: practice.id, patientId: patient.id, bookedByUserId: account.id, startAt: sessionStart },
    prisma,
  );
  const link = manual.whatsapp.link ?? "";
  const decoded = decodeURIComponent(link);
  check(
    "بلا إرسالٍ تلقائي: الحجز يعيد رابط واتساب جاهزاً للمريض",
    link.startsWith("https://wa.me/") && decoded.includes("حجز جديد") && decoded.includes(String(manual.dailyNumber)),
    link.slice(0, 60) + "…",
  );

  // وحين يصل الطبيبَ إشعارٌ تلقائيّ فعلاً، لا رابط: رسالتان عن حجزٍ واحد ضجيج
  provider.failNext = false;
  setWhatsAppProvider(provider);
  const automatic = await createBooking(
    { doctorClinicId: practice.id, patientId: patient.id, bookedByUserId: account.id, startAt: sessionStart },
    prisma,
  );
  check(
    "مع الإرسال التلقائي يختفي الرابط فلا يصل الطبيب الخبر مرّتين",
    automatic.whatsapp.delivered && automatic.whatsapp.link === undefined,
    "الزرّ يظهر حيث يلزم وحده",
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
