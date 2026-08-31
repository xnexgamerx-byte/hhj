/**
 * إعادة تعيين باسوورد المالك إلى القيمة الموجودة في api/.env
 *
 * لماذا يلزم: التعبئة (db:seed) لا تمسّ باسوورد مالكٍ موجود — وهذا مقصود، كي
 * لا تُعيد تعبئةٌ عابرة باسووردَ حسابٍ يعمل عليه أحد. لكنّ الأثر الجانبي أنّ
 * تغيير الباسوورد من الواجهة يترك .env يقول شيئاً والقاعدةَ تقول غيره، فيُغلق
 * البابُ على صاحبه لو عاد إلى الملفّ. هذا السكربت هو المفتاح الاحتياطي.
 *
 * التشغيل: npm run owner:reset
 *          npm run owner:reset -- --check   ← فحصٌ صامت. يخرج بـ: ٠ يفتح والتغيير
 *          الإجباري منتظَر · ٢ يفتح بلا تغيير إجباري · ١ لا يفتح
 */
import { prisma } from "../src/lib/prisma.js";
import { hashPassword, verifyPassword } from "../src/lib/password.js";

const checkOnly = process.argv.includes("--check");

/** يطبع ويخرج بالرمز ١ — أو صامتاً في وضع الفحص، لأنّ المنادي هو من يقرّر ما يُقال */
function fail(message: string): never {
  if (!checkOnly) console.error(message);
  process.exit(1);
}

async function main() {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD;

  if (!email || !password) fail("عيّن OWNER_EMAIL وOWNER_PASSWORD في api/.env أولاً");
  // العدّ بالأحرف لا بالبايتات: باسوورد عربيّ من ١٠ أحرف يساوي ٢٠ بايت
  if ([...password].length < 10) fail("OWNER_PASSWORD يجب أن يكون ١٠ خانات على الأقل");

  const owner = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, passwordHash: true, mustChangePassword: true },
  });
  if (!owner) fail(`لا يوجد حساب بالإيميل ${email} — شغّل: npm run db:seed`);
  if (owner.role !== "OWNER") fail(`${email} ليس حساب مالك — لا يُعاد تعيينه من هنا`);

  if (checkOnly) {
    if (!(await verifyPassword(password, owner.passwordHash))) process.exit(1);
    process.exit(owner.mustChangePassword ? 0 : 2);
  }

  await prisma.user.update({
    where: { id: owner.id },
    data: {
      passwordHash: await hashPassword(password),
      // لا نطلب تغييراً إجبارياً هنا: مَن شغّل هذا السكربت هو نفسه من كتب
      // الباسوورد في .env، وإجبارُه على تغييره يعيد الملفّ والقاعدة إلى الخلاف
      // الذي جاء ليحلّه — ويكسر معه ما يقرأ الاعتمادات من .env كاختبارات e2e.
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  console.log(
    [
      "",
      "  أُعيد تعيين باسوورد المالك",
      `  الإيميل:   ${email}`,
      "  الباسوورد: القيمة الموجودة في api/.env",
      "  يعمل فوراً — بلا تغيير إجباري، لأنّك أنت من اخترته.",
      "",
    ].join("\n"),
  );
}

main()
  .catch((error) => {
    if (!checkOnly) console.error("فشل إعادة التعيين:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
