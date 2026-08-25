/**
 * ما يراه المريض: التخصصات، ثم الأطباء، ثم أوقاتهم الشاغرة.
 * لا يظهر هنا إلا طبيب منشور ونشط وله عيادة فعّالة.
 */
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/errors.js";
import { getNextAvailableDay } from "../availability/availability.service.js";

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

export type DoctorSearch = {
  governorateId?: number | null;
  districtId?: number | null;
  specialtyId?: number | null;
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

  // أقرب موعد شاغر لكل طبيب — أهم رقم في بطاقة البحث
  return Promise.all(
    doctors.map(async (doctor) => {
      const primary = doctor.practices[0];
      const nextDay = primary ? await getNextAvailableDay(primary.id, client) : null;

      return {
        id: doctor.id,
        title: doctor.title,
        fullName: doctor.user.fullName,
        photoUrl: doctor.photoUrl,
        yearsOfExperience: doctor.yearsOfExperience,
        gender: doctor.gender,
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
    }),
  );
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
    slotStart: b.slotStart.toISOString(),
    sessionStart: b.sessionStart.toISOString(),
    sessionEnd: b.sessionEnd.toISOString(),
    isUpcoming: b.lockKey === true && b.sessionEnd > now,
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
    select: { id: true, fullName: true, isSelf: true, birthYear: true, gender: true },
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
