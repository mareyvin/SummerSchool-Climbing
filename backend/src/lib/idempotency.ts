// Идемпотентность createBooking (LOGIC-001, NFR-9).
// Простейшая реализация: Idempotency-Key -> уникальный constraint в таблице bookings.
// Если тот же ключ уже есть — возвращаем существующую бронь вместо создания новой.

import type { PrismaClient } from "@prisma/client";
import { ApiError } from "./errors.js";

export function getIdempotencyKey(headers: Record<string, unknown>): string {
  const key = headers["idempotency-key"];
  if (typeof key !== "string" || key.length < 8) {
    throw new ApiError(400, "idempotency_key_required");
  }
  return key;
}

export async function findExistingBookingByKey(prisma: PrismaClient, key: string, clientId: string) {
  return prisma.booking.findUnique({ where: { clientId_idempotencyKey: { clientId, idempotencyKey: key } } });
}
