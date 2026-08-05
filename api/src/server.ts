import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { config } from "./config.ts";
import { buildApp } from "./app.ts";
import { openDatabase, createStore } from "./db.ts";
import { createWeatherStore } from "./weather.ts";
import {
  createPushStore,
  dueNotifications,
  isPushConfigured,
  predictNextFeed,
  sendTo,
} from "./push.ts";

const db = openDatabase(config.databasePath);
const store = createStore(db);
const weather = createWeatherStore(db);
const push = createPushStore(db);

const app = Fastify({
  logger: { level: process.env["LOG_LEVEL"] ?? "info" },
  // Behind the tunnel the real client IP sits in X-Forwarded-For.
  trustProxy: true,
  bodyLimit: 8 * 1024 * 1024,
});

await app.register(cookie);
await app.register(multipart, {
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
});
await app.register(buildApp, { store, weather, push });

/**
 * Scheduler for the bottle reminder.
 *
 * Check every minute rather than scheduling one job per feed: entries arrive offline
 * and get backdated, so a job set once would be wrong most of the time. One look at a
 * few dozen rows per minute costs nothing on the Pi.
 */
let notifyTimer: ReturnType<typeof setInterval> | null = null;

if (isPushConfigured()) {
  notifyTimer = setInterval(() => {
    void (async () => {
      try {
        const child = store.getChild();
        if (!child) return;

        const subs = push.all();
        if (subs.length === 0) return;

        const next = predictNextFeed(store, child.id);
        const due = dueNotifications(subs, next, new Date(), child.timezone);

        for (const { sub, notification } of due) {
          const ok = await sendTo(push, sub, notification);
          if (ok) push.markNotified(sub.endpoint, next!.lastFeedId);
        }

        const pruned = push.prune();
        if (pruned > 0) app.log.info({ pruned }, "Tote Push-Anmeldungen entfernt");
      } catch (err) {
        app.log.warn({ err }, "Erinnerungslauf fehlgeschlagen");
      }
    })();
  }, 60_000);
  app.log.info("Fläschchen-Erinnerung aktiv");
} else {
  app.log.info("Push nicht eingerichtet (VAPID-Schlüssel fehlen) — Erinnerungen aus");
}

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "fahre herunter");
  if (notifyTimer) clearInterval(notifyTimer);
  await app.close();
  db.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ port: config.port, host: config.host });
