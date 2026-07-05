import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { env } from "../config/env.js";
import { csrfTokensMatch } from "../modules/auth/token.service.js";

// NFR-18: CSRF-защита на мутирующих запросах, использующих cookie-based refresh.
// Double-submit cookie: значение CSRF-cookie (не httpOnly, читается из JS фронтендом)
// должно совпад��ть со значением заголовка X-CSRF-Token. Сторонний сайт не может прочитать
// нашу cookie (Same-Origin Policy), поэтому не может подставить верный заголовок.
declare module "fastify" {
  interface FastifyInstance {
    verifyCsrf: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    cookies: Record<string, string | undefined>;
  }
}

const csrfPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.decorate("verifyCsrf", async (request: FastifyRequest, reply: FastifyReply) => {
    const cookieValue = request.cookies[env.cookies.csrfCookieName];
    const headerValue = request.headers["x-csrf-token"];
    const headerStr = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!csrfTokensMatch(cookieValue, headerStr)) {
      reply.code(403).send({ code: "csrf_token_invalid" });
    }
  });
};

export default fp(csrfPlugin, { name: "csrf", dependencies: ["cookie"] });
