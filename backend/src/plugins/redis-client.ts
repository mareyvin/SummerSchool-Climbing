import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { Redis } from "ioredis";
import { env } from "../config/env.js";

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis;
  }
}

const redisPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const redis = new Redis(env.redisUrl, { maxRetriesPerRequest: null });

  app.decorate("redis", redis);

  app.addHook("onClose", async (instance) => {
    await instance.redis.quit();
  });
};

export default fp(redisPlugin, { name: "redis-client" });
