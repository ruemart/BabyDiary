import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { config } from "./config.ts";
import { buildApp } from "./app.ts";
import { openDatabase, createStore } from "./db.ts";

const db = openDatabase(config.databasePath);
const store = createStore(db);

const app = Fastify({
  logger: { level: process.env["LOG_LEVEL"] ?? "info" },
  // Hinter dem Tunnel steht die echte Client-IP in X-Forwarded-For.
  trustProxy: true,
  bodyLimit: 8 * 1024 * 1024,
});

await app.register(cookie);
await app.register(multipart, {
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
});
await app.register(buildApp, { store });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "fahre herunter");
  await app.close();
  db.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ port: config.port, host: config.host });
