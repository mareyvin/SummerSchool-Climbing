import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "../../lib/errors.js";

const updateNameSchema = z.object({ name: z.string().min(2).max(50) });
const requestPhoneChangeSchema = z.object({ new_phone: z.string().min(10) });
const confirmPhoneChangeSchema = z.object({ new_phone: z.string().min(10), code: z.string() });
const linkTelegramSchema = z.object({ telegram_init_data: z.string() });

// FR-33, FR-34, FR-2: профиль клиента (SCR-007)
export async function profileRoutes(app: FastifyInstance) {
  app.get("/profile", { preHandler: [app.authenticate] }, async (request, reply) => {
    const clientId = (request.user as { clientId: string }).clientId;
    const client = await app.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new ApiError(404, "not_found");
    reply.send(client);
  });

  // Смена имени — без подтверждения кодом
  app.patch("/profile", { preHandler: [app.authenticate] }, async (request, reply) => {
    const clientId = (request.user as { clientId: string }).clientId;
    const { name } = updateNameSchema.parse(request.body);
    const client = await app.prisma.client.update({ where: { id: clientId }, data: { name } });
    reply.send(client);
  });

  // Смена телефона — требует подтверждения кодом (как при входе), см. SCR-007 §6.1
  app.post("/profile/phone/request-change", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { new_phone } = requestPhoneChangeSchema.parse(request.body);
    const existing = await app.prisma.client.findUnique({ where: { phone: new_phone } });
    if (existing) throw new ApiError(409, "phone_already_in_use");

    console.log(`[OTP STUB] Код подтверждения смены номера на ${new_phone}: 0000`);
    reply.code(202).send({ retry_after_seconds: 30 });
  });

  app.post("/profile/phone/confirm-change", { preHandler: [app.authenticate] }, async (request, reply) => {
    const clientId = (request.user as { clientId: string }).clientId;
    const { new_phone, code } = confirmPhoneChangeSchema.parse(request.body);
    if (code !== "0000") throw new ApiError(401, "invalid_code");

    const client = await app.prisma.client.update({
      where: { id: clientId },
      data: { phone: new_phone },
    });
    reply.send(client);
  });

  // FR-2, NFR-26: привязка Telegram — TODO проверка подписи, см. auth.service.ts
  app.post("/profile/telegram", { preHandler: [app.authenticate] }, async (request, reply) => {
    linkTelegramSchema.parse(request.body);
    reply.code(501).send({ code: "not_implemented" });
  });

  app.delete("/profile/telegram", { preHandler: [app.authenticate] }, async (request, reply) => {
    const clientId = (request.user as { clientId: string }).clientId;
    await app.prisma.client.update({ where: { id: clientId }, data: { telegramId: null } });
    reply.code(204).send();
  });
}
