// SMS OTP (FR-1, NFR-19). Отправка через реального SMS-провайдера — TODO (см. sendSms ниже),
// на старте только генерируем/проверяем код и логируем его с маскированным номером, вместо
// реальной отправки. Все лимиты и TTL — в Redis, не хардкодятся.
import type { Redis } from "ioredis";
import { env } from "../../config/env.js";
import { ApiError } from "../../lib/errors.js";

// NFR-20: маскирование номера в логах — "+7 *** *** ** 67"
export function maskPhone(phone: string): string {
  if (phone.length < 4) return "***";
  const last2 = phone.slice(-2);
  const prefix = phone.slice(0, 2); // напр. "+7"
  return `${prefix} *** *** ** ${last2}`;
}

function codeKey(phone: string): string {
  return `otp:code:${phone}`;
}
function resendKey(phone: string): string {
  return `otp:resend:${phone}`;
}
function hourlyKey(phone: string): string {
  return `otp:hourly:${phone}`;
}
function attemptsKey(phone: string): string {
  return `otp:attempts:${phone}`;
}

function generateCode(): string {
  if (env.nodeEnv !== "production") {
    // Заглушка на старте (см. README backend): фиксированный код, чтобы не поднимать
    // реального SMS-провайдера в dev/staging. TODO: убрать при подключении провайдера.
    return env.otp.devStaticCode;
  }
  return String(Math.floor(100000 + Math.random() * 900000)).slice(0, 6);
}

// TODO: подключить реального SMS-провайдера (SMS Aero / SMSC.ru — см. tech-stack.md §3.5).
async function sendSms(phone: string, code: string): Promise<void> {
  console.log(`[OTP] Код для ${maskPhone(phone)} отправлен (SMS-провайдер не подключён)`);
  void code; // код никогда не логируется целиком (NFR-20)
}

export async function requestOtp(redis: Redis, phone: string): Promise<{ retryAfterSeconds: number }> {
  // 1) не чаще раза в resendIntervalSeconds на номер
  const resendTtl = await redis.ttl(resendKey(phone));
  if (resendTtl > 0) {
    throw new ApiError(429, "rate_limited", { retry_after: resendTtl });
  }

  // 2) не более maxPerHour запросов в час на номер
  const hourlyCount = await redis.incr(hourlyKey(phone));
  if (hourlyCount === 1) {
    await redis.expire(hourlyKey(phone), 60 * 60);
  }
  if (hourlyCount > env.otp.maxPerHour) {
    const hourlyTtl = await redis.ttl(hourlyKey(phone));
    throw new ApiError(429, "rate_limited", { retry_after: hourlyTtl > 0 ? hourlyTtl : 3600 });
  }

  const code = generateCode();
  await redis.set(codeKey(phone), code, "EX", env.otp.codeTtlSeconds);
  await redis.set(resendKey(phone), "1", "EX", env.otp.resendIntervalSeconds);
  await redis.del(attemptsKey(phone)); // новый код — новый лимит попыток

  await sendSms(phone, code);

  return { retryAfterSeconds: env.otp.resendIntervalSeconds };
}

export async function verifyOtp(redis: Redis, phone: string, code: string): Promise<void> {
  const attempts = await redis.incr(attemptsKey(phone));
  if (attempts === 1) {
    await redis.expire(attemptsKey(phone), env.otp.codeTtlSeconds);
  }
  if (attempts > env.otp.maxVerifyAttempts) {
    const ttl = await redis.ttl(attemptsKey(phone));
    throw new ApiError(429, "rate_limited", { retry_after: ttl > 0 ? ttl : env.otp.codeTtlSeconds });
  }

  const storedCode = await redis.get(codeKey(phone));
  if (!storedCode || storedCode !== code) {
    throw new ApiError(401, "invalid_code");
  }

  // Код одноразовый — использован, независимо от результата дальнейшей логики.
  await redis.del(codeKey(phone));
  await redis.del(attemptsKey(phone));
}
