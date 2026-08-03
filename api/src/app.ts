import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { z } from "zod";
import { syncRequestSchema, uuidv7, type SyncResponse } from "@babymonitor/shared";
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

declare module "fastify" {
  interface FastifyRequest {
    session?: Session;
  }
}

const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

export async function buildApp(app: FastifyInstance, opts: { store: Store }) {
  const { store } = opts;

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
    const parsed = syncRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ issues: parsed.error.issues }, "Sync-Payload abgelehnt");
      return reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
    }

    const { childId, since, changes, child } = parsed.data;
    // `createdBy` kommt aus dem Cookie, nicht aus dem Body — sonst könnte ein Gerät
    // Einträge unter fremdem Namen anlegen.
    const stamped = changes.map((c) => ({ ...c, createdBy: req.session!.name }));

    const { rejected } = store.applyChanges(childId, stamped, child);

    const response: SyncResponse = {
      rev: store.currentRev(),
      entries: store.entriesSince(childId, since),
      child: store.getChild(),
      rejected,
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
