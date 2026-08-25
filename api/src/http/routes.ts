import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "./guard.js";
import {
  changePassword,
  loginWithPassword,
  logout,
  refreshSession,
  requestOtp,
  verifyOtp,
} from "../modules/auth/auth.service.js";
import {
  createDoctorAccount,
  resetDoctorPassword,
  setDoctorActive,
  setDoctorWhatsApp,
} from "../modules/owner/provisioning.js";
import { cancelBooking, createBooking } from "../modules/booking/booking.service.js";
import { flushPending } from "../notifications/dispatch.js";
import { normalizeIraqiPhone } from "../lib/phone.js";
import { addDaysISO } from "../lib/timezone.js";
import { getAvailability } from "../modules/availability/availability.service.js";
import { getOwnerSummary } from "../modules/owner/summary.service.js";
import {
  addFamilyMember,
  getDoctorProfile,
  getMyBookings,
  getMyPatients,
  listSpecialtiesWithCounts,
  searchDoctors,
} from "../modules/discovery/discovery.service.js";
import type { ScheduleEntry } from "../modules/doctor/schedule.service.js";
import {
  addException,
  getMyAppointments,
  getMyPractices,
  listExceptions,
  removeException,
  setAppointmentStatus,
  setWeeklySchedule,
  updateBookingSettings,
} from "../modules/doctor/schedule.service.js";

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true }));

  // ── عام: بيانات مرجعية للتطبيق ────────────────────────────────
  app.get("/locations/governorates", async () => {
    return prisma.governorate.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, slug: true, nameAr: true, nameEn: true, centerLat: true, centerLng: true },
    });
  });

  app.get<{ Params: { id: string } }>("/locations/governorates/:id/districts", async (request) => {
    return prisma.district.findMany({
      where: { governorateId: Number(request.params.id), isActive: true },
      orderBy: { nameAr: "asc" },
      select: { id: true, slug: true, nameAr: true, nameEn: true },
    });
  });

  app.get("/specialties", async () => {
    return prisma.specialty.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, slug: true, nameAr: true, nameEn: true },
    });
  });

  // ── دخول المريض برقم الهاتف ───────────────────────────────────
  app.post<{ Body: { phone: string } }>("/auth/otp/request", async (request) => {
    return requestOtp(request.body.phone);
  });

  app.post<{ Body: { phone: string; code: string; fullName?: string } }>(
    "/auth/otp/verify",
    async (request) => {
      return verifyOtp(request.body.phone, request.body.code, request.body.fullName);
    },
  );

  // ── دخول الطبيب والسكرتير والمالك ─────────────────────────────
  app.post<{ Body: { email: string; password: string } }>("/auth/login", async (request) => {
    return loginWithPassword(request.body.email, request.body.password);
  });

  app.post<{ Body: { refreshToken: string } }>("/auth/refresh", async (request) => {
    return refreshSession(request.body.refreshToken);
  });

  app.post<{ Body: { refreshToken: string } }>("/auth/logout", async (request, reply) => {
    await logout(request.body.refreshToken);
    return reply.status(204).send();
  });

  // تغيير الباسوورد متاح لمن عليه تغيير إجباري، لذا يستعمل authenticate لا requireRole
  app.post<{ Body: { currentPassword: string; newPassword: string } }>(
    "/auth/password/change",
    { preHandler: authenticate },
    async (request, reply) => {
      await changePassword(request.auth!.sub, request.body.currentPassword, request.body.newPassword);
      return reply.status(204).send();
    },
  );

  // ── لوحة المالك ───────────────────────────────────────────────
  const ownerOnly = { preHandler: requireRole("OWNER") };

  app.post<{
    Body: Parameters<typeof createDoctorAccount>[1];
  }>("/owner/doctors", ownerOnly, async (request, reply) => {
    const created = await createDoctorAccount(request.auth!.sub, request.body);
    // الباسوورد الأولي يظهر هنا مرة واحدة فقط ليسلّمه المالك للطبيب
    return reply.status(201).send(created);
  });

  app.get("/owner/doctors", ownerOnly, async () => {
    return prisma.doctor.findMany({
      orderBy: { registeredAt: "desc" },
      select: {
        id: true,
        title: true,
        isActive: true,
        isPublished: true,
        whatsappNumber: true,
        whatsappEnabled: true,
        registeredAt: true,
        user: { select: { fullName: true, email: true, lastLoginAt: true, mustChangePassword: true } },
        specialties: { select: { specialty: { select: { nameAr: true } }, isPrimary: true } },
        _count: { select: { practices: true } },
      },
    });
  });

  app.post<{ Params: { id: string } }>(
    "/owner/doctors/:id/reset-password",
    ownerOnly,
    async (request) => {
      return resetDoctorPassword(request.auth!.sub, request.params.id);
    },
  );

  app.patch<{ Params: { id: string }; Body: { whatsappNumber: string | null; enabled?: boolean } }>(
    "/owner/doctors/:id/whatsapp",
    ownerOnly,
    async (request) => {
      return setDoctorWhatsApp(
        request.auth!.sub,
        request.params.id,
        request.body.whatsappNumber,
        request.body.enabled ?? true,
      );
    },
  );

  app.patch<{ Params: { id: string }; Body: { isActive: boolean } }>(
    "/owner/doctors/:id/status",
    ownerOnly,
    async (request, reply) => {
      await setDoctorActive(request.auth!.sub, request.params.id, request.body.isActive);
      return reply.status(204).send();
    },
  );

  // العيادة والممارسة: المالك يكمل بها تسجيل الطبيب، فبدون موقع وسعر ودوام
  // لا يظهر الطبيب للمرضى ولا يمكن الحجز عنده.
  app.post<{
    Body: {
      nameAr: string;
      governorateId: number;
      districtId: number;
      areaId?: number | null;
      landmark?: string | null;
      addressLine?: string | null;
      lat?: number | null;
      lng?: number | null;
      phone?: string | null;
    };
  }>("/owner/clinics", ownerOnly, async (request, reply) => {
    const body = request.body;
    const clinic = await prisma.clinic.create({
      data: {
        nameAr: body.nameAr.trim(),
        governorateId: body.governorateId,
        districtId: body.districtId,
        areaId: body.areaId ?? null,
        landmark: body.landmark ?? null,
        addressLine: body.addressLine ?? null,
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        phone: body.phone ? normalizeIraqiPhone(body.phone) : null,
      },
      select: { id: true, nameAr: true, landmark: true },
    });
    return reply.status(201).send(clinic);
  });

  app.post<{
    Params: { id: string };
    Body: {
      clinicId: string;
      feeAmount: number;
      bookingMode?: "SLOT" | "QUEUE";
      slotMinutes?: number;
      capacityPerSession?: number;
      autoConfirm?: boolean;
      whatsappNumber?: string | null;
      schedules?: { weekday: number; startTime: string; endTime: string; capacity?: number }[];
    };
  }>("/owner/doctors/:id/practices", ownerOnly, async (request, reply) => {
    const body = request.body;
    const practice = await prisma.doctorClinic.create({
      data: {
        doctorId: request.params.id,
        clinicId: body.clinicId,
        feeAmount: body.feeAmount,
        bookingMode: body.bookingMode ?? "QUEUE",
        slotMinutes: body.slotMinutes ?? 15,
        capacityPerSession: body.capacityPerSession ?? 20,
        autoConfirm: body.autoConfirm ?? true,
        whatsappNumber: body.whatsappNumber ? normalizeIraqiPhone(body.whatsappNumber) : null,
        schedules: body.schedules?.length
          ? { create: body.schedules.map((s) => ({ ...s })) }
          : undefined,
      },
      select: { id: true, bookingMode: true, feeAmount: true },
    });
    return reply.status(201).send(practice);
  });

  /** ملخص لوحة المالك */
  app.get("/owner/summary", ownerOnly, async () => getOwnerSummary());

  /** سجل رسائل الواتساب — ليرى المالك ما وصل وما لم يصل */
  app.get("/owner/notifications", ownerOnly, async () => {
    return prisma.notificationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        channel: true,
        template: true,
        toAddress: true,
        status: true,
        attempts: true,
        error: true,
        sentAt: true,
        createdAt: true,
      },
    });
  });

  app.post("/owner/notifications/flush", ownerOnly, async () => {
    return { delivered: await flushPending() };
  });

  // ── ما يراه المريض ────────────────────────────────────────────
  app.get<{ Querystring: { governorateId?: string } }>("/specialties/available", async (request) => {
    const governorateId = request.query.governorateId ? Number(request.query.governorateId) : null;
    return listSpecialtiesWithCounts(governorateId);
  });

  app.get<{
    Querystring: { governorateId?: string; districtId?: string; specialtyId?: string; q?: string };
  }>("/doctors", async (request) => {
    const q = request.query;
    return searchDoctors({
      governorateId: q.governorateId ? Number(q.governorateId) : null,
      districtId: q.districtId ? Number(q.districtId) : null,
      specialtyId: q.specialtyId ? Number(q.specialtyId) : null,
      q: q.q ?? null,
    });
  });

  app.get<{ Params: { id: string } }>("/doctors/:id", async (request) => {
    return getDoctorProfile(request.params.id);
  });

  /** الأوقات الشاغرة فقط — المحجوز لا يظهر للمريض أصلاً */
  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    "/practices/:id/availability",
    async (request) => {
      const from = request.query.from ?? new Date().toISOString().slice(0, 10);
      const to = request.query.to ?? addDaysISO(from, 13);
      return getAvailability(request.params.id, from, to, { includeTaken: false });
    },
  );

  app.get("/me/bookings", { preHandler: requireRole("PATIENT") }, async (request) => {
    return getMyBookings(request.auth!.sub);
  });

  app.get("/me/patients", { preHandler: requireRole("PATIENT") }, async (request) => {
    return getMyPatients(request.auth!.sub);
  });

  app.post<{ Body: { fullName: string; birthYear?: number; gender?: "MALE" | "FEMALE" } }>(
    "/me/patients",
    { preHandler: requireRole("PATIENT") },
    async (request, reply) => {
      const created = await addFamilyMember(request.auth!.sub, request.body);
      return reply.status(201).send(created);
    },
  );

  // ── لوحة الطبيب ───────────────────────────────────────────────
  const doctorOnly = { preHandler: requireRole("DOCTOR") };

  app.get("/doctor/me/practices", doctorOnly, async (request) => {
    return getMyPractices(request.auth!.sub);
  });

  /** يستبدل جدول الأسبوع كاملاً — ما على الشاشة هو ما يُحفظ */
  app.put<{ Params: { id: string }; Body: { entries: ScheduleEntry[] } }>(
    "/doctor/me/practices/:id/schedule",
    doctorOnly,
    async (request) => {
      return setWeeklySchedule(request.auth!.sub, request.params.id, request.body.entries ?? []);
    },
  );

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/doctor/me/practices/:id/settings",
    doctorOnly,
    async (request) => {
      return updateBookingSettings(request.auth!.sub, request.params.id, request.body);
    },
  );

  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    "/doctor/me/practices/:id/availability",
    doctorOnly,
    async (request) => {
      const from = request.query.from ?? new Date().toISOString().slice(0, 10);
      const to = request.query.to ?? addDaysISO(from, 13);
      // الطبيب يرى المحجوز أيضاً، لا الشاغر فقط
      return getAvailability(request.params.id, from, to, { includeTaken: true });
    },
  );

  app.get<{ Params: { id: string } }>("/doctor/me/practices/:id/exceptions", doctorOnly, async (request) => {
    return listExceptions(request.auth!.sub, request.params.id);
  });

  app.post<{
    Params: { id: string };
    Body: { date: string; type: "CLOSED" | "CUSTOM"; startTime?: string; endTime?: string; capacity?: number; reason?: string };
  }>("/doctor/me/practices/:id/exceptions", doctorOnly, async (request, reply) => {
    const created = await addException(request.auth!.sub, request.params.id, request.body);
    return reply.status(201).send(created);
  });

  app.delete<{ Params: { id: string } }>("/doctor/me/exceptions/:id", doctorOnly, async (request, reply) => {
    await removeException(request.auth!.sub, request.params.id);
    return reply.status(204).send();
  });

  app.get<{ Querystring: { date?: string } }>("/doctor/me/appointments", doctorOnly, async (request) => {
    const date = request.query.date ?? new Date().toISOString().slice(0, 10);
    return getMyAppointments(request.auth!.sub, date);
  });

  app.patch<{ Params: { id: string }; Body: { status: "CONFIRMED" | "NO_SHOW" | "COMPLETED" } }>(
    "/doctor/me/appointments/:id/status",
    doctorOnly,
    async (request) => {
      return setAppointmentStatus(request.auth!.sub, request.params.id, request.body.status);
    },
  );

  // ── الحجوزات ──────────────────────────────────────────────────
  app.post<{
    Body: { doctorClinicId: string; patientId: string; startAt: string; patientNote?: string };
  }>("/bookings", { preHandler: requireRole("PATIENT", "STAFF", "DOCTOR") }, async (request, reply) => {
    const body = request.body;
    const result = await createBooking({
      doctorClinicId: body.doctorClinicId,
      patientId: body.patientId,
      bookedByUserId: request.auth!.sub,
      startAt: new Date(body.startAt),
      patientNote: body.patientNote ?? null,
    });
    return reply.status(201).send(result);
  });

  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    "/bookings/:id/cancel",
    { preHandler: requireRole("PATIENT", "STAFF", "DOCTOR") },
    async (request, reply) => {
      const cancelledBy = request.auth!.role === "PATIENT" ? "PATIENT" : "CLINIC";
      await cancelBooking(
        request.params.id,
        cancelledBy,
        request.auth!.sub,
        request.body?.reason ?? null,
      );
      return reply.status(204).send();
    },
  );
}
