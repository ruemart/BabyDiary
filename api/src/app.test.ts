import { beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Entry, SyncResponse } from "@milo/shared";

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
    spatUp: false,
    vitaminD: false,
    colicDrops: false,
    milestoneKey: null,
    temperatureDc: null,
    latitude: null,
    longitude: null,
    placeName: null,
    supplyCategory: null,
    supplySize: null,
    supplyShop: null,
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

describe("Invitation", () => {
  it("sets a long-lived cookie", async () => {
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
    // A year — so a sign-in screen never gets in the way at night.
    expect(raw).toMatch(/Max-Age=31536000/);
  });

  it("rejects a wrong token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/session",
      payload: { token: "falsch", name: "Fremder" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("protects the sync", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/sync",
      payload: { childId: CHILD_ID, since: 0, changes: [], child: null },
    });
    // JSON, not a redirect: the service worker should see this as an error, not as HTML.
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
  });
});

describe("Sync over HTTP", () => {
  it("pushes and pulls in one round", async () => {
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

  it("stamps createdBy from the cookie, not from the body", async () => {
    const jar = await login("Papa");

    const res = await app.inject({
      method: "POST",
      url: "/api/sync",
      headers: { cookie: jar },
      payload: {
        childId: CHILD_ID,
        since: 0,
        // The client claims "Mama" — the server has to override that.
        changes: [entry({ id: "a", createdBy: "Mama" })],
        child: null,
      },
    });

    expect(res.json<SyncResponse>().entries[0]!.createdBy).toBe("Papa");
  });

  it("gives a second device the first one's changes", async () => {
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

  it("accepts the valid entries and reports back only the faulty one", async () => {
    const jar = await login();

    const res = await app.inject({
      method: "POST",
      url: "/api/sync",
      headers: { cookie: jar },
      payload: {
        childId: CHILD_ID,
        since: 0,
        changes: [
          entry({ id: "gut1" }),
          // Head circumference far out of range — can never be accepted.
          entry({ id: "kaputt", type: "growth", amountMl: null, headMm: 99999 }),
          entry({ id: "gut2" }),
        ],
        child: null,
      },
    });

    // THE decisive point: a single faulty entry must not bring down the whole batch.
    // Otherwise the device's outbox never drains, and EVERY entry created afterwards
    // is stuck forever as well.
    expect(res.statusCode).toBe(200);

    const body = res.json<SyncResponse>();
    expect(body.entries.map((e) => e.id).sort()).toEqual(["gut1", "gut2"]);
    expect(body.invalid).toHaveLength(1);
    expect(body.invalid[0]!.id).toBe("kaputt");
    expect(body.invalid[0]!.reason).toMatch(/headMm/);
  });

  it("accepts entries even when the child details are faulty", async () => {
    const jar = await login();

    const res = await app.inject({
      method: "POST",
      url: "/api/sync",
      headers: { cookie: jar },
      payload: {
        childId: CHILD_ID,
        since: 0,
        changes: [entry({ id: "a" })],
        child: { id: CHILD_ID, name: "X", sex: "female", birthDate: "not-a-date" },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<SyncResponse>();
    expect(body.entries.map((e) => e.id)).toEqual(["a"]);
    expect(body.invalid.some((i) => i.id === "child")).toBe(true);
  });

  it("still rejects an unusable envelope", async () => {
    const jar = await login();
    const res = await app.inject({
      method: "POST",
      url: "/api/sync",
      headers: { cookie: jar },
      payload: { since: "not-numeric", changes: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("Media", () => {
  it("rejects path traversal in the media id", async () => {
    const jar = await login();
    const res = await app.inject({
      method: "GET",
      url: "/api/media/..%2F..%2F..%2Fetc%2Fpasswd",
      headers: { cookie: jar },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for a well-formed but unknown id", async () => {
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
  it("answers without a cookie", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });
});

describe("A second device", () => {
  it("gets the child and the entries without knowing the childId", async () => {
    const mama = await login("Mama");

    // Mama sets things up and records something.
    await app.inject({
      method: "POST",
      url: "/api/sync",
      headers: { cookie: mama },
      payload: {
        childId: CHILD_ID,
        since: 0,
        changes: [entry({ id: "a" })],
        child: {
          id: CHILD_ID,
          name: "Lotte",
          sex: "female",
          birthDate: "2026-06-15",
          dueDate: null,
          birthWeightG: null,
          birthLengthMm: null,
          birthHeadMm: null,
          timezone: "Europe/Berlin",
          latitude: null,
          longitude: null,
          placeName: null,
          editedAt: "2026-08-04T10:00:00.000Z",
        },
      },
    });

    // Papa's device is fresh: empty local database, does not know the childId.
    const papa = await login("Papa");
    const res = await app.inject({
      method: "POST",
      url: "/api/sync",
      headers: { cookie: papa },
      payload: { childId: "bootstrap", since: 0, changes: [], child: null },
    });

    const body = res.json<SyncResponse>();
    // Without resolving it server-side Papa would get nothing here and the app would
    // show him the setup screen — resulting in a second child.
    expect(body.child?.name).toBe("Lotte");
    expect(body.entries.map((e) => e.id)).toEqual(["a"]);
  });
});
