import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import fastifyCookie from "@fastify/cookie";
import { env } from "../config/env.js";

// NFR-18: refresh-токен живёт в httpOnly+Secure+SameSite=Strict cookie, недоступен из JS.
// Куки не подписываем секретом @fastify/cookie — сам refresh-токен это JWT
// (сам себя проверяет подписью JWT_REFRESH_SECRET, см. token.service.ts), а CSRF-cookie
// намеренно читаема из JS (double-submit), так что подпись cookie тут не даёт доп. защиты.
const cookiePlugin: FastifyPluginAsync = async (app) => {
  await app.register(fastifyCookie, {
    secret: env.cookies.signSecret,
  });
};

export default fp(cookiePlugin, { name: "cookie" });
