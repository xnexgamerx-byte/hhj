/**
 * يمنح الحجوزات السابقة رقمها اليومي.
 *
 *   npm run db:numbers
 *
 * الترقيم أُضيف بعد أن صار في القاعدة حجوزات، وصفوفها تحمل NULL. الترحيل
 * هنا لا في `db push` لأنه ليس تغييراً في الشكل بل حسابٌ يعتمد ترتيب الحجز
 * وتوقيت كل عيادة على حدة — وهذا لا يُكتب في SQL مُولَّد.
 *
 * آمنٌ للتكرار: لا يمسّ صفاً له رقم، ويبدأ من أعلى رقمٍ موجود في كل يوم.
 */
import { prisma } from "../src/lib/prisma.js";
import { utcToZonedDateISO } from "../src/lib/timezone.js";

async function main() {
  const pending = await prisma.appointment.findMany({
    where: { dailyNumber: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      doctorClinicId: true,
      sessionStart: true,
      doctorClinic: { select: { clinic: { select: { timezone: true } } } },
    },
  });

  if (pending.length === 0) {
    console.log("كل الحجوزات مرقّمة — لا شيء يُفعل.");
    return;
  }

  // أعلى رقمٍ مستعملٍ في كل (عيادة، يوم) كي لا نصطدم بصفوفٍ رُقّمت في تشغيلٍ سابق
  const highest = new Map<string, number>();
  let numbered = 0;

  for (const appointment of pending) {
    const serviceDate = utcToZonedDateISO(appointment.sessionStart, appointment.doctorClinic.clinic.timezone);
    const key = `${appointment.doctorClinicId}|${serviceDate}`;

    if (!highest.has(key)) {
      const top = await prisma.appointment.aggregate({
        where: { doctorClinicId: appointment.doctorClinicId, serviceDate },
        _max: { dailyNumber: true },
      });
      highest.set(key, top._max.dailyNumber ?? 0);
    }

    const next = highest.get(key)! + 1;
    highest.set(key, next);
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { serviceDate, dailyNumber: next },
    });
    numbered += 1;
  }

  console.log(`رُقّم ${numbered} حجزاً في ${highest.size} يوم عيادة.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
