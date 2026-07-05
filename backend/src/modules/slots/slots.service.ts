// Слоты/инструкторы — read-only данные существующего бэкенда скалодрома (R-004, R-015).
// Этот сервис — тонкий прокси-слой: BFF не хранит и не кэширует слоты у себя,
// он лишь дергает внешний API и (при необходимости) обогащает ответ данными,
// которые знает только BFF (например, is_beginner клиента для UI-подсказок).

import { env } from "../../config/env.js";
import { ApiError } from "../../lib/errors.js";

async function externalFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${env.externalBackend.url}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.externalBackend.apiKey}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    throw new ApiError(res.status, "external_backend_error");
  }
  return res.json();
}

// TODO (открытый вопрос из ревью): avg_rating инструктора считается в БД BFF (ratings),
// но карточка слота отдаётся внешним бэкендом. Нужно решить один из вариантов:
// 1) внешний бэкенд запрашивает avg_rating у BFF синхронно/по событию;
// 2) BFF проксирует /slots и подмешивает avg_rating из своей БД перед ответом клиенту
//    (текущая заготовка ниже реализует именно этот вариант — как временное решение).
export async function getSlots(query: Record<string, string | string[]>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) v.forEach((item) => params.append(k, item));
    else if (v) params.set(k, v);
  }
  return externalFetch(`/slots?${params.toString()}`);
}

export async function getSlotById(slotId: string) {
  return externalFetch(`/slots/${slotId}`);
}
