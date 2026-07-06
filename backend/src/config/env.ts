import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Отсутствует обязательная переменная окружения: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),

  databaseUrl: required("DATABASE_URL"),
  redisUrl: required("REDIS_URL"),

  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET"),
    refreshSecret: required("JWT_REFRESH_SECRET"),
    accessTtl: process.env.JWT_ACCESS_TTL ?? "15m",
    refreshTtl: process.env.JWT_REFRESH_TTL ?? "30d",
    // В секундах — нужно и для maxAge cookie, и для TTL в Redis (blacklist).
    accessTtlSeconds: Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 15 * 60),
    refreshTtlSeconds: Number(process.env.JWT_REFRESH_TTL_SECONDS ?? 30 * 24 * 60 * 60),
  },

  // NFR-18: refresh — httpOnly+Secure+SameSite=Strict cookie.
  cookies: {
    signSecret: required("COOKIE_SIGN_SECRET", "dev-cookie-sign-secret-change-me"),
    refreshCookieName: "vertical_refresh",
    csrfCookieName: "vertical_csrf",
    secure: (process.env.NODE_ENV ?? "development") === "production",
  },

  // NFR-19: антифрод OTP.
  otp: {
    codeTtlSeconds: Number(process.env.OTP_CODE_TTL_SECONDS ?? 5 * 60), // TTL кода
    resendIntervalSeconds: Number(process.env.OTP_RESEND_INTERVAL_SECONDS ?? 30), // не чаще 1 раза в N сек
    maxPerHour: Number(process.env.OTP_MAX_PER_HOUR ?? 5), // ≤5 запросов кода в час
    maxVerifyAttempts: Number(process.env.OTP_MAX_VERIFY_ATTEMPTS ?? 5), // ≤5 попыток ввода кода
    // Заглушка на старте (см. auth.service.ts): в dev код всегда фиксированный и печатается в лог.
    devStaticCode: process.env.OTP_DEV_STATIC_CODE ?? "0000",
  },

  externalBackend: {
    url: required("EXTERNAL_BACKEND_URL"),
    apiKey: process.env.EXTERNAL_BACKEND_API_KEY ?? "",
  },

  sms: {
    apiKey: process.env.SMS_PROVIDER_API_KEY ?? "",
  },

  telegram: {
    // Read from process.env at runtime to allow tests to override the value.
    get botToken() { return process.env.TELEGRAM_BOT_TOKEN ?? ""; },
    // Максимальный возраст auth_date из Telegram Login Widget (защита от replay).
    authMaxAgeSeconds: Number(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS ?? 24 * 60 * 60),
  },

  webPush: {
    publicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "",
    privateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? "",
    contactEmail: process.env.WEB_PUSH_CONTACT_EMAIL ?? "mailto:dev@example.com",
  },
};
