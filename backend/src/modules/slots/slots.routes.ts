import type { FastifyInstance } from "fastify";
import { getSlotById, getSlots } from "./slots.service.js";

export async function slotsRoutes(app: FastifyInstance) {
  // FR-9, FR-11: список слотов на 7 дней вперёд + фильтры (проксируется во внешний бэкенд)
  app.get("/slots", { preHandler: [app.authenticate] }, async (request, reply) => {
    const data = await getSlots(request.query as Record<string, string | string[]>);
    reply.send(data);
  });

  // FR-10: карточка слота
  app.get<{ Params: { slotId: string } }>(
    "/slots/:slotId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const data = await getSlotById(request.params.slotId);
      reply.send(data);
    }
  );
}
