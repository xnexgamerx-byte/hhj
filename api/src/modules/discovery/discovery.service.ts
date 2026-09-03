/**
 * ما يراه المريض: التخصصات، ثم الأطباء، ثم أوقاتهم الشاغرة.
 * لا يظهر هنا إلا طبيب منشور ونشط وله عيادة فعّالة.
 */
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/prisma.js";
import { badRequest, forbidden, notFound } from "../../lib/errors.js";
import { getNextAvailableDays } from "../availability/availability.service.js";

/** التخصصات مع عدد الأطباء المتاحين في كل منها — تخصص بلا أطباء لا يُعرض. */
export async function listSpecialtiesWithCounts(
  governorateId: number | null,
  client: PrismaClient = defaultPrisma,
) {
  const specialties = await client.specialty.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      slug: true,
      nameAr: true,
      nameEn: true,
      _count: {
        select: {
          doctors: {
            where: {
              doctor: {
                isActive: true,
                isPublished: true,
                practices: {
                  some: {
                    isActive: true,
                    ...(governorateId ? { clinic: { governorateId, isActive: true } } : {}),
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  return specialties
    .map((s) => ({
      id: s.id,
      slug: s.slug,
      nameAr: s.nameAr,
      nameEn: s.nameEn,
      doctorCount: s._count.doctors,
    }))
    .filter((s) => s.doctorCount > 0);
}

/**
 * العيادات التي فيها أطباء متاحون، مع تخصصاتها وعدد أطبائها.
 * عيادة بلا طبيب منشور لا تُعرض — وجودها في القائمة يوحي بموعد لا يوجد.
 */
export async function listClinics(
  governorateId: number | null,
  limit = 20,
  client: PrismaClient = defaultPrisma,
) {
  const clinics = await client.clinic.findMany({
    where: {
      isActive: true,
      ...(governorateId ? { governorateId } : {}),
      practices: {
        some: { isActive: true, doctor: { isActive: true, isPublished: true } },
      },
    },
    take: limit,
    select: {
      id: true,
      nameAr: true,
      landmark: true,
      governorate: { select: { nameAr: true } },
      district: { select: { nameAr: true } },
      practices: {
        where: { isActive: true, doctor: { isActive: true, isPublished: true } },
        select: {
          feeAmount: true,
          doctor: {
            select: {
              ratingAvg: true,
              ratingCount: true,
              specialties: { select: { specialty: { select: { nameAr: true } } } },
            },
          },
        },
      },
    },
  });

  return clinics
    .map((clinic) => {
      const doctors = clinic.practices;
      // تخصصات فريدة بترتيب ظهورها — Set يحفظ الترتيب في جافاسكربت
      const specialties = [
        ...new Set(doctors.flatMap((p) => p.doctor.specialties.map((s) => s.specialty.nameAr))),
      ];
      const rated = doctors.filter((p) => p.doctor.ratingCount > 0);
      return {
        id: clinic.id,
        nameAr: clinic.nameAr,
        landmark: clinic.landmark,
        governorate: clinic.governorate.nameAr,
        district: clinic.district.nameAr,
        doctorCount: doctors.length,
        specialties: specialties.slice(0, 3),
        minFee: doctors.length ? Math.min(...doctors.map((p) => p.feeAmount)) : 0,
        ratingAvg: rated.length
          ? rated.reduce((sum, p) => sum + p.doctor.ratingAvg, 0) / rated.length
          : 0,
        ratingCount: rated.reduce((sum, p) => sum + p.doctor.ratingCount, 0),
      };
    })
    .sort((a, b) => b.doctorCount - a.doctorCount);
}

export type DoctorSearch = {
  governorateId?: number | null;
  districtId?: number | null;
  specialtyId?: number | null;
  /** أطباء عيادة بعينها — يُستعمل عند فتح عيادة من قائمة العيادات */
  clinicId?: string | null;
  /** بحث نصي في اسم الطبيب وأسماء التخصصات الشائعة */
  q?: string | null;
  limit?: number;
};

export async function searchDoctors(search: DoctorSearch, client: PrismaClient = defaultPrisma) {
  const query = search.q?.trim();

  const doctors = await client.doctor.findMany({
    where: {
      isActive: true,
      isPublished: true,
      practices: {
        some: {
          isActive: true,
          ...(search.clinicId ? { clinicId: search.clinicId } : {}),
          clinic: {
            isActive: true,
            ...(search.governorateId ? { governorateId: search.governorateId } : {}),
            ...(search.districtId ? { districtId: search.districtId } : {}),
          },
        },
      },
      ...(search.specialtyId ? { specialties: { some: { specialtyId: search.specialtyId } } } : {}),
      ...(query
        ? {
            OR: [
              { user: { fullName: { contains: query, mode: "insensitive" as const } } },
              { specialties: { some: { specialty: { nameAr: { contains: query, mode: "insensitive" as const } } } } },
              { specialties: { some: { specialty: { aliases: { has: query } } } } },
            ],
          }
        : {}),
    },
    take: search.limit ?? 50,
    include: {
      user: { select: { fullName: true } },
      specialties: { include: { specialty: { select: { nameAr: true } } } },
      practices: {
        where: { isActive: true },
        include: {
          clinic: {
            select: {
              nameAr: true,
              landmark: true,
              lat: true,
              lng: true,
              governorate: { select: { id: true, nameAr: true } },
              district: { select: { id: true, nameAr: true } },
            },
          },
        },
      },
    },
  });

  // أقرب موعد شاغر لكل طبيب — أهم رقم في بطاقة البحث.
  // دفعةً واحدة لا واحداً واحداً: النداء المنفرد يجلب لكل طبيبٍ ثلاث مرّات،
  // فخمسون طبيباً تعني مئةً وخمسين رحلةً إلى القاعدة قبل أن تظهر الصفحة.
  const nextDays = await getNextAvailableDays(
    doctors.map((doctor) => doctor.practices[0]?.id).filter((id): id is string => Boolean(id)),
    client,
  );

  return doctors.map((doctor) => {
    const primary = doctor.practices[0];
    const nextDay = primary ? (nextDays.get(primary.id) ?? null) : null;

    return {
      id: doctor.id,
      title: doctor.title,
      fullName: doctor.user.fullName,
      photoUrl: doctor.photoUrl,
      yearsOfExperience: doctor.yearsOfExperience,
      gender: doctor.gender,
      ratingAvg: doctor.ratingAvg,
      ratingCount: doctor.ratingCount,
      specialties: doctor.specialties.map((s) => s.specialty.nameAr),
      practices: doctor.practices.map((practice) => ({
        id: practice.id,
        feeAmount: practice.feeAmount,
        bookingMode: practice.bookingMode,
        clinicName: practice.clinic.nameAr,
        landmark: practice.clinic.landmark,
        lat: practice.clinic.lat,
        lng: practice.clinic.lng,
        governorate: practice.clinic.governorate.nameAr,
        governorateId: practice.clinic.governorate.id,
        district: practice.clinic.district.nameAr,
      })),
      nextAvailable: nextDay
        ? { date: nextDay.date, weekdayName: nextDay.weekdayName, freeCount: nextDay.freeCount }
        : null,
    };
  });
}

export async function getDoctorProfile(doctorId: string, client: PrismaClient = defaultPrisma) {
  const doctor = await client.doctor.findFirst({
    where: { id: doctorId, isActive: true, isPublished: true },
    include: {
      user: { select: { fullName: true } },
      specialties: { include: { specialty: { select: { nameAr: true } } } },
      practices: {
        where: { isActive: true },
        include: {
          clinic: {
            select: {
              nameAr: true,
              landmark: true,
              addressLine: true,
              phone: true,
              lat: true,
              lng: true,
              governorate: { select: { nameAr: true } },
              district: { select: { nameAr: true } },
            },
          },
          schedules: { where: { isActive: true }, orderBy: [{ weekday: "asc" }, { startTime: "asc" }] },
        },
      },
    },
  });
  if (!doctor) throw notFound("DOCTOR_NOT_FOUND", "الطبيب غير موجود");

  return {
    id: doctor.id,
    title: doctor.title,
    fullName: doctor.user.fullName,
    bio: doctor.bio,
    photoUrl: doctor.photoUrl,
    yearsOfExperience: doctor.yearsOfExperience,
    gender: doctor.gender,
    ratingAvg: doctor.ratingAvg,
    ratingCount: doctor.ratingCount,
    specialties: doctor.specialties.map((s) => s.specialty.nameAr),
    practices: doctor.practices.map((practice) => ({
      id: practice.id,
      feeAmount: practice.feeAmount,
      bookingMode: practice.bookingMode,
      slotMinutes: practice.slotMinutes,
      cancelCutoffMinutes: practice.cancelCutoffMinutes,
      clinicName: practice.clinic.nameAr,
      landmark: practice.clinic.landmark,
      addressLine: practice.clinic.addressLine,
      phone: practice.clinic.phone,
      lat: practice.clinic.lat,
      lng: practice.clinic.lng,
      governorate: practice.clinic.governorate.nameAr,
      district: practice.clinic.district.nameAr,
      schedules: practice.schedules.map((s) => ({
        weekday: s.weekday,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
    })),
  };
}

/** حجوزات المريض: القادمة والسابقة. */
export async function getMyBookings(accountId: string, client: PrismaClient = defaultPrisma) {
  const bookings = await client.appointment.findMany({
    where: { patient: { accountId } },
    orderBy: { sessionStart: "desc" },
    take: 100,
    include: {
      patient: { select: { fullName: true } },
      review: { select: { id: true } },
      doctorClinic: {
        include: {
          clinic: { select: { nameAr: true, landmark: true, phone: true } },
          doctor: { include: { user: { select: { fullName: true } } } },
        },
      },
    },
  });

  const now = new Date();
  return bookings.map((b) => ({
    id: b.id,
    reference: b.reference,
    status: b.status,
    bookingMode: b.bookingMode,
    queueNumber: b.queueNumber,
    dailyNumber: b.dailyNumber,
    slotStart: b.slotStart.toISOString(),
    sessionStart: b.sessionStart.toISOString(),
    sessionEnd: b.sessionEnd.toISOString(),
    // الحالة تسبق الوقت: زيارة أُشِّر انتهاء كشفها أو غيابها ليست «قادمة»
    // حتى لو لم يمرّ وقتها بعد — وإلا لم يظهر للمريض زر تقييمها
    isUpcoming:
      b.lockKey === true && b.sessionEnd > now && b.status !== "COMPLETED" && b.status !== "NO_SHOW",
    canReview: b.status === "COMPLETED" && b.review === null,
    patientName: b.patient.fullName,
    doctorName: `${b.doctorClinic.doctor.title} ${b.doctorClinic.doctor.user.fullName}`,
    clinicName: b.doctorClinic.clinic.nameAr,
    landmark: b.doctorClinic.clinic.landmark,
    clinicPhone: b.doctorClinic.clinic.phone,
    feeAmount: b.doctorClinic.feeAmount,
  }));
}

/** أفراد العائلة الذين يحجز لهم صاحب الحساب. */
export async function getMyPatients(accountId: string, client: PrismaClient = defaultPrisma) {
  return client.patient.findMany({
    where: { accountId },
    orderBy: [{ isSelf: "desc" }, { createdAt: "asc" }],
    select: { id: true, fullName: true, isSelf: true, birthYear: true, gender: true, phone: true, address: true },
  });
}

/**
 * يحدّث بيانات مريضٍ يتبع الحساب.
 *
 * العيادة تسأل الاسم والهاتف والعنوان والعمر في كل زيارة أولى. نسألها مرّةً
 * في أول حجز ونحفظها في المريض لا في الحجز: هي صفته لا صفة موعده، فلا تُعاد
 * كتابتها في كل مرّة. والحقل الذي لم يُرسل لا يُمسح — الشاشة قد ترسل بعضها.
 */
export async function updatePatient(
  accountId: string,
  patientId: string,
  input: { fullName?: string; phone?: string | null; address?: string | null; birthYear?: number | null; gender?: "MALE" | "FEMALE" | null },
  client: PrismaClient = defaultPrisma,
) {
  const patient = await client.patient.findUnique({ where: { id: patientId }, select: { accountId: true } });
  if (!patient) throw notFound("PATIENT_NOT_FOUND", "المريض غير موجود");
  if (patient.accountId !== accountId) throw forbidden("NOT_YOUR_PATIENT", "لا يمكنك تعديل بيانات مريض لا يتبع حسابك");

  const name = input.fullName?.trim();
  if (name !== undefined && name.length < 3) {
    throw badRequest("NAME_TOO_SHORT", "الاسم قصير جداً — اكتب الاسم كما في الهوية");
  }

  const year = input.birthYear;
  if (year !== undefined && year !== null) {
    const thisYear = new Date().getFullYear();
    // ١٢٠ سنة حدٌّ يرفض الخطأ المطبعي (١٩٠٠ بدل ١٩٩٠) ولا يرفض معمّراً
    if (!Number.isInteger(year) || year > thisYear || year < thisYear - 120) {
      throw badRequest("BAD_BIRTH_YEAR", "العمر غير معقول — راجعه");
    }
  }

  return client.patient.update({
    where: { id: patientId },
    data: {
      ...(name !== undefined ? { fullName: name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
      ...(input.address !== undefined ? { address: input.address?.trim() || null } : {}),
      ...(year !== undefined ? { birthYear: year } : {}),
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
    },
    select: { id: true, fullName: true, isSelf: true, birthYear: true, gender: true, phone: true, address: true },
  });
}

export async function addFamilyMember(
  accountId: string,
  input: { fullName: string; birthYear?: number | null; gender?: "MALE" | "FEMALE" | null },
  client: PrismaClient = defaultPrisma,
) {
  return client.patient.create({
    data: {
      accountId,
      fullName: input.fullName.trim(),
      birthYear: input.birthYear ?? null,
      gender: input.gender ?? null,
      isSelf: false,
    },
    select: { id: true, fullName: true, isSelf: true },
  });
}
