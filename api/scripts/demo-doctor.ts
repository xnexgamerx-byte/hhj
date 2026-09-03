/**
 * طبيبٌ تجريبيّ بحجوزات اليوم — لتجربة لوحة العيادة في الجوال.
 *
 *   npm run demo:doctor
 *
 * ثم في التطبيق: حسابي ← «طبيب أو سكرتير؟ ادخل من هنا»
 *   demo.doctor@clinic.iq / Demo123456
 *
 * آمنٌ للتكرار: يعيد ضبط الباسوورد إن كان الحساب موجوداً، ولا يكرّر حجزاً
 * على وقتٍ محجوز — القيد الفريد يرفضه ونتخطّاه.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";
import { createBooking } from "../src/modules/booking/booking.service.js";
import { utcToZonedDateISO, zonedToUtc } from "../src/lib/timezone.js";

const prisma = new PrismaClient();
const email = "demo.doctor@clinic.iq";

async function main() {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const district = await prisma.district.findFirstOrThrow({ where: { slug: "karkh" } });
    const specialty = await prisma.specialty.findFirstOrThrow({ where: { slug: "cardiology" } });
    user = await prisma.user.create({
      // اسمٌ وعيادةٌ لا يشبهان ما تزرعه البذرة: طبيبان باسمٍ واحد في قائمة
      // البحث يبدوان عطلاً لا بيانات عرض
      data: { email, fullName: "ليلى الحيدري", role: "DOCTOR", passwordHash: await hashPassword("Demo123456") },
    });
    const doctor = await prisma.doctor.create({
      data: {
        userId: user.id, title: "د.", isPublished: true, isActive: true, whatsappNumber: "+9647701234567",
        specialties: { create: [{ specialtyId: specialty.id, isPrimary: true }] },
      },
    });
    const clinic = await prisma.clinic.create({
      data: { nameAr: "مركز النبض للقلبية", governorateId: district.governorateId, districtId: district.id, landmark: "قرب مستشفى ابن البيطار" },
    });
    await prisma.doctorClinic.create({
      data: {
        doctorId: doctor.id, clinicId: clinic.id, feeAmount: 35000, bookingMode: "SLOT", slotMinutes: 20,
        schedules: { create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "08:00", endTime: "22:00" })) },
      },
    });
  } else {
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword("Demo123456"), mustChangePassword: false } });
  }

  const practice = await prisma.doctorClinic.findFirstOrThrow({ where: { doctor: { userId: user.id } } });
  const people = [
    { name: "أحمد الجبوري", phone: "+9647701110001", age: 32, addr: "الكرخ — حي الجامعة، محلة ٦٣٠", note: "سكري · ضغط" },
    { name: "زينب حسين", phone: "+9647701110002", age: 45, addr: "الرصافة — الكرادة داخل", note: "ألم في الصدر منذ ثلاثة أيام" },
    { name: "مصطفى كريم", phone: "+9647701110003", age: 27, addr: "الكاظمية — شارع ٢٠", note: null },
  ];

  const now = new Date();
  let made = 0;
  for (const [i, p] of people.entries()) {
    let acc = await prisma.user.findUnique({ where: { phone: p.phone } });
    if (!acc) {
      acc = await prisma.user.create({
        data: { phone: p.phone, fullName: p.name, role: "PATIENT", patients: { create: { fullName: p.name, isSelf: true } } },
      });
    }
    const patient = await prisma.patient.findFirstOrThrow({ where: { accountId: acc.id } });
    await prisma.patient.update({
      where: { id: patient.id },
      data: { birthYear: new Date().getFullYear() - p.age, address: p.addr, phone: p.phone },
    });
    // أوقاتٌ داخل دوام العيادة بتوقيت بغداد لا بتوقيت الخادم
    const today = utcToZonedDateISO(now, "Asia/Baghdad");
    const at = zonedToUtc(today, ["10:00", "10:20", "10:40"][i], "Asia/Baghdad");
    try {
      await createBooking(
        { doctorClinicId: practice.id, patientId: patient.id, bookedByUserId: acc.id, startAt: at, patientNote: p.note },
        prisma,
      );
      made++;
    } catch (error) {
      console.log("تخطّي:", (error as Error).message);
    }
  }
  console.log(`جاهز — ${email} / Demo123456 · حجوزات جديدة: ${made}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
