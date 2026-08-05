import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { z } from "zod";
import {
  childSchema,
  entrySchema,
  syncEnvelopeSchema,
  uuidv7,
  type Entry,
  type SyncResponse,
} from "@babymonitor/shared";
import { config } from "./config.ts";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  isValidInvite,
  newSession,
  signSession,
  verifySession,
  type Session,
} from "./auth.ts";
import type { Store } from "./db.ts";
import { renderTimelapse } from "./timelapse.ts";
import { isPushConfigured, predictNextFeed, sendTo, type PushStore } from "./push.ts";
import {
  createWeatherStore,
  fetchDailyTemperatures,
  searchPlaces,
  type WeatherStore,
} from "./weather.ts";

declare module "fastify" {
  interface FastifyRequest {
    session?: Session;
  }
}

/** Short, readable reason to hand back to the device. */
function describeIssues(issues: { path: (string | number)[]; message: string }[]): string {
  return issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "Eintrag"}: ${i.message}`)
    .join("; ");
}

const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

export async function buildApp(
  app: FastifyInstance,
  opts: { store: Store; weather?: WeatherStore; push?: PushStore },
) {
  const { store } = opts;
  const weather = opts.weather;
  const push = opts.push;

  /** Everything under /api/ needs a valid cookie — except the three exceptions. */
  const OPEN_ROUTES = new Set(["/api/health", "/api/session", "/api/session/check"]);

  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.url.startsWith("/api/")) return;
    const path = req.url.split("?")[0]!;
    if (OPEN_ROUTES.has(path)) return;

    const session = verifySession(req.cookies[SESSION_COOKIE], config.cookieSecret);
    if (!session) {
      // 401 as JSON, never as a redirect: the service worker would otherwise treat a
      // login HTML page as an API response and syncing would run into a parse error.
      return reply.code(401).send({ error: "unauthorized" });
    }
    req.session = session;
  });

  app.get("/api/health", async () => ({
    ok: true,
    rev: store.currentRev(),
    time: new Date().toISOString(),
    /**
     * Suggested country, set during installation (see install.sh).
     *
     * Only a SUGGESTION for the setup screen — the binding value lives with the child
     * and can be changed in Settings at any time. Served from /api/health because the
     * setup screen runs before a child exists.
     */
    defaultRegion: config.defaultRegion,
  }));

  /* ── Sitzung ──────────────────────────────────────────────────────────────── */

  const sessionBody = z.object({
    token: z.string().min(1).max(200),
    name: z.string().min(1).max(40),
  });

  app.post("/api/session", async (req, reply) => {
    const parsed = sessionBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request" });

    if (!isValidInvite(parsed.data.token, config.householdSecret)) {
      req.log.warn({ ip: req.ip }, "ungültiges Einladungs-Token");
      return reply.code(403).send({ error: "invalid_invite" });
    }

    const session = newSession(parsed.data.name.trim());
    reply.setCookie(SESSION_COOKIE, signSession(session, config.cookieSecret), {
      path: "/",
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return { name: session.name };
  });

  app.get("/api/session/check", async (req) => {
    const session = verifySession(req.cookies[SESSION_COOKIE], config.cookieSecret);
    return session ? { authenticated: true, name: session.name } : { authenticated: false };
  });

  /* ── Sync ─────────────────────────────────────────────────────────────────── */

  app.post("/api/sync", async (req, reply) => {
    const envelope = syncEnvelopeSchema.safeParse(req.body);
    if (!envelope.success) {
      req.log.warn({ issues: envelope.error.issues }, "Sync-Umschlag unbrauchbar");
      return reply.code(400).send({ error: "bad_request", issues: envelope.error.issues });
    }

    /**
     * Validate every change INDIVIDUALLY, not the batch as a whole.
     *
     * Previously a single invalid entry blocked the entire sync — permanently. The
     * server rejected the whole batch, the device's outbox never drained, and every
     * entry created afterwards was stuck as well. All the user saw was "sync problem".
     *
     * One bad record must never hold the queue hostage.
     */
    const changes: Entry[] = [];
    const invalid: { id: string; reason: string }[] = [];

    for (const raw of envelope.data.changes) {
      const result = entrySchema.safeParse(raw);
      if (result.success) {
        changes.push(result.data);
      } else {
        const id = typeof raw?.["id"] === "string" ? raw["id"] : "unbekannt";
        invalid.push({ id, reason: describeIssues(result.error.issues) });
      }
    }

    if (invalid.length > 0) {
      req.log.warn({ invalid }, "Einzelne Einträge abgelehnt, Rest wird übernommen");
    }

    const childResult = envelope.data.child
      ? childSchema.safeParse(envelope.data.child)
      : null;
    if (childResult && !childResult.success) {
      invalid.push({
        id: "child",
        reason: describeIssues(childResult.error.issues),
      });
    }
    const child = childResult?.success ? childResult.data : null;

    const { childId, since } = envelope.data;

    /**
     * A freshly invited second device does not know the childId yet and sends a
     * placeholder. The server resolves it from the existing record so the device gets
     * the child and the entries — instead of showing the setup screen and ending up
     * creating a second child.
     *
     * One household, one child: if there is one here already, it wins.
     */
    const effectiveChildId = store.getChild()?.id ?? childId;

    // `createdBy` comes from the cookie, not from the body — otherwise a device could
    // create entries under someone else's name.
    const stamped = changes.map((c) => ({ ...c, createdBy: req.session!.name }));

    const { rejected, failed } = store.applyChanges(effectiveChildId, stamped, child);

    // What the database rejected counts as a schema error: permanently unusable, so
    // report it rather than letting it be retried forever.
    if (failed.length > 0) {
      req.log.error({ failed }, "Einträge von der Datenbank abgelehnt");
      invalid.push(...failed);
    }

    const response: SyncResponse = {
      rev: store.currentRev(),
      entries: store.entriesSince(effectiveChildId, since),
      child: store.getChild(),
      rejected,
      invalid,
    };
    return response;
  });

  /* ── Medien ───────────────────────────────────────────────────────────────── */

  app.post("/api/media", async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no_file" });

    const ext = ALLOWED_IMAGE_TYPES.get(file.mimetype);
    if (!ext) return reply.code(415).send({ error: "unsupported_type", got: file.mimetype });

    const id = uuidv7();
    await mkdir(config.mediaDir, { recursive: true });
    const path = join(config.mediaDir, `${id}${ext}`);

    const buffer = await file.toBuffer();
    if (file.file.truncated) {
      return reply.code(413).send({ error: "too_large" });
    }
    await writeFile(path, buffer);

    req.log.info({ id, bytes: buffer.length, mime: file.mimetype }, "Bild gespeichert");
    return { mediaId: `${id}${ext}`, bytes: buffer.length };
  });

  app.get<{ Params: { id: string } }>("/api/media/:id", async (req, reply) => {
    const id = req.params.id;
    // Path traversal: only allow the names we handed out ourselves.
    if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(id)) {
      return reply.code(400).send({ error: "bad_id" });
    }
    const path = join(config.mediaDir, id);
    try {
      const info = await stat(path);
      const mime = extname(id) === ".png" ? "image/png"
        : extname(id) === ".webp" ? "image/webp"
        : "image/jpeg";
      // Images never change — the file name contains the id.
      reply.header("cache-control", "private, max-age=31536000, immutable");
      reply.header("content-type", mime);
      reply.header("content-length", info.size);
      return reply.send(createReadStream(path));
    } catch {
      return reply.code(404).send({ error: "not_found" });
    }
  });

  /* ── Wetter ───────────────────────────────────────────────────────────────── */

  /**
   * Ask the service at most once an hour.
   *
   * The daily values do not change by the minute, and four devices syncing every
   * 30 seconds would otherwise flood Open-Meteo for no reason.
   */
  const REFRESH_AFTER_MS = 60 * 60 * 1000;
  let refreshing: Promise<void> | null = null;

  async function refreshWeatherIfStale(): Promise<void> {
    if (!weather) return;
    const child = store.getChild();
    if (!child?.latitude || !child?.longitude) return;

    const last = weather.lastFetchedAt();
    if (last && Date.now() - Date.parse(last) < REFRESH_AFTER_MS) return;

    // Only one fetch at a time, even when several devices ask in parallel.
    refreshing ??= (async () => {
      try {
        // First the home location for the rolling window …
        const days = await fetchDailyTemperatures(
          child.latitude!,
          child.longitude!,
          child.timezone,
        );
        weather.save(days);

        // … then the trips, which override the home location for their days.
        // Order matters: the later call wins per day.
        for (const away of store.locatedAbsences()) {
          try {
            const awayDays = await fetchDailyTemperatures(
              away.latitude,
              away.longitude,
              child.timezone,
              { from: away.from, to: away.to },
            );
            weather.save(awayDays);
          } catch (err) {
            app.log.warn({ err, away }, "Wetter für Abwesenheit nicht abrufbar");
          }
        }

        app.log.info({ days: days.length, ort: child.placeName }, "Wetter aktualisiert");
      } catch (err) {
        app.log.warn({ err }, "Wetterabruf fehlgeschlagen");
      } finally {
        refreshing = null;
      }
    })();

    await refreshing;
  }

  app.get<{ Querystring: { from?: string; to?: string } }>(
    "/api/weather",
    async (req, reply) => {
      if (!weather) return reply.send([]);

      const isDay = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
      const to = isDay(req.query.to) ? req.query.to : new Date().toISOString().slice(0, 10);
      const from = isDay(req.query.from) ? req.query.from : "1970-01-01";

      // Do not block when the service is slow: serve what is there first.
      void refreshWeatherIfStale();
      return weather.range(from, to);
    },
  );

  app.get<{ Querystring: { q?: string } }>("/api/places", async (req, reply) => {
    const query = (req.query.q ?? "").trim();
    if (query.length < 2) return reply.send([]);
    try {
      return await searchPlaces(query);
    } catch (err) {
      req.log.warn({ err }, "Ortssuche fehlgeschlagen");
      return reply.code(503).send({ error: "geocoding_unavailable" });
    }
  });

  /* ── Benachrichtigungen ───────────────────────────────────────────────────── */

  app.get("/api/push/key", async () => ({
    // Empty means push is not configured on this server. The app then hides the
    // section rather than offering a button that does nothing.
    publicKey: isPushConfigured() ? config.vapidPublicKey : null,
  }));

  const subscribeBody = z.object({
    endpoint: z.string().url().max(1000),
    keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(200) }),
    leadMinutes: z.number().int().min(0).max(120).default(10),
    /** This device's language — decides the language of the notification. */
    locale: z.string().max(8).default("en"),
    /** Quiet hours as a pair of local hours; null means around the clock. */
    quietFromHour: z.number().int().min(0).max(23).nullable().default(22),
    quietToHour: z.number().int().min(0).max(23).nullable().default(6),
  });

  app.post("/api/push/subscribe", async (req, reply) => {
    if (!push || !isPushConfigured()) return reply.code(503).send({ error: "push_disabled" });
    const parsed = subscribeBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request" });

    const d = parsed.data;
    push.save({
      endpoint: d.endpoint,
      p256dh: d.keys.p256dh,
      auth: d.keys.auth,
      device_name: req.session!.name,
      lead_minutes: d.leadMinutes,
      locale: d.locale,
      quiet_from_hour: d.quietFromHour,
      quiet_to_hour: d.quietToHour,
    });
    req.log.info({ device: req.session!.name }, "Push-Anmeldung gespeichert");
    return { ok: true };
  });

  app.post<{ Body: { endpoint?: string } }>("/api/push/unsubscribe", async (req, reply) => {
    if (!push) return reply.code(503).send({ error: "push_disabled" });
    const endpoint = req.body?.endpoint;
    if (typeof endpoint === "string") push.remove(endpoint);
    return { ok: true };
  });

  app.post<{ Body: { endpoint?: string } }>("/api/push/test", async (req, reply) => {
    if (!push || !isPushConfigured()) return reply.code(503).send({ error: "push_disabled" });
    const sub = typeof req.body?.endpoint === "string" ? push.get(req.body.endpoint) : undefined;
    if (!sub) return reply.code(404).send({ error: "not_subscribed" });

    const ok = await sendTo(push, sub, {
      title: "Benachrichtigungen sind an",
      body: "So sieht die Erinnerung aus, wenn die nächste Flasche fällig sein könnte.",
      tag: "test",
      url: "/",
    });
    return ok ? { ok: true } : reply.code(502).send({ error: "send_failed" });
  });

  /** How the app estimates the next moment — also useful for display. */
  app.get("/api/push/next", async () => {
    const child = store.getChild();
    if (!child) return { next: null };
    return { next: predictNextFeed(store, child.id) };
  });

  /* ── Zeitraffer ───────────────────────────────────────────────────────────── */

  app.get("/api/photos/timelapse", async (req, reply) => {
    const child = store.getChild();
    if (!child) return reply.code(400).send({ error: "no_child" });

    const photos = store
      .entriesSince(child.id, 0)
      .filter((e) => e.type === "photo" && !e.deleted && e.mediaId)
      .sort((a, b) => (a.lifeWeek ?? 0) - (b.lifeWeek ?? 0));

    if (photos.length < 2) {
      return reply.code(400).send({ error: "not_enough_photos", have: photos.length });
    }

    try {
      const output = await renderTimelapse(
        photos.map((p) => join(config.mediaDir, p.mediaId!)),
        config.dataDir,
      );
      reply.header("content-type", "video/mp4");
      reply.header(
        "content-disposition",
        `attachment; filename="${child.name.replace(/[^\w]/g, "_")}-zeitraffer.mp4"`,
      );
      return reply.send(createReadStream(output));
    } catch (err) {
      req.log.error({ err }, "Zeitraffer fehlgeschlagen");
      return reply.code(503).send({
        error: "ffmpeg_unavailable",
        hint: "ffmpeg ist im API-Container nicht installiert oder abgestürzt.",
      });
    }
  });

  return app;
}
