import Fastify from "fastify";
import cors from "@fastify/cors";

import prismaPlugin from "./plugins/prisma.js";
import redisPlugin from "./plugins/redis-client.js";
import jwtPlugin from "./plugins/jwt.js";

import { authRoutes } from "./modules/auth/auth.routes.js";
import { slotsRoutes } from "./modules/slots/slots.routes.js";
import { bookingsRoutes } from "./modules/bookings/bookings.routes.js";
import { ratingsRoutes } from "./modules/ratings/ratings.routes.js";
import { profileRoutes } from "./modules/profile/profile.routes.js";
import { notificationsRoutes } from "./modules/notifications/notifications.routes.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true, credentials: true });

  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(jwtPlugin);

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(authRoutes);
  await app.register(slotsRoutes);
  await app.register(bookingsRoutes);
  await app.register(ratingsRoutes);
  await app.register(profileRoutes);
  await app.register(notificationsRoutes);

  return app;
}
