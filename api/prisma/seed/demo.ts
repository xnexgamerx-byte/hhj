/**
 * بيانات تجريبية: أطباء وعيادات ودوام وتقييمات في بغداد.
 *
 * التعبئة المرجعية وحدها تترك التطبيق فارغاً — لا طبيب فلا تخصص يظهر — فيبدو
 * المشروع معطّلاً وهو سليم. هذا الأمر يملأ ما يكفي لتجربة كل شاشة.
 *
 *   npm run db:demo          يضيف ما ينقص ولا يكرّر
 *   npm run db:demo -- --clean   يحذف بيانات العرض أولاً
 *
 * كلّها موسومة بـ demo. في البريد الإلكتروني فلا تختلط بأطباء حقيقيين.
 */
import { PrismaClient, type BookingMode } from "@prisma/client";
import { hashPassword } from "../../src/lib/password.js";

const prisma = new PrismaClient();

/** يميّز صفوف العرض عن الحقيقية في كل عمليات الحذف والبحث */
const DEMO_TAG = "demo.mawid";
const DEMO_PASSWORD = "DemoDoctor2026";

type Seed = {
  name: string;
  specialty: string;
  clinic: string;
  district: string;
  landmark: string;
  fee: number;
  years: number;
  mode: BookingMode;
  ratings: number[];
  hours: [string, string];
};

const PEOPLE: Seed[] = [
  { name: "سارة العبيدي", specialty: "cardiology", clinic: "مركز القلب التخصصي", district: "الكرادة", landmark: "قرب مستشفى ابن البيطار", fee: 35000, years: 14, mode: "SLOT", ratings: [5, 5, 4, 5, 5], hours: ["16:00", "21:00"] },
  { name: "مصطفى الجبوري", specialty: "orthopedics", clinic: "عيادة العظام الحديثة", district: "المنصور", landmark: "شارع ١٤ رمضان", fee: 30000, years: 11, mode: "SLOT", ratings: [5, 4, 5, 4], hours: ["09:00", "14:00"] },
  { name: "نور الحسيني", specialty: "pediatrics", clinic: "عيادة الأطفال", district: "زيونة", landmark: "مقابل حديقة زيونة", fee: 20000, years: 8, mode: "QUEUE", ratings: [5, 5, 5, 4, 5, 5], hours: ["10:00", "20:00"] },
  { name: "أحمد الربيعي", specialty: "dentistry", clinic: "مركز الابتسامة لطب الأسنان", district: "الجادرية", landmark: "قرب جامعة بغداد", fee: 25000, years: 6, mode: "SLOT", ratings: [4, 4, 5], hours: ["15:00", "21:00"] },
  { name: "زينب الكعبي", specialty: "dermatology", clinic: "عيادة الجلدية والتجميل", district: "الأعظمية", landmark: "شارع عمر بن عبد العزيز", fee: 28000, years: 9, mode: "SLOT", ratings: [5, 4], hours: ["16:00", "20:00"] },
  { name: "علي الساعدي", specialty: "ophthalmology", clinic: "مركز العيون التخصصي", district: "الكاظمية", landmark: "قرب المستشفى التعليمي", fee: 22000, years: 17, mode: "SLOT", ratings: [4, 5, 5, 5], hours: ["09:00", "13:00"] },
  { name: "هدى الزبيدي", specialty: "obgyn", clinic: "عيادة النسائية والتوليد", district: "الحارثية", landmark: "قرب ساحة الفردوس", fee: 32000, years: 12, mode: "SLOT", ratings: [5, 5, 5], hours: ["17:00", "21:00"] },
  { name: "كرار الموسوي", specialty: "neurology", clinic: "عيادة الدماغ والأعصاب", district: "الدورة", landmark: "الشارع العام", fee: 40000, years: 20, mode: "SLOT", ratings: [], hours: ["16:00", "20:00"] },
  { name: "رنا العامري", specialty: "ent", clinic: "عيادة الأنف والأذن والحنجرة", district: "الشعب", landmark: "قرب ملعب الشعب", fee: 24000, years: 7, mode: "QUEUE", ratings: [4, 4, 4], hours: ["10:00", "15:00"] },
  { name: "حسن التميمي", specialty: "internal-medicine", clinic: "عيادة الباطنية", district: "الغزالية", landmark: "قرب سوق الغزالية", fee: 20000, years: 15, mode: "SLOT", ratings: [5, 4, 4, 5], hours: ["09:00", "14:00"] },
  { name: "مريم الخفاجي", specialty: "endocrinology", clinic: "مركز السكري والغدد", district: "اليرموك", landmark: "مقابل مستشفى اليرموك", fee: 30000, years: 10, mode: "SLOT", ratings: [5, 5, 4], hours: ["16:00", "20:00"] },
  { name: "عمر الدليمي", specialty: "general-practice", clinic: "عيادة الرعاية العامة", district: "البياع", landmark: "الشارع التجاري", fee: 15000, years: 5, mode: "QUEUE", ratings: [4, 5], hours: ["09:00", "21:00"] },
];

