/**
 * التذكيرات المجدولة.
 *
 * تذكيران قبل الموعد: واحد قبل يوم وآخر قبل ساعتين. هذان وحدهما يخفضان
 * الغياب أكثر من أي إجراء آخر بلا تكلفة على المريض.
 *
 * الضمانة الأساسية: **لا يُرسل تذكير مرتين.** القيد الفريد على
 * ‏(appointmentId, template) في جدول الرسائل هو ما يضمنها — لا فحصٌ في الكود،
 * لأن تشغيلين متزامنين للمجدوِل أو إعادة تشغيل أثناء الإرسال يكسران أي فحص.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/prisma.js";
import { toWhatsAppAddress } from "../../lib/phone.js";
import { deliver, queueWhatsApp, resolveDoctorWhatsApp } from "../../notifications/dispatch.js";
import { patientReminderMessage } from "../../notifications/whatsapp/templates.js";

export type ReminderKind = "reminder_24h" | "reminder_2h";

/** كم دقيقة قبل الموعد يُرسل كل تذكير، وسعة النافذة التي يبحث فيها المجدوِل. */
const REMINDERS: { template: ReminderKind; minutesBefore: number }[] = [
  { template: "reminder_24h", minutesBefore: 24 * 60 },
  { template: "reminder_2h", minutesBefore: 120 },
];

/** نافذة البحث: تغطي فترة بين تشغيلين حتى لا يفلت موعد لو تأخر المجدوِل. */
const WINDOW_MINUTES = 20;

export type ReminderRun = {
  scanned: number;
  queued: number;
  delivered: number;
  skipped: { alreadySent: number; noWhatsApp: number };
};

/**
 * يبحث عن المواعيد التي حان وقت تذكيرها ويرسلها.
 * يُستدعى دورياً — كل عشر دقائق تكفي.
 */
export async function runReminders(
  now: Date = new Date(),
  client: PrismaClient = defaultPrisma,
): Promise<ReminderRun> {
  const run: ReminderRun = { scanned: 0, queued: 0, delivered: 0, skipped: { alreadySent: 0, noWhatsApp: 0 } };

  for (const { template, minutesBefore } of REMINDERS) {
    const target = new Date(now.getTime() + minutesBefore * 60_000);
    const from = new Date(target.getTime() - (WINDOW_MINUTES / 2) * 60_000);
    const to = new Date(target.getTime() + (WINDOW_MINUTES / 2) * 60_000);

    const appointments = await client.appointment.findMany({
      where: {
        lockKey: true, // الحجوزات النشطة فقط — الملغاة لا تُذكَّر
        status: { in: ["CONFIRMED", "PENDING"] },
        // slotStart لا sessionStart: في نمط الوقت المحدد موعد المريض هو فترته،
        // لا بداية دوام الطبيب. طبيب يداوم من الثامنة كان سيُذكَّر مرضاه كلهم
        // بتوقيت الثامنة مهما كانت مواعيدهم. وفي نمط الدور الحقلان متساويان.
        slotStart: { gte: from, lt: to },
      },
      include: {
        patient: { include: { account: { select: { id: true, phone: true } } } },
        doctorClinic: {
          include: {
            clinic: { select: { nameAr: true, landmark: true } },
            doctor: { include: { user: { select: { fullName: true } } } },
          },
        },
      },
    });

    run.scanned += appointments.length;

    for (const appointment of appointments) {
      const to = appointment.patient.phone ?? appointment.patient.account.phone;
      if (!to) {
        run.skipped.noWhatsApp++;
        continue;
      }

      const message = patientReminderMessage(
        {
          patientName: appointment.patient.fullName,
          doctorName: `${appointment.doctorClinic.doctor.title} ${appointment.doctorClinic.doctor.user.fullName}`,
          clinicName: appointment.doctorClinic.clinic.nameAr,
          landmark: appointment.doctorClinic.clinic.landmark,
          reference: appointment.reference,
          bookingMode: appointment.bookingMode,
          slotStart: appointment.slotStart,
          sessionStart: appointment.sessionStart,
          sessionEnd: appointment.sessionEnd,
          queueNumber: appointment.queueNumber,
        },
        template === "reminder_24h" ? "غداً" : "بعد ساعتين",
      );

      let logId: string;
      try {
        logId = await queueWhatsApp(
          {
            userId: appointment.patient.account.id,
            appointmentId: appointment.id,
            to: toWhatsAppAddress(to),
            template,
            message,
          },
          client,
        );
      } catch (error) {
        // القيد الفريد رفض الصف: هذا التذكير أُرسل سابقاً
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          run.skipped.alreadySent++;
          continue;
        }
        throw error;
      }

      run.queued++;
      if (await deliver(logId, client)) run.delivered++;
    }
  }

  return run;
}

/** يُشعر الطبيب أيضاً بجدول يومه صباحاً — اختياري ويُفعّل من الإعدادات لاحقاً. */
export async function notifyDoctorsOfTodaySchedule(
  now: Date = new Date(),
  client: PrismaClient = defaultPrisma,
): Promise<number> {
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const practices = await client.doctorClinic.findMany({
    where: {
      isActive: true,
      appointments: { some: { lockKey: true, sessionStart: { gte: dayStart, lt: dayEnd } } },
    },
    include: {
      doctor: { select: { whatsappNumber: true, whatsappEnabled: true } },
    },
  });

  return practices.filter((practice) => resolveDoctorWhatsApp(practice) !== null).length;
}
