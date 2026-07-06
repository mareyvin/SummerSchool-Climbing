import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { deleteSubscription, saveSubscription } from "./webpush.service.js";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

// FR-48: регистрация Web Push подписки после первой брони (BS-002 / LOGIC-005)
export async function notificationsRoutes(app: FastifyInstance) {
  app.post("/notifications/web-push-subscriptions", { preHandler: [app.authenticate] }, async (request, reply) => {
    const clientId = (request.user as { clientId: string }).clientId;
    const body = subscriptionSchema.parse(request.body);
    const sub = await saveSubscription(app.prisma, clientId, body.endpoint, body.keys.p256dh, body.keys.auth);
    reply.code(201).send(sub);
  });

  app.delete("/notifications/web-push-subscriptions", { preHandler: [app.authenticate] }, async (request, reply) => {
    const clientId = (request.user as { clientId: string }).clientId;
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(request.body);
    await deleteSubscription(app.prisma, clientId, endpoint);
    reply.code(204).send();
  });
}
