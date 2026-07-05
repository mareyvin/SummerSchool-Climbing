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
  },

  externalBackend: {
    url: required("EXTERNAL_BACKEND_URL"),
    apiKey: process.env.EXTERNAL_BACKEND_API_KEY ?? "",
  },

  sms: {
    apiKey: process.env.SMS_PROVIDER_API_KEY ?? "",
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  },

  webPush: {
    publicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "",
    privateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? "",
    contactEmail: process.env.WEB_PUSH_CONTACT_EMAIL ?? "mailto:dev@example.com",
  },
};
