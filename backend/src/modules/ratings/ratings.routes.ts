import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "../../lib/errors.js";

const submitRatingSchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

// UC-4, FR-40: разовая оценка инструктора, без редактирования.
export async function ratingsRoutes(app: FastifyInstance) {
  app.post<{ Params: { bookingId: string } }>(
    "/bookings/:bookingId/rating",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const clientId = (request.user as { clientId: string }).clientId;
      const { stars, comment } = submitRatingSchema.parse(request.body);

      const booking = await app.prisma.booking.findUnique({
        where: { id: request.params.bookingId },
        include: { rating: true },
      });

      if (!booking || booking.clientId !== clientId) {
        throw new ApiError(404, "not_found");
      }
      if (booking.rating) {
        return reply.code(409).send({ code: "already_rated" });
      }
      // TODO: проверить, что тренировка действительно завершена (slot.start_at в прошлом) —
      // start_at слота хранится во внешнем бэкенде, нужно либо запросить его,
      // либо денормализовать при создании брони (см. TODO в bookings.service.ts).

      // TODO: instructorId нужно достать из слота (внешний бэкенд) — здесь заглушка.
      const rating = await app.prisma.rating.create({
        data: {
          bookingId: booking.id,
          clientId,
          instructorId: "TODO_instructor_id",
          stars,
          comment,
        },
      });

      reply.code(201).send(rating);
    }
  );
}
