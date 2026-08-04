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

    const { rejected } = store.applyChanges(effectiveChildId, stamped, child);

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
