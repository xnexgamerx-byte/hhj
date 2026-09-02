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
import { createReview, listDoctorReviews, listPendingReviews, listReviewableVisits, setReviewPublished } from "../modules/reviews/reviews.service.js";
import {
  createStaffAccount,
  createWalkInBooking,
  getMyClinics,
  getScopedAppointments,
  listStaff,
  setScopedAppointmentStatus,
  setStaffActive,
  shiftSessionAppointments,
} from "../modules/staff/staff.service.js";
import {
  getClinicDues,
  getCommissionSummary,
  getDuesByClinic,
  listSettlements,
  settleClinic,
  waiveCommission,
} from "../modules/commissions/commissions.service.js";
import { runReminders } from "../modules/reminders/reminders.service.js";
import { getAvailability } from "../modules/availability/availability.service.js";
import { getOwnerSummary } from "../modules/owner/summary.service.js";
import {
  createBanner,
  deleteBanner,
  getPublicBanners,
  getRotateSeconds,
  listBanners,
  reorderBanners,
  setRotateSeconds,
  updateBanner,
  type BannerInput,
} from "../modules/owner/content.service.js";
import { removeImage, storeImage } from "../lib/uploads.js";
import { badRequest, notFound } from "../lib/errors.js";
import { countUnread, listInbox, markAllRead, markRead } from "../notifications/inbox.js";
import {
  addFamilyMember,
  updatePatient,
  getDoctorProfile,
  getMyBookings,
  getMyPatients,
  listClinics,
  listSpecialtiesWithCounts,
  searchDoctors,
} from "../modules/discovery/discovery.service.js";
import type { ScheduleEntry } from "../modules/doctor/schedule.service.js";
import {
  addException,
  getMyPractices,
  listExceptions,
  removeException,
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

  /** لافتات الشاشة الرئيسية ومدّة تبديلها — يحرّرها المالك من لوحته */
  app.get("/banners", async () => getPublicBanners());

  app.get("/specialties", async () => {
    return prisma.specialty.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, slug: true, nameAr: true, nameEn: true },
    });
  });

  // أبواب الدخول أضيق من العامّ، وأوسع مما يبدو لازماً: خلف CGNAT يشترك
  // مشتركو شبكةٍ كاملة في عنوان واحد. الحارس الحقيقي هنا ليس العنوان بل
  // قفلُ الحساب بعد محاولات فاشلة، وحدُّ الرقم في طلب الرمز — وكلاهما يميّز
  // الفاعل بعينه. هذا الحدّ يوقف الآلة التي تمرّ على آلاف الحسابات فحسب.
  const gate = { config: { rateLimit: { max: 30, timeWindow: "10 minutes" } } };
  const otpGate = { config: { rateLimit: { max: 60, timeWindow: "10 minutes" } } };

  // ── دخول المريض برقم الهاتف ───────────────────────────────────
  app.post<{ Body: { phone: string } }>("/auth/otp/request", otpGate, async (request) => {
    return requestOtp(request.body.phone);
  });

  app.post<{ Body: { phone: string; code: string; fullName?: string } }>(
    "/auth/otp/verify",
    gate,
    async (request) => {
      return verifyOtp(request.body.phone, request.body.code, request.body.fullName);
    },
  );

  // ── دخول الطبيب والسكرتير والمالك ─────────────────────────────
  app.post<{ Body: { email: string; password: string } }>("/auth/login", gate, async (request) => {
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

  app.get("/owner/clinics", ownerOnly, async () => {
    return prisma.clinic.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        nameAr: true,
        landmark: true,
        governorate: { select: { nameAr: true } },
        district: { select: { nameAr: true } },
        _count: { select: { practices: true } },
      },
    });
  });

  app.get("/owner/doctors", ownerOnly, async () => {
    return prisma.doctor.findMany({
      orderBy: { registeredAt: "desc" },
      select: {
        id: true,
        title: true,
        isActive: true,
        isPublished: true,
        photoUrl: true,
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

  /**
   * صورة الطبيب. المالك هو من يسجّل الأطباء فهو من يضع صورهم — والطبيب لا
   * يرفع صورته بنفسه كي لا تصل صورةٌ غير لائقة إلى واجهة عامة بلا مراجعة.
   */
  app.patch<{ Params: { id: string }; Body: { photoUrl: string | null } }>(
    "/owner/doctors/:id/photo",
    ownerOnly,
    async (request) => {
      const doctor = await prisma.doctor.findUnique({
        where: { id: request.params.id },
        select: { photoUrl: true },
      });
      if (!doctor) throw notFound("DOCTOR_NOT_FOUND", "الطبيب غير موجود");

      const next = request.body?.photoUrl?.trim() || null;
      const updated = await prisma.doctor.update({
        where: { id: request.params.id },
        data: { photoUrl: next },
        select: { id: true, photoUrl: true },
      });
      // الصورة القديمة تُحذف بعد نجاح التحديث لا قبله
      if (doctor.photoUrl && doctor.photoUrl !== next) await removeImage(doctor.photoUrl);
      return updated;
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
      /** عمولة المنصة على كل مريض يحضر. صفر = بلا عمولة. */
      commissionAmount?: number;
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
        commissionAmount: Math.max(0, body.commissionAmount ?? 0),
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

  // ── الصور واللافتات ──

  /**
   * رفع صورة. المالك وحده: الرفع يكتب على القرص، وأيّ دورٍ آخر يفتحه
   * يجعل تعبئة القرص عملاً يقوم به أيّ من سجّل برقم هاتف.
   */
  app.post("/owner/uploads", ownerOnly, async (request, reply) => {
    const file = await request.file();
    if (!file) throw badRequest("NO_FILE", "لم يصل ملف");
    const buffer = await file.toBuffer();
    // truncated يعني أن الحدّ أوقف القراءة — الملف ناقص فلا يُحفظ نصفه
    if (file.file.truncated) throw badRequest("FILE_TOO_LARGE", "الصورة أكبر من ٤ ميغابايت");
    const stored = await storeImage(buffer);
    return reply.status(201).send(stored);
  });

  app.get("/owner/banners", ownerOnly, async () => ({
    banners: await listBanners(),
    rotateSeconds: await getRotateSeconds(),
  }));

  app.post<{ Body: BannerInput }>("/owner/banners", ownerOnly, async (request, reply) => {
    return reply.status(201).send(await createBanner(request.body ?? {}));
  });

  app.patch<{ Params: { id: string }; Body: BannerInput }>(
    "/owner/banners/:id",
    ownerOnly,
    async (request) => updateBanner(request.params.id, request.body ?? {}),
  );

  app.delete<{ Params: { id: string } }>("/owner/banners/:id", ownerOnly, async (request, reply) => {
    await deleteBanner(request.params.id);
    return reply.status(204).send();
  });

  app.put<{ Body: { ids: string[] } }>("/owner/banners/order", ownerOnly, async (request) => {
    return reorderBanners(request.body?.ids ?? []);
  });

  app.patch<{ Body: { rotateSeconds: number } }>("/owner/settings", ownerOnly, async (request) => ({
    rotateSeconds: await setRotateSeconds(Number(request.body?.rotateSeconds)),
  }));

  // ── السكرتيرون ──
  app.get("/owner/staff", ownerOnly, async () => listStaff());

  app.post<{
    Body: {
      fullName: string;
      email: string;
      phone?: string;
      clinicId?: string;
      doctorClinicId?: string;
      canManageSchedule?: boolean;
    };
  }>("/owner/staff", ownerOnly, async (request, reply) => {
    const created = await createStaffAccount(request.auth!.sub, request.body);
    return reply.status(201).send(created);
  });

  app.patch<{ Params: { id: string }; Body: { isActive: boolean } }>(
    "/owner/staff/:id/status",
    ownerOnly,
    async (request, reply) => {
      await setStaffActive(request.auth!.sub, request.params.id, request.body.isActive);
      return reply.status(204).send();
    },
  );

  // ── مراجعة التعليقات قبل نشرها ──
  app.get("/owner/reviews/pending", ownerOnly, async () => listPendingReviews());

  app.patch<{ Params: { id: string }; Body: { isPublished: boolean } }>(
    "/owner/reviews/:id",
    ownerOnly,
    async (request) => setReviewPublished(request.params.id, request.body.isPublished),
  );

  /** تشغيل التذكيرات يدوياً — للتجربة وللتعافي بعد توقف */
  app.post("/owner/reminders/run", ownerOnly, async () => runReminders());

  // ── العمولات ──
  app.get("/owner/commissions", ownerOnly, async () => ({
    summary: await getCommissionSummary(),
    dues: await getDuesByClinic(),
  }));

  app.get<{ Params: { id: string } }>("/owner/commissions/clinics/:id", ownerOnly, async (request) => {
    return getClinicDues(request.params.id);
  });

  /** تسجيل تحصيل من عيادة — يغلق عمولاتها المستحقة دفعة واحدة */
  app.post<{ Params: { id: string }; Body: { note?: string } }>(
    "/owner/commissions/clinics/:id/settle",
    ownerOnly,
    async (request) => settleClinic(request.auth!.sub, request.params.id, request.body?.note ?? null),
  );

  app.post<{ Params: { id: string }; Body: { reason: string } }>(
    "/owner/commissions/:id/waive",
    ownerOnly,
    async (request, reply) => {
      await waiveCommission(request.auth!.sub, request.params.id, request.body.reason);
      return reply.status(204).send();
    },
  );

  app.get("/owner/settlements", ownerOnly, async () => listSettlements());

  /**
   * سجل رسائل الواتساب — ليرى المالك ما وصل وما لم يصل.
   * بقناةٍ صريحة: إشعارات صندوق التطبيق تشترك الجدول نفسه، وبلا الترشيح
   * تزحم المئة صفٍّ فتُخفي الرسائل التي جاء المالك ليتفقّدها.
   */
  app.get("/owner/notifications", ownerOnly, async () => {
    return prisma.notificationLog.findMany({
      where: { channel: { in: ["WHATSAPP", "SMS", "PUSH"] } },
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
    Querystring: {
      governorateId?: string;
      districtId?: string;
      specialtyId?: string;
      clinicId?: string;
      q?: string;
    };
  }>("/doctors", async (request) => {
    const q = request.query;
    return searchDoctors({
      governorateId: q.governorateId ? Number(q.governorateId) : null,
      districtId: q.districtId ? Number(q.districtId) : null,
      specialtyId: q.specialtyId ? Number(q.specialtyId) : null,
      clinicId: q.clinicId ?? null,
      q: q.q ?? null,
    });
  });

  app.get<{ Querystring: { governorateId?: string; limit?: string } }>("/clinics", async (request) => {
    return listClinics(
      request.query.governorateId ? Number(request.query.governorateId) : null,
      request.query.limit ? Number(request.query.limit) : undefined,
    );
  });

  app.get<{ Params: { id: string } }>("/doctors/:id", async (request) => {
    return getDoctorProfile(request.params.id);
  });

  app.get<{ Params: { id: string } }>("/doctors/:id/reviews", async (request) => {
    return listDoctorReviews(request.params.id);
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

  // ── صندوق الإشعارات ──

  app.get<{ Querystring: { limit?: string } }>(
    "/me/notifications",
    { preHandler: requireRole("PATIENT") },
    async (request) => listInbox(request.auth!.sub, Number(request.query.limit) || 50),
  );

  /** عدّاد وحده — تقرأه الشاشة الرئيسية في كل فتحة، فلا داعي لجرّ القائمة */
  app.get("/me/notifications/unread", { preHandler: requireRole("PATIENT") }, async (request) => ({
    unread: await countUnread(request.auth!.sub),
  }));

  app.post("/me/notifications/read", { preHandler: requireRole("PATIENT") }, async (request) =>
    markAllRead(request.auth!.sub),
  );

  app.post<{ Params: { id: string } }>(
    "/me/notifications/:id/read",
    { preHandler: requireRole("PATIENT") },
    async (request) => markRead(request.auth!.sub, request.params.id),
  );

  /** الزيارات التي يستطيع المريض تقييمها الآن */
  app.get("/me/reviewable", { preHandler: requireRole("PATIENT") }, async (request) => {
    return listReviewableVisits(request.auth!.sub);
  });

  app.post<{ Body: { appointmentId: string; rating: number; comment?: string } }>(
    "/reviews",
    { preHandler: requireRole("PATIENT") },
    async (request, reply) => {
      const review = await createReview(request.auth!.sub, request.body.appointmentId, {
        rating: request.body.rating,
        comment: request.body.comment ?? null,
      });
      return reply.status(201).send(review);
    },
  );



  app.post<{ Body: { fullName: string; birthYear?: number; gender?: "MALE" | "FEMALE" } }>(
    "/me/patients",
    { preHandler: requireRole("PATIENT") },
    async (request, reply) => {
      const created = await addFamilyMember(request.auth!.sub, request.body);
      return reply.status(201).send(created);
    },
  );

  /** بيانات المريض التي تسألها العيادة: الاسم والهاتف والعنوان والعمر */
  app.patch<{
    Params: { id: string };
    Body: { fullName?: string; phone?: string | null; address?: string | null; birthYear?: number | null; gender?: "MALE" | "FEMALE" | null };
  }>("/me/patients/:id", { preHandler: requireRole("PATIENT") }, async (request) => {
    return updatePatient(request.auth!.sub, request.params.id, request.body ?? {});
  });

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

  // ── عمليات اليوم: الطبيب والسكرتير معاً ───────────────────────
  const clinicStaff = { preHandler: requireRole("DOCTOR", "STAFF") };

  app.get("/clinic/me", clinicStaff, async (request) => getMyClinics(request.auth!.sub));

  app.get<{ Querystring: { date?: string } }>("/clinic/me/appointments", clinicStaff, async (request) => {
    return getScopedAppointments(request.auth!.sub, request.query.date ?? new Date().toISOString().slice(0, 10));
  });

  app.patch<{ Params: { id: string }; Body: { status: "CONFIRMED" | "NO_SHOW" | "COMPLETED" } }>(
    "/clinic/me/appointments/:id/status",
    clinicStaff,
    async (request) => setScopedAppointmentStatus(request.auth!.sub, request.params.id, request.body.status),
  );

  /** حجز يدوي لمريض حضر أو اتصل بلا تطبيق */
  app.post<{
    Body: { doctorClinicId: string; fullName: string; phone: string; startAt: string; note?: string };
  }>("/clinic/me/walk-in", clinicStaff, async (request, reply) => {
    const result = await createWalkInBooking(request.auth!.sub, request.body);
    return reply.status(201).send(result);
  });

  /** تأجيل جماعي: الطبيب تأخر فتُزاح مواعيد الفترة كلها */
  app.post<{ Body: { doctorClinicId: string; sessionStart: string; minutes: number } }>(
    "/clinic/me/shift",
    clinicStaff,
    async (request) => shiftSessionAppointments(request.auth!.sub, request.body),
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
