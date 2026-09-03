/**
 * يمسح ما تخلّفه اختبارات التحقّق من قاعدة التطوير.
 *
 * كل تشغيلٍ لـnpm run verify أو للاختبار في المتصفّح يُنشئ أطباء وعيادات
 * بأسماءٍ مولّدة («طبيب o69842995»). تُترك عمداً — اختبارٌ ينظّف خلفه لا يترك
 * أثراً يُفحص حين يفشل — لكنّها تتراكم حتى تملأ الشاشة الرئيسية بأسماءٍ لا
 * معنى لها، فتبدو القاعدة معطوبة وهي سليمة.
 *
 * التمييز بالإيميل لا بالاسم: الإيميلات تتبع أنماطاً ثابتة كتبناها نحن في
 * السكربتات، بينما اسمٌ عربيٌّ قد يكون لطبيبٍ حقيقي.
 *
 * وهو سكربتُ حذفٍ لا يُتراجع، فله ثلاثة أقفال:
 *   • لا يعمل إلا على قاعدةٍ محلية — الإنتاج يحتاج ‎--force‎ صريحاً
 *   • لا يمسّ حساب المالك في OWNER_EMAIL مهما طابق نمطاً
 *   • ‎--dry‎ يعرض ما سيُحذف قبل أن يُحذف
 *
 *   npm run db:clean -- --dry
 *   npm run db:clean
 */
import { prisma } from "../src/lib/prisma.js";

/** أنماط الإيميلات التي تولّدها سكربتات التحقّق والاختبار وحدها */
const FIXTURE_EMAILS = [
  "ahmed.%@clinic.iq",
  "cs.%@clinic.iq",
  "d.%@clinic.iq",
  "e2e.%@clinic.iq",
  "m2e.%@clinic.iq",
  "rev.%@clinic.iq",
  "slot.%@clinic.iq",
  "st.%@clinic.iq",
  "com.%@mawid.iq",
  "own.%@mawid.iq",
  "owner.%@mawid.iq",
];

/**
 * عياداتٌ باسمٍ ثابت تُنشئها الاختبارات.
 *
 * المطابقة حرفيةٌ كاملة لا احتواء: «عيادة اختبار» اسمٌ لا يسمّي به أحدٌ
 * عيادته، أما «اختبار» وحدها فقد تقع في اسمٍ حقيقي.
 */
const FIXTURE_CLINIC_NAMES = ["عيادة اختبار", "عيادة اختبار ٢"];

/** وحساباتٌ باسمٍ ثابت كذلك — لا أحد اسمه «طبيب اختبار» */
const FIXTURE_USER_NAMES = ["طبيب اختبار", "حساب اختبار"];

const dryRun = process.argv.includes("--dry");
const force = process.argv.includes("--force");

/** قاعدةٌ على هذا الجهاز — وحدها التي يُسمح بالحذف منها بلا ‎--force‎ */
function isLocalDatabase(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "";
  } catch {
    // مسارُ مقبسٍ محلّي (unix socket) لا يُحلَّل كعنوان
    return url.includes("localhost") || url.startsWith("postgresql:///");
  }
}

