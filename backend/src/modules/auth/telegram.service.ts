// Проверка подписи Telegram Login Widget (FR-2), алгоритм из
// https://core.telegram.org/widgets/login#checking-authorization
import { createHash, createHmac } from "node:crypto";
import { env } from "../../config/env.js";
import { ApiError } from "../../lib/errors.js";

export interface TelegramAuthData {
  id: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
}

// `telegramInitData` — строка вида query-параметров, которую отдаёт виджет в onAuth
// (например, "id=123&first_name=Тори&auth_date=169...&hash=abcdef...").
export function verifyTelegramAuth(telegramInitData: string): TelegramAuthData {
  if (!env.telegram.botToken) {
    // Токен бота не настроен — тестовое/dev окружение без реальной интеграции.
    throw new ApiError(501, "not_implemented", { hint: "TELEGRAM_BOT_TOKEN не задан" });
  }

  const params = new URLSearchParams(telegramInitData);
  const hash = params.get("hash");
  if (!hash) {
    throw new ApiError(400, "invalid_telegram_data");
  }
  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHash("sha256").update(env.telegram.botToken).digest();
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computedHash !== hash) {
    throw new ApiError(401, "invalid_telegram_signature");
  }

  const authDate = Number(params.get("auth_date") ?? 0);
  const ageSeconds = Date.now() / 1000 - authDate;
  if (!authDate || ageSeconds > env.telegram.authMaxAgeSeconds || ageSeconds < 0) {
    throw new ApiError(401, "telegram_data_expired");
  }

  const id = params.get("id");
  if (!id) {
    throw new ApiError(400, "invalid_telegram_data");
  }

  return {
    id,
    firstName: params.get("first_name") ?? undefined,
    lastName: params.get("last_name") ?? undefined,
    username: params.get("username") ?? undefined,
    photoUrl: params.get("photo_url") ?? undefined,
  };
}
