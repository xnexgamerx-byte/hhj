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

  // ── الحجوزات ──────────────────────────────────────────────────
  app.post<{
    Body: {
      doctorClinicId: string;
      patientId: string;
      sessionStart: string;
      sessionEnd: string;
      slotStart?: string;
      patientNote?: string;
    };
  }>("/bookings", { preHandler: requireRole("PATIENT", "STAFF", "DOCTOR") }, async (request, reply) => {
    const body = request.body;
    const result = await createBooking({
      doctorClinicId: body.doctorClinicId,
      patientId: body.patientId,
      bookedByUserId: request.auth!.sub,
      sessionStart: new Date(body.sessionStart),
      sessionEnd: new Date(body.sessionEnd),
      slotStart: body.slotStart ? new Date(body.slotStart) : undefined,
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
