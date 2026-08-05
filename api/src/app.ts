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

/** Kurze, lesbare Begründung für die Rückmeldung ans Gerät. */
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

  /** Alles unter /api/ braucht ein gültiges Cookie — außer den drei Ausnahmen. */
  const OPEN_ROUTES = new Set(["/api/health", "/api/session", "/api/session/check"]);

  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.url.startsWith("/api/")) return;
    const path = req.url.split("?")[0]!;
    if (OPEN_ROUTES.has(path)) return;

    const session = verifySession(req.cookies[SESSION_COOKIE], config.cookieSecret);
    if (!session) {
      // 401 als JSON, nie als Redirect: der Service Worker würde eine Login-HTML-Seite
      // sonst als API-Antwort behandeln und der Sync liefe in einen Parse-Fehler.
      return reply.code(401).send({ error: "unauthorized" });
    }
    req.session = session;
  });

  app.get("/api/health", async () => ({
    ok: true,
    rev: store.currentRev(),
    time: new Date().toISOString(),
    /**
     * Voreinstellung für das Land, gesetzt beim Einrichten (siehe install.sh).
     *
     * Nur ein VORSCHLAG für den Einrichtungs-Assistenten — die verbindliche Angabe
     * steht am Kind und lässt sich jederzeit in den Einstellungen ändern. Über
     * /api/health, weil der Assistent läuft, bevor es ein Kind gibt.
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
     * Jede Änderung EINZELN prüfen, nicht das Paket als Ganzes.
     *
     * Vorher blockierte ein einziger ungültiger Eintrag den kompletten Abgleich —
     * dauerhaft. Der Server wies das ganze Paket ab, der Ausgangskorb des Geräts
     * leerte sich nie, und jeder danach angelegte Eintrag blieb ebenfalls liegen.
     * Sichtbar war davon nur "Abgleich gestört".
     *
     * Ein fehlerhafter Datensatz darf niemals die Warteschlange als Geisel nehmen.
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
     * Ein frisch eingeladenes zweites Gerät kennt die childId noch nicht und schickt
     * einen Platzhalter. Der Server löst sie aus dem vorhandenen Datensatz auf, damit
     * das Gerät Kind und Einträge bekommt — statt den Einrichtungsdialog zu zeigen und
     * am Ende ein zweites Kind anzulegen.
     *
     * Ein Haushalt, ein Kind: Wenn hier schon eines steht, gewinnt es.
     */
    const effectiveChildId = store.getChild()?.id ?? childId;

    // `createdBy` kommt aus dem Cookie, nicht aus dem Body — sonst könnte ein Gerät
    // Einträge unter fremdem Namen anlegen.
    const stamped = changes.map((c) => ({ ...c, createdBy: req.session!.name }));

    const { rejected, failed } = store.applyChanges(effectiveChildId, stamped, child);

    // Was die Datenbank abgelehnt hat, zählt wie ein Schemafehler: dauerhaft
    // untauglich, also melden statt endlos wiederholen lassen.
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
    // Pfad-Traversal: nur die von uns vergebenen Namen zulassen.
    if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(id)) {
      return reply.code(400).send({ error: "bad_id" });
    }
    const path = join(config.mediaDir, id);
    try {
      const info = await stat(path);
      const mime = extname(id) === ".png" ? "image/png"
        : extname(id) === ".webp" ? "image/webp"
        : "image/jpeg";
      // Bilder ändern sich nie — der Dateiname enthält die Id.
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
   * Höchstens einmal pro Stunde beim Dienst nachfragen.
   *
   * Die Tageswerte ändern sich nicht im Minutentakt, und vier Geräte, die alle
   * 30 Sekunden abgleichen, würden Open-Meteo sonst grundlos zumüllen.
   */
  const REFRESH_AFTER_MS = 60 * 60 * 1000;
  let refreshing: Promise<void> | null = null;

  async function refreshWeatherIfStale(): Promise<void> {
    if (!weather) return;
    const child = store.getChild();
    if (!child?.latitude || !child?.longitude) return;

    const last = weather.lastFetchedAt();
    if (last && Date.now() - Date.parse(last) < REFRESH_AFTER_MS) return;

    // Nur ein Abruf gleichzeitig, auch wenn mehrere Geräte parallel anfragen.
    refreshing ??= (async () => {
      try {
        // Zuerst der Heimatort für das rollende Fenster …
        const days = await fetchDailyTemperatures(
          child.latitude!,
          child.longitude!,
          child.timezone,
        );
        weather.save(days);

        // … danach die Urlaube, die den Heimatort für ihre Tage überschreiben.
        // Reihenfolge ist wichtig: der spätere Aufruf gewinnt pro Tag.
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

      // Nicht blockieren, wenn der Dienst hakt: erst ausliefern, was da ist.
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
    // Leer heißt: Push ist auf diesem Server nicht eingerichtet. Die App blendet
    // den Bereich dann aus, statt einen Knopf anzubieten, der nichts tut.
    publicKey: isPushConfigured() ? config.vapidPublicKey : null,
  }));

  const subscribeBody = z.object({
    endpoint: z.string().url().max(1000),
    keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(200) }),
    leadMinutes: z.number().int().min(0).max(120).default(10),
    /** Sprache dieses Geräts — bestimmt die Sprache der Meldung. */
    locale: z.string().max(8).default("en"),
    /** Ruhezeit als Stundenpaar in Lokalzeit; null heißt rund um die Uhr. */
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

  /** Wie die App den nächsten Zeitpunkt einschätzt — auch für die Anzeige nützlich. */
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