async function clean() {
  const users = await prisma.user.findMany({
    where: { email: { contains: DEMO_TAG } },
    select: { id: true },
  });
  if (users.length === 0) return 0;

  const doctors = await prisma.doctor.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
    select: { id: true },
  });
  const doctorIds = doctors.map((d) => d.id);
  const practices = await prisma.doctorClinic.findMany({
    where: { doctorId: { in: doctorIds } },
    select: { id: true, clinicId: true },
  });

  // الترتيب مهم: المفاتيح الأجنبية تمنع حذف الطبيب قبل ما يشير إليه
  await prisma.commission.deleteMany({ where: { doctorId: { in: doctorIds } } });
  await prisma.review.deleteMany({ where: { doctorId: { in: doctorIds } } });
  await prisma.appointment.deleteMany({ where: { doctorClinicId: { in: practices.map((p) => p.id) } } });
  await prisma.doctor.deleteMany({ where: { id: { in: doctorIds } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.clinic.deleteMany({ where: { id: { in: practices.map((p) => p.clinicId) } } });
  return doctors.length;
}

async function main() {
  if (process.argv.includes("--clean")) {
    const removed = await clean();
    console.log(`حُذف ${removed} طبيب عرض وما يتبعهم.`);
  }

  const governorate = await prisma.governorate.findFirst({ where: { slug: "baghdad" } });
  if (!governorate) throw new Error("لم أجد بغداد — شغّل npm run db:seed أولاً");
  const districts = await prisma.district.findMany({ where: { governorateId: governorate.id } });
  if (districts.length === 0) throw new Error("لا أقضية في بغداد — شغّل npm run db:seed أولاً");

  let added = 0;
  let skipped = 0;

  for (const [index, person] of PEOPLE.entries()) {
    const email = `${person.specialty}.${DEMO_TAG}.iq`;
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      skipped++;
      continue;
    }

    const specialty = await prisma.specialty.findFirst({ where: { slug: person.specialty } });
    if (!specialty) continue;
    // القضاء بالاسم إن وُجد، وإلا نوزّعهم على الموجود كي لا تتكدّس العيادات في قضاء واحد
    const district =
      districts.find((d) => d.nameAr === person.district) ?? districts[index % districts.length];

    const user = await prisma.user.create({
      data: {
        email,
        fullName: person.name,
        role: "DOCTOR",
        passwordHash: await hashPassword(DEMO_PASSWORD),
        mustChangePassword: false,
      },
    });

    const rated = person.ratings.length;
    const doctor = await prisma.doctor.create({
      data: {
        userId: user.id,
        yearsOfExperience: person.years,
        whatsappNumber: "+9647700000000",
        bio: `اختصاص ${specialty.nameAr} — خبرة ${person.years} سنة في ${person.clinic}.`,
        ratingAvg: rated ? person.ratings.reduce((a, b) => a + b, 0) / rated : 0,
        ratingCount: rated,
        specialties: { create: [{ specialtyId: specialty.id, isPrimary: true }] },
      },
    });

    const clinic = await prisma.clinic.create({
      data: {
        nameAr: person.clinic,
        governorateId: governorate.id,
        districtId: district.id,
        landmark: person.landmark,
      },
    });

    await prisma.doctorClinic.create({
      data: {
        doctorId: doctor.id,
        clinicId: clinic.id,
        feeAmount: person.fee,
        commissionAmount: 2000,
        bookingMode: person.mode,
        slotMinutes: 20,
        capacityPerSession: 20,
        bookingHorizonDays: 30,
        // ستة أيام: الجمعة عطلة — أقرب إلى الواقع من دوام على مدار الأسبوع
        schedules: {
          create: [0, 1, 2, 3, 4, 6].map((weekday) => ({
            weekday,
            startTime: person.hours[0],
            endTime: person.hours[1],
          })),
        },
      },
    });
    added++;
  }

  console.log(`أُضيف ${added} طبيب${skipped ? ` · تُخطّي ${skipped} موجود مسبقاً` : ""}.`);
  if (added > 0) {
    console.log(`دخول أي طبيب عرض: <التخصص>.${DEMO_TAG}.iq / ${DEMO_PASSWORD}`);
    console.log("مثال: cardiology." + DEMO_TAG + ".iq");
  }
}

main()
  .catch((error) => {
    console.error("فشلت بيانات العرض:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
