import { buildApp } from "./app.js";
import { env } from "./config/env.js";

async function main() {
  const app = await buildApp();

  try {
    await app.listen({ port: env.port, host: "0.0.0.0" });
    console.log(`BFF "Вертикаль" слушает на порту ${env.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