async function main() {
  if (!isLocalDatabase(process.env.DATABASE_URL) && !force) {
    console.error("DATABASE_URL لا تشير إلى قاعدةٍ محلية. هذا سكربت تطوير — أضف ‎--force‎ إن كنت متأكداً.");
    process.exitCode = 1;
    return;
  }

  const users = await prisma.user.findMany({
    where: {
      OR: [
        ...FIXTURE_EMAILS.map((pattern) => {
          const [prefix, domain] = pattern.split("%");
          return { AND: [{ email: { startsWith: prefix } }, { email: { endsWith: domain } }] };
        }),
        { fullName: { in: FIXTURE_USER_NAMES } },
      ],
    },
    select: { id: true, email: true, fullName: true, role: true },
  });

  // البادئة والنهاية وحدهما فضفاضتان، فنعيد الفحص بتعبيرٍ يطابق النمط كاملاً
  const patterns = FIXTURE_EMAILS.map(
    (p) => new RegExp(`^${p.replace(/[.]/g, "\\.").replace("%", "[^@]+")}$`, "i"),
  );

  // حزامُ أمان: حساب المالك الحقيقي لا يُمَسّ مهما طابق نمطاً
  const realOwner = process.env.OWNER_EMAIL?.trim().toLowerCase();

  const doomed = users.filter((u) => {
    if (u.email && u.email.toLowerCase() === realOwner) return false;
    if (FIXTURE_USER_NAMES.includes(u.fullName)) return true;
    return Boolean(u.email) && patterns.some((re) => re.test(u.email!));
  });

  if (doomed.length === 0) {
    console.log("لا بقايا اختبارات في القاعدة.");
    return;
  }

  const ids = doomed.map((u) => u.id);
  const doctorIds = await prisma.doctor
    .findMany({ where: { userId: { in: ids } }, select: { id: true } })
    .then((rows) => rows.map((r) => r.id));

  // العيادات لا يملكها مستخدم فلا تُحذف بالتتابع — نجمعها قبل حذف أصحابها
  const practices = await prisma.doctorClinic.findMany({
    where: { doctorId: { in: doctorIds } },
    select: { id: true, clinicId: true },
  });
  const practiceIds = practices.map((p) => p.id);
  const clinicIds = [...new Set(practices.map((p) => p.clinicId))];

  const commissionWhere = { OR: [{ doctorId: { in: doctorIds } }, { clinicId: { in: clinicIds } }] };
  const settlementWhere = { OR: [{ collectedByUserId: { in: ids } }, { clinicId: { in: clinicIds } }] };
  const appointmentWhere = {
    OR: [{ doctorClinicId: { in: practiceIds } }, { bookedByUserId: { in: ids } }],
  };

  const [commissions, settlements, appointments] = await Promise.all([
    prisma.commission.count({ where: commissionWhere }),
    prisma.settlement.count({ where: settlementWhere }),
    prisma.appointment.count({ where: appointmentWhere }),
  ]);

  for (const user of doomed) console.log(`  ${user.role.padEnd(7)} ${(user.email ?? "—").padEnd(26)} ${user.fullName}`);
  console.log(
    `\n${doomed.length} حساباً، و${clinicIds.length} عيادة، و${appointments} موعداً،` +
      ` و${commissions} عمولة، و${settlements} تحصيلاً.`,
  );

  if (dryRun) {
    console.log("(--dry: لم يُحذف شيء)");
    return;
  }

  // الترتيب يتبع قيود القاعدة، وهي مانعةٌ للحذف عمداً في ثلاثة مواضع: العمولة
  // تشير إلى طبيبها، والتحصيل إلى من قبضه، والموعد إلى عيادته وإلى من حجزه.
  // كلها قيودٌ صحيحة — سجلٌّ ماليٌّ أو موعدٌ بلا صاحب لا معنى له — فنحذف
  // صفوفَ الاختبار بترتيبها لا نلتفّ على القيد. والقفل أعلاه يمنع أن يقع هذا
  // على قاعدةٍ غير محلية أصلاً.
  await prisma.$transaction([
    prisma.commission.deleteMany({ where: commissionWhere }),
    prisma.settlement.deleteMany({ where: settlementWhere }),
    prisma.appointment.deleteMany({ where: appointmentWhere }),
    prisma.user.deleteMany({ where: { id: { in: ids } } }),
    prisma.clinic.deleteMany({
      where: {
        OR: [{ id: { in: clinicIds } }, { nameAr: { in: FIXTURE_CLINIC_NAMES } }],
        practices: { none: {} },
      },
    }),
  ]);

  console.log(`حُذف ${doomed.length} حساباً وما يتبعه.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
