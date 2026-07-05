// Web Push подписка (LOGIC-005, FR-48). Реальная отправка push-уведомлений
// через web-push потребует установки пакета `web-push` (не включён в package.json,
// добавьте `npm install web-push` при реализации отправки).
import type { PrismaClient } from "@prisma/client";

export async function saveSubscription(
  prisma: PrismaClient,
  clientId: string,
  endpoint: string,
  p256dh: string,
  auth: string
) {
  return prisma.webPushSubscription.upsert({
    where: { endpoint },
    update: { p256dh, auth },
    create: { clientId, endpoint, p256dh, auth },
  });
}

export async function deleteSubscription(prisma: PrismaClient, endpoint: string) {
  return prisma.webPushSubscription.deleteMany({ where: { endpoint } });
}
