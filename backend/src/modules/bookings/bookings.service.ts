import type { PrismaClient } from "@prisma/client";
import { ApiError } from "../../lib/errors.js";
import { findExistingBookingByKey } from "../../lib/idempotency.js";
import { getSlotById } from "../slots/slots.service.js";

interface CreateBookingInput {
  clientId: string;
  slotId: string;
  equipmentChoice: "OWN" | "RENTAL";
  idempotencyKey: string;
}

// UC-1: createBooking. Финальная атомарная проверка мест/проката — на стороне
// ВНЕШНЕГО бэкенда (R-004: он — источник истины). BFF здесь:
// 1) проверяет идемпотентность по ключу;
// 2) дергает внешний бэкенд для актуализации/резервирования слота (эндпоинт
//    внешнего бэкенда для самого резервирования нужно уточнить отдельно —
//    в текущем контракте есть только read-only GET /slots, см. TODO ниже);
// 3) при успехе сохраняет бронь у себя (это единственная точка правды по Booking).
export async function createBooking(prisma: PrismaClient, input: CreateBookingInput) {
  const existing = await findExistingBookingByKey(prisma, input.idempotencyKey);
  if (existing) {
    // Повтор той же операции — возвращаем прежний результат, а не создаём дубль (NFR-9).
    return existing;
  }

  const slot = await getSlotById(input.slotId);

  // TODO: заменить на реальный вызов внешнего бэкенда, который атомарно
  // резервирует место/прокат и возвращает актуальную цену (price_total).
  // Пример ожидаемых ошибок от него: slot_full, rental_unavailable,
  // beginner_flag_required, slot_cancelled, slot_started (см. use-cases.md → UC-1).
  if (slot?.free_seats !== undefined && slot.free_seats <= 0) {
    throw new ApiError(409, "slot_full", { available_seats: slot.free_seats });
  }

  const booking = await prisma.booking.create({
    data: {
      clientId: input.clientId,
      slotId: input.slotId,
      equipmentChoice: input.equipmentChoice,
      idempotencyKey: input.idempotencyKey,
      priceTotal: slot?.price_total ?? null,
    },
  });

  return booking;
}

export async function listBookings(
  prisma: PrismaClient,
  clientId: string,
  scope: "upcoming" | "past"
) {
  // TODO: "upcoming"/"past" зависит от slot.start_at, который лежит во внешнем
  // бэкенде — нужно либо денормализовать start_at в Booking при создании,
  // либо догружать слоты пачкой и фильтровать на лету. Ниже — временно отдаём
  // все брони клиента без фильтрации по времени.
  return prisma.booking.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getBookingById(prisma: PrismaClient, clientId: string, bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new ApiError(404, "not_found");
  if (booking.clientId !== clientId) throw new ApiError(403, "forbidden");
  return booking;
}

// UC-2: cancelBooking. Порог 2 часа (LOGIC-002) — сервер здесь выступает
// единственным источником истины по времени (сравнение UTC).
export async function cancelBooking(prisma: PrismaClient, clientId: string, bookingId: string) {
  const booking = await getBookingById(prisma, clientId, bookingId);

  if (booking.status !== "ACTIVE") {
    throw new ApiError(409, "already_cancelled");
  }

  const slot = await getSlotById(booking.slotId);
  const startAt = slot?.start_at ? new Date(slot.start_at) : null;

  if (startAt && startAt.getTime() <= Date.now()) {
    throw new ApiError(422, "slot_started");
  }

  const twoHoursMs = 2 * 60 * 60 * 1000;
  const isEarly = startAt ? startAt.getTime() - Date.now() >= twoHoursMs : true;

  return prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: isEarly ? "CANCELLED_EARLY" : "CANCELLED_LATE",
      cancelledAt: new Date(),
    },
  });
}
