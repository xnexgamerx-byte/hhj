/**
 * المهام الدورية.
 *
 * تعمل داخل الخادم نفسه لا كعملية منفصلة — يكفي هذا لآلاف الحجوزات، ويوفّر
 * تشغيل وحفظ عملية ثانية. عند التوسّع تُنقل إلى عامل مستقل بلا تغيير في المنطق.
 *
 * تشغيل نسختين من الخادم لا يُرسل تذكيراً مرتين: القيد الفريد على
 * ‏(appointmentId, template) يرفض الصف الثاني.
 */
import { prisma } from "./lib/prisma.js";
import { flushPending } from "./notifications/dispatch.js";
import { runReminders } from "./modules/reminders/reminders.service.js";

const MINUTE = 60_000;

type Job = { name: string; everyMs: number; run: () => Promise<string> };

const jobs: Job[] = [
  {
    name: "التذكيرات",
    everyMs: 10 * MINUTE,
    run: async () => {
      const result = await runReminders();
      return `فُحص ${result.scanned} · أُرسل ${result.delivered} · مُرسَل سابقاً ${result.skipped.alreadySent}`;
    },
  },
  {
    name: "إعادة إرسال المعلّق",
    everyMs: 2 * MINUTE,
    run: async () => `أُرسل ${await flushPending(100)}`,
  },
];

let timers: ReturnType<typeof setInterval>[] = [];

export function startScheduler(log: (line: string) => void = console.log) {
  if (timers.length > 0) return;

  for (const job of jobs) {
    const tick = async () => {
      try {
        const summary = await job.run();
        // لا نضجّ السجل بالنتائج الفارغة
        if (!/^\S+ 0( ·|$)/.test(summary) && summary !== "أُرسل 0" && summary !== "حُرِّر 0") {
          log(`[مجدوِل] ${job.name}: ${summary}`);
        }
      } catch (error) {
        log(`[مجدوِل] ${job.name} فشلت: ${(error as Error).message}`);
      }
    };
    timers.push(setInterval(tick, job.everyMs));
    void tick(); // تشغيلة أولى فور الإقلاع
  }

  log(`[مجدوِل] بدأ — ${jobs.length} مهام`);
}

export function stopScheduler() {
  for (const timer of timers) clearInterval(timer);
  timers = [];
}
