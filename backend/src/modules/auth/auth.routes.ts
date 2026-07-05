import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requestOtp, verifyOtp, verifyTelegramAuth } from "./auth.service.js";
import {
  blacklistRefreshToken,
  generateCsrfToken,
  isRefreshTokenBlacklisted,
  signRefreshToken,
  verifyRefreshToken,
} from "./token.service.js";
import { ApiError } from "../../lib/errors.js";
import { env } from "../../config/env.js";

declare module "fastify" {
  interface FastifyRequest {
    cookies: Record<string, string | undefined>;
  }
}

const otpRequestSchema = z.object({ phone: z.string().min(10) });
const otpVerifySchema = z.object({
  phone: z.string().min(10),
  code: z.string().min(4).max(6),
  name: z.string().min(2).max(50).optional(),
});
const telegramAuthSchema = z.object({ telegram_init_data: z.string().min(1) });

// Куки живут только на /auth/* — на остальных путях они не нужны и не отправляются.
const COOKIE_PATH = "/auth";

function setSessionCookies(reply: FastifyReply, refreshToken: string) {
  reply.setCookie(env.cookies.refreshCookieName, refreshToken, {
    httpOnly: true,
    secure: env.cookies.secure,
    sameSite: "strict",
    path: COOKIE_PATH,
    maxAge: env.jwt.refreshTtlSeconds,
  });
  // CSRF-cookie — намеренно НЕ httpOnly: фронтенд должен прочитать её и отправить
  // обратно в заголовке X-CSRF-Token на /auth/refresh (double-submit, см. plugins/csrf.ts).
  reply.setCookie(env.cookies.csrfCookieName, generateCsrfToken(), {
    httpOnly: false,
    secure: env.cookies.secure,
    sameSite: "strict",
    path: COOKIE_PATH,
    maxAge: env.jwt.refreshTtlSeconds,
  });
}

function clearSessionCookies(reply: FastifyReply) {
  reply.clearCookie(env.cookies.refreshCookieName, { path: COOKIE_PATH });
  reply.clearCookie(env.cookies.csrfCookieName, { path: COOKIE_PATH });
}

export async function authRoutes(app: FastifyInstance) {
  // FR-1: запрос кода
  app.post("/auth/otp/request", async (request, reply) => {
    const { phone } = otpRequestSchema.parse(request.body);
    try {
      const result = await requestOtp(app.redis, phone);
      reply.code(202).send({ retry_after_seconds: result.retryAfterSeconds });
    } catch (err) {
      if (err instanceof ApiError) {
        return reply.code(err.statusCode).send({ code: err.code, details: err.details });
      }
      throw err;
    }
  });

  // FR-1: проверка кода, автосоздание клиента при первом входе (SCR-001)
  app.post("/auth/otp/verify", async (request, reply) => {
    const { phone, code, name } = otpVerifySchema.parse(request.body);
    try {
      const result = await verifyOtp(app, app.prisma, app.redis, phone, code, name);
      if (result.needsName) {
        return reply.code(200).send({ is_new_client: true });
      }

      setSessionCookies(reply, result.refreshToken!);
      reply.code(200).send({
        is_new_client: result.isNewClient,
        access_token: result.accessToken,
        expires_in: env.jwt.accessTtlSeconds,
        client: result.client,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        return reply.code(err.statusCode).send({ code: err.code, details: err.details });
      }
      throw err;
    }
  });

  // FR-2: вход через Telegram Login Widget
  app.post("/auth/telegram", async (request, reply) => {
    const { telegram_init_data } = telegramAuthSchema.parse(request.body);
    try {
      const result = await verifyTelegramAuth(app, app.prisma, telegram_init_data);
      setSessionCookies(reply, result.refreshToken!);
      reply.code(200).send({
        is_new_client: result.isNewClient,
        access_token: result.accessToken,
        expires_in: env.jwt.accessTtlSeconds,
        client: result.client,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        return reply.code(err.statusCode).send({ code: err.code, details: err.details });
      }
      throw err;
    }
  });

  // NFR-18: 401-flow, обновление access по refresh-cookie. CSRF обязателен — это
  // единственный мутирующий эндпоинт, который аутентифицируется только cookie.
  app.post("/auth/refresh", { preHandler: [app.verifyCsrf] }, async (request, reply) => {
    const refreshCookie = request.cookies[env.cookies.refreshCookieName];
    if (!refreshCookie) {
      return reply.code(401).send({ code: "unauthorized" });
    }

    try {
      const payload = verifyRefreshToken(refreshCookie);
      if (await isRefreshTokenBlacklisted(app.redis, payload.jti)) {
        clearSessionCookies(reply);
        return reply.code(401).send({ code: "unauthorized" });
      }

      // Не ротируем refresh при каждом обновлении (осознанное упрощение для MVP) —
      // тот же refresh живёт до истечения TTL или явного logout/чёрного списка.
      const accessToken = app.jwt.sign({ clientId: payload.clientId });
      reply.code(200).send({ access_token: accessToken, expires_in: env.jwt.accessTtlSeconds });
    } catch {
      clearSessionCookies(reply);
      reply.code(401).send({ code: "unauthorized" });
    }
  });

  app.post("/auth/logout", { preHandler: [app.authenticate] }, async (request, reply) => {
    const refreshCookie = request.cookies[env.cookies.refreshCookieName];
    if (refreshCookie) {
      try {
        const payload = verifyRefreshToken(refreshCookie);
        await blacklistRefreshToken(app.redis, payload.jti);
      } catch {
        // Refresh уже невалиден/истёк — нечего отзывать, продолжаем выход.
      }
    }
    clearSessionCookies(reply);
    reply.code(204).send();
  });
}

// Экспортируется для профиля (Фаза 6, смена телефона переиспользует ту же сессию/куки).
export { setSessionCookies, clearSessionCookies, signRefreshToken };
