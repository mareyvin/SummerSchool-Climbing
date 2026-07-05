import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requestOtp, verifyOtp } from "./auth.service.js";
import { ApiError } from "../../lib/errors.js";

const otpRequestSchema = z.object({ phone: z.string().min(10) });
const otpVerifySchema = z.object({
  phone: z.string().min(10),
  code: z.string().min(4).max(6),
  name: z.string().min(2).max(50).optional(),
});

export async function authRoutes(app: FastifyInstance) {
  // FR-1: запрос кода
  app.post("/auth/otp/request", async (request, reply) => {
    const { phone } = otpRequestSchema.parse(request.body);
    const result = await requestOtp(phone);
    reply.code(202).send({ retry_after_seconds: result.retryAfterSeconds });
  });

  // FR-1: проверка кода, автосоздание клиента при первом входе (SCR-001)
  app.post("/auth/otp/verify", async (request, reply) => {
    const { phone, code, name } = otpVerifySchema.parse(request.body);
    try {
      const result = await verifyOtp(app, app.prisma, phone, code, name);
      if (result.needsName) {
        return reply.code(200).send({ is_new_client: true });
      }
      reply.code(200).send({
        is_new_client: result.isNewClient,
        access_token: result.accessToken,
        client: result.client,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        return reply.code(err.statusCode).send({ code: err.code, details: err.details });
      }
      throw err;
    }
  });

  // FR-2: вход через Telegram — см. TODO в auth.service.ts
  app.post("/auth/telegram", async (request, reply) => {
    reply.code(501).send({ code: "not_implemented" });
  });

  // NFR-18: 401-flow, обновление access по refresh-cookie
  app.post("/auth/refresh", async (request, reply) => {
    reply.code(501).send({ code: "not_implemented", hint: "Реализовать refresh по httpOnly-cookie" });
  });

  app.post("/auth/logout", { preHandler: [app.authenticate] }, async (request, reply) => {
    // TODO: инвалидировать refresh-cookie на сервере (если используется хранилище refresh-токенов)
    reply.code(204).send();
  });
}
