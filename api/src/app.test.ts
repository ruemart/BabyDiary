import { beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Entry, SyncResponse } from "@babymonitor/shared";

const INVITE = "test-household-secret-0123456789";
process.env["HOUSEHOLD_SECRET"] = INVITE;
process.env["COOKIE_SECRET"] = "test-cookie-secret-0123456789abc";
process.env["COOKIE_SECURE"] = "false";

const { buildApp } = await import("./app.ts");
const { createStore, openDatabase } = await import("./db.ts");

const CHILD_ID = "child-1";

function entry(over: Partial<Entry> & Pick<Entry, "id">): Entry {
  return {
    childId: CHILD_ID,
    type: "feed",
    startedAt: "2026-08-04T10:00:00.000Z",
    endedAt: null,
    amountMl: 120,
    diaper: null,
    weightG: null,
    lengthMm: null,
    headMm: null,
    label: null,
    lifeWeek: null,
    mediaId: null,
    note: null,
    createdBy: "Mama",
    editedAt: "2026-08-04T10:00:00.000Z",
    deleted: false,
    ...over,
  };
}

let app: FastifyInstance;
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "bm-app-"));
  const store = createStore(openDatabase(join(dir, "test.db")));
  app = Fastify();
  await app.register(cookie);
  await app.register(multipart);
  await app.register(buildApp, { store });
  await app.ready();

  return async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  };
});

async function login(name = "Mama"): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/session",
    payload: { token: INVITE, name },
  });
  expect(res.statusCode).toBe(200);
  const setCookie = res.headers["set-cookie"];
  return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0]!;
}

describe("Einladung", () => {
  it("setzt ein langlebiges Cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/session",
      payload: { token: INVITE, name: "Papa" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ name: "Papa" });

    const raw = String(res.headers["set-cookie"]);
    expect(raw).toContain("HttpOnly");
    expect(raw).toContain("SameSite=Lax");
    // Ein Jahr — damit nachts nie ein Anmeldebildschirm dazwischenkommt.
    expect(raw).toMatch(/Max-Age=31536000/);
  });

  it("weist ein falsches Token ab", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/session",
      payload: { token: "falsch", name: "Fremder" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("schützt den Sync", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/sync",
      payload: { childId: CHILD_ID, since: 0, changes: [], child: null },
    });
    // JSON, kein Redirect: der Service Worker soll das als Fehler sehen, nicht als HTML.
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
  });
});

describe("Sync über HTTP", () => {
  it("schiebt hoch und zieht in einem Durchgang", async () => {
    const jar = await login();

    const push = await app.inject({
      method: "POST",
      url: "/api/sync",
      headers: { cookie: jar },
      payload: { childId: CHILD_ID, since: 0, changes: [entry({ id: "a" })], child: null },
    });

    expect(push.statusCode).toBe(200);
    const body = push.json<SyncResponse>();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]!.id).toBe("a");
    expect(body.rev).toBeGreaterThan(0);
    expect(body.rejected).toEqual([]);
  });

  it("stempelt createdBy aus dem Cookie, nicht aus dem Body", async () => {
    const jar = await login("Papa");

    const res = await app.inject({
      method: "POST",
      url: "/api/sync",
      headers: { cookie: jar },
      payload: {
        childId: CHILD_ID,
        since: 0,
        // Der Client behauptet "Mama" — der Server muss das überschreiben.
        changes: [entry({ id: "a", createdBy: "Mama" })],
        child: null,
      },
    });

    expect(res.json<SyncResponse>().entries[0]!.createdBy).toBe("Papa");
  });

  it("gibt einem zweiten Gerät die Änderungen des ersten", async () => {
    const mama = await login("Mama");
    const papa = await login("Papa");

    await app.inject({
      method: "POST",
      url: "/api/sync",
      headers: { cookie: mama },
      payload: { childId: CHILD_ID, since: 0, changes: [entry({ id: "a" })], child: null },
    });

    const pull = await app.inject({
      method: "POST",
      url: "/api/sync",
      headers: { cookie: papa },
      payload: { childId: CHILD_ID, since: 0, changes: [], child: null },
    });

    expect(pull.json<SyncResponse>().entries.map((e) => e.id)).toEqual(["a"]);
  });

  it("weist ein Payload zurück, das dem Schema widerspricht", async () => {
    const jar = await login();

    const res = await app.inject({
      method: "POST",
      url: "/api/sync",
      headers: { cookie: jar },
      // feed ohne amountMl — superRefine muss zuschlagen
      payload: {
        childId: CHILD_ID,
        since: 0,
        changes: [entry({ id: "a", amountMl: null })],
        child: null,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("bad_request");
  });
});

describe("Medien", () => {
  it("weist Pfad-Traversal in der Medien-Id ab", async () => {
    const jar = await login();
    const res = await app.inject({
      method: "GET",
      url: "/api/media/..%2F..%2F..%2Fetc%2Fpasswd",
      headers: { cookie: jar },
    });
    expect(res.statusCode).toBe(400);
  });

  it("liefert 404 für eine wohlgeformte, aber unbekannte Id", async () => {
    const jar = await login();
    const res = await app.inject({
      method: "GET",
      url: "/api/media/0192f5a0-1234-7abc-8def-0123456789ab.jpg",
      headers: { cookie: jar },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("Health", () => {
  it("antwortet ohne Cookie", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });
});
