// Очередь напоминаний о тренировке (FR-45, NFR-17): за 24ч и за 3ч до старта.
// Используется BullMQ поверх Redis. Постановка задачи — при создании брони
// (в bookings.service.ts после успешного createBooking нужно вызвать scheduleReminders).
import { Queue } from "bullmq";
import { env } from "../config/env.js";

const connection = { url: env.redisUrl };

export const reminderQueue = new Queue("booking-reminders", { connection });

export async function scheduleReminders(bookingId: string, slotStartAtIso: string) {
  const startAt = new Date(slotStartAtIso).getTime();
  const now = Date.now();

  const jobs: Array<{ name: string; delayMs: number }> = [
    { name: "reminder_1d", delayMs: startAt - now - 24 * 60 * 60 * 1000 },
    { name: "reminder_3h", delayMs: startAt - now - 3 * 60 * 60 * 1000 },
  ];

  for (const job of jobs) {
    if (job.delayMs > 0) {
      await reminderQueue.add(job.name, { bookingId }, { delay: job.delayMs });
    }
  }
}
