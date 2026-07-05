// NFR-18: сессия = access (в памяти клиента, выдаётся через @fastify/jwt в jwt.ts) +
// refresh (httpOnly+Secure+SameSite=Strict cookie, ~30 дней). Этот модуль отвечает за
// refresh-токен и его отзыв (logout / чёрный список в Redis), а также за CSRF-защиту
// эндпоинтов, которые опираются только на cookie (без Bearer-заголовка): /auth/refresh.
//
// Почему jsonwebtoken, а не @fastify/jwt: у access и refresh разные секреты и разное
// время жизни, а @fastify/jwt в этом проекте уже занят под access (см. plugins/jwt.ts).
// Не усложняем — просто вызываем jsonwebtoken напрямую с отдельным секретом.
import jwt from "jsonwebtoken";
import { randomUUID, randomBytes } from "node:crypto";
import type { Redis } from "ioredis";
import { env } from "../../config/env.js";
import { ApiError } from "../../lib/errors.js";

export interface RefreshPayload {
  clientId: string;
  jti: string;
}

export function signRefreshToken(clientId: string): { token: string; jti: string } {
  const jti = randomUUID();
  const token = jwt.sign({ clientId, jti }, env.jwt.refreshSecret, {
    // env.jwt.refreshTtl приходит из строки окружения (напр. "30d") — jsonwebtoken на
    // уровне типов ожидает строгий литерал вида `${number}d`, но в рантайме принимает
    // любую валидную строку формата `ms`. Каст безопасен, значение не пользовательский ввод.
    expiresIn: env.jwt.refreshTtl as jwt.SignOptions["expiresIn"],
  });
  return { token, jti };
}

export function verifyRefreshToken(token: string): RefreshPayload {
  try {
    return jwt.verify(token, env.jwt.refreshSecret) as RefreshPayload;
  } catch {
    throw new ApiError(401, "unauthorized");
  }
}

// --- Чёрный список отозванных refresh-токенов (logout), см. LOGIC-004 ---
// Ключ = jti конкретного refresh-токена; TTL = сколько ему осталось жить максимум
// (не обязательно точно, достаточно верхней границы — env.jwt.refreshTtlSeconds).
function blacklistKey(jti: string): string {
  return `auth:refresh:blacklist:${jti}`;
}

export async function blacklistRefreshToken(redis: Redis, jti: string): Promise<void> {
  await redis.set(blacklistKey(jti), "1", "EX", env.jwt.refreshTtlSeconds);
}

export async function isRefreshTokenBlacklisted(redis: Redis, jti: string): Promise<boolean> {
  const value = await redis.get(blacklistKey(jti));
  return value !== null;
}

// --- CSRF (double-submit cookie), см. NFR-18 ---
// /auth/refresh и /auth/logout полагаются на cookie, отправляемую браузером автоматически,
// поэтому нуждаются в CSRF-защите. Остальные мутирующие эндпоинты защищены тем, что
// используют Bearer access-токен из памяти JS, а не cookie — сторонняя страница не может
// подставить Authorization-заголовок, поэтому классический CSRF им не угрожает.
export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

export function csrfTokensMatch(cookieValue: string | undefined, headerValue: string | undefined): boolean {
  return Boolean(cookieValue) && Boolean(headerValue) && cookieValue === headerValue;
}
