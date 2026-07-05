import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getIdempotencyKey } from "../../lib/idempotency.js";
import { ApiError } from "../../lib/errors.js";
import { cancelBooking, createBooking, getBookingById, listBookings } from "./bookings.service.js";

const createBookingSchema = z.object({
  slot_id: z.string().uuid(),
  equipment_choice: z.enum(["own", "rental"]),
});

export async function bookingsRoutes(app: FastifyInstance) {
  // UC-1: создание брони, обязателен Idempotency-Key (LOGIC-001)
  app.post("/bookings", { preHandler: [app.authenticate] }, async (request, reply) => {
    const clientId = (request.user as { clientId: string }).clientId;
    const idempotencyKey = getIdempotencyKey(request.headers as Record<string, unknown>);
    const body = createBookingSchema.parse(request.body);

    try {
      const booking = await createBooking(app.prisma, {
        clientId,
        slotId: body.slot_id,
        equipmentChoice: body.equipment_choice === "own" ? "OWN" : "RENTAL",
        idempotencyKey,
      });
      reply.code(201).send(booking);
    } catch (err) {
      if (err instanceof ApiError) {
        return reply.code(err.statusCode).send({ code: err.code, details: err.details });
      }
      throw err;
    }
  });

  // FR-25: список своих броней (upcoming/past)
  app.get("/bookings", { preHandler: [app.authenticate] }, async (request, reply) => {
    const clientId = (request.user as { clientId: string }).clientId;
    const scope = (request.query as { scope?: "upcoming" | "past" }).scope ?? "upcoming";
    const bookings = await listBookings(app.prisma, clientId, scope);
    reply.send({ items: bookings });
  });

  app.get<{ Params: { bookingId: string } }>(
    "/bookings/:bookingId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const clientId = (request.user as { clientId: string }).clientId;
      try {
        const booking = await getBookingById(app.prisma, clientId, request.params.bookingId);
        reply.send(booking);
      } catch (err) {
        if (err instanceof ApiError) {
          return reply.code(err.statusCode).send({ code: err.code });
        }
        throw err;
      }
    }
  );

  // UC-2: отмена брони целиком, ранняя/поздняя определяет сервер (LOGIC-002)
  app.post<{ Params: { bookingId: string } }>(
    "/bookings/:bookingId/cancel",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const clientId = (request.user as { clientId: string }).clientId;
      try {
        const booking = await cancelBooking(app.prisma, clientId, request.params.bookingId);
        reply.code(200).send(booking);
      } catch (err) {
        if (err instanceof ApiError) {
          return reply.code(err.statusCode).send({ code: err.code });
        }
        throw err;
      }
    }
  );
}
