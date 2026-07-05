import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../../lib/errors.js";

// --- SMS OTP (FR-1, NFR-19) ---
// Заглушка на старте: код всегда "0000" и логируется в консоль вместо реальной отправки.
// TODO: подключить реального SMS-провайдера и rate-limit (NFR-19: не чаще 1 раз в 30-60с,
// не более 5 в час, лимит попыток ввода ≤5).
export async function requestOtp(phone: string) {
  const code = "0000";
  console.log(`[OTP STUB] Код для ${phone}: ${code}`);
  return { retryAfterSeconds: 30 };
}

export async function verifyOtp(
  app: FastifyInstance,
  prisma: PrismaClient,
  phone: string,
  code: string,
  name?: string
) {
  if (code !== "0000") {
    throw new ApiError(401, "invalid_code");
  }

  let client = await prisma.client.findUnique({ where: { phone } });
  const isNewClient = !client;

  if (!client) {
    if (!name) {
      // Клиенту показывается шаг "Как вас зовут?" (SCR-001, шаг 3)
      return { isNewClient: true, needsName: true };
    }
    client = await prisma.client.create({ data: { phone, name } });
  }

  return {
    isNewClient,
    needsName: false,
    accessToken: app.jwt.sign({ clientId: client.id }),
    client,
  };
}

// --- Telegram Login (FR-2) ---
// TODO: проверить подпись telegram_init_data по алгоритму Telegram Login Widget
// (HMAC-SHA256 от bot token), см. https://core.telegram.org/widgets/login#checking-authorization
export async function verifyTelegramAuth(
  app: FastifyInstance,
  prisma: PrismaClient,
  telegramInitData: string
) {
  throw new ApiError(501, "not_implemented", {
    hint: "Реализовать проверку подписи Telegram Login Widget",
  });
}
