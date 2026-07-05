// Воркер очереди напоминаний. Запуск отдельным процессом: `npm run worker:reminders`.
import "dotenv/config";
import { Worker } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

const prisma = new PrismaClient();

const worker = new Worker(
  "booking-reminders",
  async (job) => {
    const { bookingId } = job.data as { bookingId: string };

    // TODO: отправить Web Push (см. webpush.service.ts) и/или сообщение в Telegram Bot API,
    // затем записать факт отправки в NotificationLog.
    console.log(`[reminder-worker] ${job.name} для брони ${bookingId}`);

    await prisma.notificationLog.create({
      data: {
        clientId: (await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).clientId,
        bookingId,
        type: job.name,
        channel: "web_push",
      },
    });
  },
  { connection: { url: env.redisUrl } }
);

worker.on("failed", (job, err) => {
  console.error(`[reminder-worker] задача ${job?.id} упала:`, err);
});

console.log("Воркер напоминаний запущен");
