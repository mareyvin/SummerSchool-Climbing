import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import { ApiError } from "../../lib/errors.js";
import * as otpService from "./otp.service.js";
import { verifyTelegramAuth as verifyTelegramSignature } from "./telegram.service.js";
import { signRefreshToken } from "./token.service.js";

// --- SMS OTP (FR-1, NFR-19) ---
// Реальная генерация/хранение кода и лимиты — в otp.service.ts (Redis). Здесь — только
// бизнес-обвязка: что делать с клиентом после успешной проверки кода.
export async function requestOtp(redis: Redis, phone: string) {
  return otpService.requestOtp(redis, phone);
}

interface LoginResult {
  isNewClient: boolean;
  needsName: boolean;
  accessToken?: string;
  refreshToken?: string;
  client?: unknown;
}

async function issueSession(app: FastifyInstance, clientId: string) {
  const accessToken = app.jwt.sign({ clientId });
  const { token: refreshToken } = signRefreshToken(clientId);
  return { accessToken, refreshToken };
}

export async function verifyOtp(
  app: FastifyInstance,
  prisma: PrismaClient,
  redis: Redis,
  phone: string,
  code: string,
  name?: string
): Promise<LoginResult> {
  // Бросит ApiError(401, "invalid_code") или ApiError(429, "rate_limited", ...)
  await otpService.verifyOtp(redis, phone, code);

  let client = await prisma.client.findUnique({ where: { phone } });
  const isNewClient = !client;

  if (!client) {
    if (!name) {
      // Клиенту показывается шаг "Как вас зовут?" (SCR-001, шаг 3)
      return { isNewClient: true, needsName: true };
    }
    client = await prisma.client.create({ data: { phone, name } });
  }

  const { accessToken, refreshToken } = await issueSession(app, client.id);

  return { isNewClient, needsName: false, accessToken, refreshToken, client };
}

// --- Telegram Login (FR-2) ---
// Решение по MVP: Telegram-вход работает только для клиента, который уже привязал Telegram
// через профиль после обычной регистрации по телефону (см. SCR-007 §6.3). Первичная
// регистрация "только через Telegram, без телефона" не поддерживается — телефон в схеме
// (0001_init.sql: clients.phone NOT NULL UNIQUE) обязателен, а придумывать заглушечный номер
// для этого сценария означало бы вводить неподтверждённое требование. Если продукту
// реально нужен вход "с нуля" через Telegram — это отдельное решение, требующее правки схемы
// и согласования с аналитикой (см. открытые вопросы tech-stack.md §6).
export async function verifyTelegramAuth(
  app: FastifyInstance,
  prisma: PrismaClient,
  telegramInitData: string
): Promise<LoginResult> {
  const telegramUser = verifyTelegramSignature(telegramInitData);

  const client = await prisma.client.findUnique({ where: { telegramId: telegramUser.id } });
  if (!client) {
    throw new ApiError(404, "telegram_not_linked", {
      hint: "Сначала войдите по номеру телефона и привяжите Telegram в профиле",
    });
  }

  const { accessToken, refreshToken } = await issueSession(app, client.id);

  return { isNewClient: false, needsName: false, accessToken, refreshToken, client };
}
