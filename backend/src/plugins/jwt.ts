import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import { env } from "../config/env.js";

// Access-токен живёт в памяти клиента (NFR-18), сюда прилетает в заголовке Authorization.
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { clientId: string };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const jwtPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.register(fastifyJwt, {
    secret: env.jwt.accessSecret,
    sign: { expiresIn: env.jwt.accessTtl },
  });

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      // 401 -> клиент дёргает /auth/refresh (LOGIC-004), затем повторяет запрос
      reply.code(401).send({ code: "unauthorized" });
    }
  });
};

export default fp(jwtPlugin, { name: "jwt" });
