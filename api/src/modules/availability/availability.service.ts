/**
 * حساب الأوقات المتاحة.
 *
 * المصدر ثلاثة أشياء تُدمج لحظة الطلب، لا فترات مولَّدة مخزَّنة مسبقاً:
 *   قالب الدوام الأسبوعي  −  استثناءات الطبيب (إجازة أو تعديل)  −  ما حُجز فعلاً
 *
 * تخزين الفترات مسبقاً يعني إصلاح آلاف الصفوف عند كل تعديل دوام؛ الحساب اللحظي
 * يجعل تعديل الطبيب لجدوله ينعكس فوراً على ما يراه المرضى.
 */
import type { BookingMode, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/errors.js";
import {
  WEEKDAY_NAMES_AR,
  addDaysISO,
  minutesToTime,
  timeToMinutes,
  utcToZonedTime,
  zonedToUtc,
  zonedWeekday,
} from "../../lib/timezone.js";

export type Slot = {
  /** بداية الفترة بالتوقيت العالمي */
  start: string;
  /** الوقت كما يظهر للمريض بتوقيت العيادة: "16:20" */
  time: string;
  taken: boolean;
};

export type DaySession = {
  sessionStart: string;
  sessionEnd: string;
  startTime: string;
  endTime: string;
  bookingMode: BookingMode;
  /** لنمط الوقت المحدد */
  slots: Slot[];
  /** لنمط رقم الدور */
  capacity: number;
  booked: number;
  remaining: number;
  nextQueueNumber: number;
};

export type DayAvailability = {
  date: string;
  weekday: number;
  weekdayName: string;
  isClosed: boolean;
  closedReason: string | null;
  sessions: DaySession[];
  /** عدد الأماكن الشاغرة في اليوم كله — لتلوين التقويم بنظرة واحدة */
  freeCount: number;
};

type Options = {
  /** لوحة الطبيب تحتاج رؤية المحجوز أيضاً؛ المريض لا يرى إلا الشاغر */
  includeTaken?: boolean;
  /** أقل مهلة قبل الموعد يُسمح بالحجز خلالها */
  minLeadMinutes?: number;
  now?: Date;
};

export async function getAvailability(
  practiceId: string,
  fromISO: string,
  toISO: string,
  options: Options = {},
  client: PrismaClient = defaultPrisma,
): Promise<DayAvailability[]> {
  const { includeTaken = false, minLeadMinutes = 0, now = new Date() } = options;

  const practice = await client.doctorClinic.findUnique({
    where: { id: practiceId },
    include: {
      clinic: { select: { timezone: true } },
      schedules: { where: { isActive: true } },
    },
  });
  if (!practice) throw notFound("PRACTICE_NOT_FOUND", "العيادة غير موجودة");

  const timeZone = practice.clinic.timezone;
  const earliest = new Date(now.getTime() + minLeadMinutes * 60_000);

  // لا نتجاوز مدى الحجز الذي حدده الطبيب
  const horizonISO = new Date(now.getTime() + practice.bookingHorizonDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const lastISO = toISO < horizonISO ? toISO : horizonISO;

  const rangeStart = zonedToUtc(fromISO, "00:00", timeZone);
  const rangeEnd = zonedToUtc(addDaysISO(lastISO, 1), "00:00", timeZone);

  const [exceptions, appointments] = await Promise.all([
    client.scheduleException.findMany({
      where: {
        doctorClinicId: practiceId,
        date: { gte: new Date(`${fromISO}T00:00:00.000Z`), lte: new Date(`${lastISO}T00:00:00.000Z`) },
      },
    }),
    // الحجوزات النشطة فقط: lockKey = true. الملغاة تركت مكانها شاغراً.
    client.appointment.findMany({
      where: {
        doctorClinicId: practiceId,
        lockKey: true,
        sessionStart: { gte: rangeStart, lt: rangeEnd },
      },
      select: { slotStart: true, sessionStart: true, queueNumber: true },
    }),
  ]);

  const takenSlots = new Set(appointments.map((a) => a.slotStart.toISOString()));
  const queueBySession = new Map<string, { count: number; max: number }>();
  for (const appointment of appointments) {
    const key = appointment.sessionStart.toISOString();
    const entry = queueBySession.get(key) ?? { count: 0, max: 0 };
    entry.count++;
    entry.max = Math.max(entry.max, appointment.queueNumber);
    queueBySession.set(key, entry);
  }

  const templatesByWeekday = new Map<number, typeof practice.schedules>();
  for (const template of practice.schedules) {
    const list = templatesByWeekday.get(template.weekday) ?? [];
    list.push(template);
    templatesByWeekday.set(template.weekday, list);
  }

  const exceptionsByDate = new Map<string, typeof exceptions>();
  for (const exception of exceptions) {
    const key = exception.date.toISOString().slice(0, 10);
    const list = exceptionsByDate.get(key) ?? [];
    list.push(exception);
    exceptionsByDate.set(key, list);
  }

  const days: DayAvailability[] = [];

  for (let date = fromISO; date <= lastISO; date = addDaysISO(date, 1)) {
    const weekday = zonedWeekday(date, timeZone);
    const dayExceptions = exceptionsByDate.get(date) ?? [];

    // إغلاق اليوم كاملاً: استثناء من نوع CLOSED بلا تحديد ساعات
    const fullClosure = dayExceptions.find((e) => e.type === "CLOSED" && !e.startTime);
    if (fullClosure) {
      days.push({
        date,
        weekday,
        weekdayName: WEEKDAY_NAMES_AR[weekday],
        isClosed: true,
        closedReason: fullClosure.reason ?? "إجازة",
        sessions: [],
        freeCount: 0,
      });
      continue;
    }

    const custom = dayExceptions.filter((e) => e.type === "CUSTOM");
    const partialClosures = dayExceptions.filter((e) => e.type === "CLOSED" && e.startTime);

    // دوام مخصص لهذا اليوم يحل محل القالب الأسبوعي
    const sources = custom.length
      ? custom.map((e) => ({
          startTime: e.startTime!,
          endTime: e.endTime ?? "23:59",
          slotMinutes: null as number | null,
          capacity: e.capacity ?? null,
        }))
      : (templatesByWeekday.get(weekday) ?? []).map((t) => ({
          startTime: t.startTime,
          endTime: t.endTime,
          slotMinutes: t.slotMinutes,
          capacity: t.capacity,
        }));

    const sessions: DaySession[] = [];

    for (const source of sources) {
      const sessionStart = zonedToUtc(date, source.startTime, timeZone);
      const sessionEnd = zonedToUtc(date, source.endTime, timeZone);
      if (sessionEnd <= sessionStart) continue;

      const blocked = partialClosures.map((closure) => ({
        from: timeToMinutes(closure.startTime!),
        to: timeToMinutes(closure.endTime ?? "23:59"),
      }));

      if (practice.bookingMode === "SLOT") {
        const step = source.slotMinutes ?? practice.slotMinutes;
        const slots: Slot[] = [];
        const startMinutes = timeToMinutes(source.startTime);
        const endMinutes = timeToMinutes(source.endTime);

        for (let minute = startMinutes; minute + step <= endMinutes; minute += step) {
          if (blocked.some((b) => minute >= b.from && minute < b.to)) continue;

          const time = minutesToTime(minute);
          const start = zonedToUtc(date, time, timeZone);
          if (start < earliest) continue;

          const taken = takenSlots.has(start.toISOString());
          if (taken && !includeTaken) continue;

          slots.push({ start: start.toISOString(), time, taken });
        }

        if (slots.length === 0) continue;
        const free = slots.filter((s) => !s.taken).length;
        sessions.push({
          sessionStart: sessionStart.toISOString(),
          sessionEnd: sessionEnd.toISOString(),
          startTime: source.startTime,
          endTime: source.endTime,
          bookingMode: "SLOT",
          slots,
          capacity: slots.length,
          booked: slots.length - free,
          remaining: free,
          nextQueueNumber: 0,
        });
      } else {
        if (sessionEnd < earliest) continue;

        const capacity = source.capacity ?? practice.capacityPerSession;
        const queue = queueBySession.get(sessionStart.toISOString()) ?? { count: 0, max: 0 };
        const remaining = Math.max(0, capacity - queue.count);
        if (remaining === 0 && !includeTaken) continue;

        sessions.push({
          sessionStart: sessionStart.toISOString(),
          sessionEnd: sessionEnd.toISOString(),
          startTime: source.startTime,
          endTime: source.endTime,
          bookingMode: "QUEUE",
          slots: [],
          capacity,
          booked: queue.count,
          remaining,
          nextQueueNumber: queue.max + 1,
        });
      }
    }

    days.push({
      date,
      weekday,
      weekdayName: WEEKDAY_NAMES_AR[weekday],
      isClosed: false,
      closedReason: null,
      sessions,
      freeCount: sessions.reduce((sum, s) => sum + s.remaining, 0),
    });
  }

  return days;
}

/** أقرب يوم فيه مكان شاغر — يظهر في بطاقة الطبيب داخل نتائج البحث. */
export async function getNextAvailableDay(
  practiceId: string,
  client: PrismaClient = defaultPrisma,
): Promise<DayAvailability | null> {
  const today = new Date().toISOString().slice(0, 10);
  const days = await getAvailability(
    practiceId,
    today,
    addDaysISO(today, 30),
    { includeTaken: false },
    client,
  );
  return days.find((day) => day.freeCount > 0) ?? null;
}

/** يتحقق أن الوقت الذي اختاره المريض ما زال ضمن دوام الطبيب وغير محجوز. */
export async function isSlotBookable(
  practiceId: string,
  slotStart: Date,
  client: PrismaClient = defaultPrisma,
): Promise<boolean> {
  const dateISO = slotStart.toISOString().slice(0, 10);
  const days = await getAvailability(
    practiceId,
    addDaysISO(dateISO, -1),
    addDaysISO(dateISO, 1),
    { includeTaken: false },
    client,
  );
  const target = slotStart.toISOString();
  return days.some((day) =>
    day.sessions.some((session) => session.slots.some((slot) => slot.start === target && !slot.taken)),
  );
}
