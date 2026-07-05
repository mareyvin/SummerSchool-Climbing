import Fastify from "fastify";
import cors from "@fastify/cors";

import prismaPlugin from "./plugins/prisma.js";
import redisPlugin from "./plugins/redis-client.js";
import cookiePlugin from "./plugins/cookie.js";
import jwtPlugin from "./plugins/jwt.js";
import csrfPlugin from "./plugins/csrf.js";

import { authRoutes } from "./modules/auth/auth.routes.js";
import { slotsRoutes } from "./modules/slots/slots.routes.js";
import { bookingsRoutes } from "./modules/bookings/bookings.routes.js";
import { ratingsRoutes } from "./modules/ratings/ratings.routes.js";
import { profileRoutes } from "./modules/profile/profile.routes.js";
import { notificationsRoutes } from "./modules/notifications/notifications.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      // NFR-20: запрет логирования полного номера телефона и OTP-кода.
      // Сами сервисы (otp.service.ts) и так не логируют код целиком и маскируют номер,
      // это — дополнительный барьер на случай, если тело запроса попадёт в лог.
      redact: {
        paths: [
          "req.body.phone",
          "req.body.new_phone",
          "req.body.code",
          "req.body.telegram_init_data",
        ],
        censor: "[REDACTED]",
      },
    },
  });

  await app.register(cors, { origin: true, credentials: true });

  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(cookiePlugin);
  await app.register(jwtPlugin);
  await app.register(csrfPlugin);

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(authRoutes);
  await app.register(slotsRoutes);
  await app.register(bookingsRoutes);
  await app.register(ratingsRoutes);
  await app.register(profileRoutes);
  await app.register(notificationsRoutes);

  return app;
}
