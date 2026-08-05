import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENTRY_TYPES, type Child, type Entry } from "@babymonitor/shared";
import { createStore, openDatabase, type Store } from "./db.ts";

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

function child(over: Partial<Child> = {}): Child {
  return {
    id: CHILD_ID,
    name: "Testkind",
    sex: "female",
    birthDate: "2026-06-15",
    dueDate: "2026-06-20",
    birthWeightG: 3200,
    birthLengthMm: 510,
    birthHeadMm: 350,
    timezone: "Europe/Berlin",
    region: "de",
    latitude: null,
    longitude: null,
    placeName: null,
    editedAt: "2026-08-04T10:00:00.000Z",
    ...over,
  };
}

let dir: string;
let store: Store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bm-test-"));
  store = createStore(openDatabase(join(dir, "test.db")));
  return () => rmSync(dir, { recursive: true, force: true });
});

describe("Sync fundamentals", () => {
  it("accepts entries and returns them from the cursor", () => {
    store.applyChanges(CHILD_ID, [entry({ id: "a" }), entry({ id: "b" })], null);

    const all = store.entriesSince(CHILD_ID, 0);
    expect(all.map((e) => e.id)).toEqual(["a", "b"]);
    expect(all[0]!.amountMl).toBe(120);
  });

  it("returns only what is new from a cursor", () => {
    store.applyChanges(CHILD_ID, [entry({ id: "a" })], null);
    const afterFirst = store.currentRev();
    store.applyChanges(CHILD_ID, [entry({ id: "b" })], null);

    expect(store.entriesSince(CHILD_ID, afterFirst).map((e) => e.id)).toEqual(["b"]);
  });

  it("assigns strictly increasing rev — even for a batch", () => {
    store.applyChanges(
      CHILD_ID,
      [entry({ id: "a" }), entry({ id: "b" }), entry({ id: "c" })],
      null,
    );
    const revs = store.entriesSince(CHILD_ID, 0).map((e) => e.rev);
    expect(revs).toEqual([...revs].sort((x, y) => x - y));
    expect(new Set(revs).size).toBe(3);
  });

  it("keeps children apart", () => {
    store.applyChanges(CHILD_ID, [entry({ id: "a" })], null);
    store.applyChanges("child-2", [entry({ id: "b", childId: "child-2" })], null);

    expect(store.entriesSince(CHILD_ID, 0).map((e) => e.id)).toEqual(["a"]);
    expect(store.entriesSince("child-2", 0).map((e) => e.id)).toEqual(["b"]);
  });
});

describe("Conflict resolution (last-write-wins)", () => {
  it("lets the newer change win", () => {
    store.applyChanges(CHILD_ID, [entry({ id: "a", amountMl: 100 })], null);
    const result = store.applyChanges(
      CHILD_ID,
      [entry({ id: "a", amountMl: 150, editedAt: "2026-08-04T11:00:00.000Z" })],
      null,
    );

    expect(result.rejected).toEqual([]);
    expect(store.entriesSince(CHILD_ID, 0)[0]!.amountMl).toBe(150);
  });

  it("discards the older change and reports it back", () => {
    store.applyChanges(
      CHILD_ID,
      [entry({ id: "a", amountMl: 150, editedAt: "2026-08-04T11:00:00.000Z" })],
      null,
    );
    const result = store.applyChanges(
      CHILD_ID,
      [entry({ id: "a", amountMl: 100, editedAt: "2026-08-04T10:00:00.000Z" })],
      null,
    );

    expect(result.rejected).toEqual(["a"]);
    expect(store.entriesSince(CHILD_ID, 0)[0]!.amountMl).toBe(150);
  });

  it("gives the server the win on a tie", () => {
    // Otherwise two devices with identical editedAt would rewrite each other forever.
    store.applyChanges(CHILD_ID, [entry({ id: "a", amountMl: 150 })], null);
    const result = store.applyChanges(CHILD_ID, [entry({ id: "a", amountMl: 100 })], null);

    expect(result.rejected).toEqual(["a"]);
    expect(store.entriesSince(CHILD_ID, 0)[0]!.amountMl).toBe(150);
  });

  it("compares timestamps with an offset correctly", () => {
    // 12:00+02:00 is 10:00Z — so OLDER than 11:00Z, even though the string looks bigger.
    // Without normalising to UTC the comparison here would come out backwards.
    store.applyChanges(
      CHILD_ID,
      [entry({ id: "a", amountMl: 150, editedAt: "2026-08-04T11:00:00.000Z" })],
      null,
    );
    const result = store.applyChanges(
      CHILD_ID,
      [entry({ id: "a", amountMl: 100, editedAt: "2026-08-04T12:00:00.000+02:00" })],
      null,
    );

    expect(result.rejected).toEqual(["a"]);
    expect(store.entriesSince(CHILD_ID, 0)[0]!.amountMl).toBe(150);
  });
});

describe("Soft-Delete", () => {
  it("carries a deletion as its own revision", () => {
    store.applyChanges(CHILD_ID, [entry({ id: "a" })], null);
    const cursorBeforeDelete = store.currentRev();

    store.applyChanges(
      CHILD_ID,
      [entry({ id: "a", deleted: true, editedAt: "2026-08-04T11:00:00.000Z" })],
      null,
    );

    // The second device has to see the deletion on pull — which is why the row stays
    // and gets a new rev instead of disappearing.
    const delta = store.entriesSince(CHILD_ID, cursorBeforeDelete);
    expect(delta).toHaveLength(1);
    expect(delta[0]!.id).toBe("a");
    expect(delta[0]!.deleted).toBe(true);
  });

  it("does not let an older version revive a deletion", () => {
    store.applyChanges(
      CHILD_ID,
      [entry({ id: "a", deleted: true, editedAt: "2026-08-04T11:00:00.000Z" })],
      null,
    );
    store.applyChanges(
      CHILD_ID,
      [entry({ id: "a", deleted: false, editedAt: "2026-08-04T10:00:00.000Z" })],
      null,
    );

    expect(store.entriesSince(CHILD_ID, 0)[0]!.deleted).toBe(true);
  });
});

describe("Child details", () => {
  it("creates them and returns them", () => {
    store.applyChanges(CHILD_ID, [], child());
    const saved = store.getChild();

    expect(saved?.name).toBe("Testkind");
    expect(saved?.dueDate).toBe("2026-06-20");
    expect(saved?.birthWeightG).toBe(3200);
  });

  it("only updates with a newer editedAt", () => {
    store.applyChanges(CHILD_ID, [], child({ name: "Neu", editedAt: "2026-08-04T11:00:00.000Z" }));
    store.applyChanges(CHILD_ID, [], child({ name: "Alt", editedAt: "2026-08-04T10:00:00.000Z" }));

    expect(store.getChild()?.name).toBe("Neu");
  });

  it("allows an empty due date", () => {
    store.applyChanges(CHILD_ID, [], child({ dueDate: null }));
    expect(store.getChild()?.dueDate).toBeNull();
  });
});

describe("Every entry type survives the round trip", () => {
  it("maps every type without loss", () => {
    store.applyChanges(
      CHILD_ID,
      [
        entry({ id: "feed", type: "feed", amountMl: 180 }),
        entry({ id: "diaper", type: "diaper", amountMl: null, diaper: "soiled" }),
        entry({
          id: "sleep",
          type: "sleep",
          amountMl: null,
          endedAt: "2026-08-04T12:30:00.000Z",
        }),
        entry({ id: "growth", type: "growth", amountMl: null, weightG: 5400, lengthMm: 610, headMm: 390 }),
        entry({ id: "milestone", type: "milestone", amountMl: null, label: "Erstes Lächeln" }),
        entry({ id: "note", type: "note", amountMl: null, note: "Unruhige Nacht" }),
        entry({
          id: "photo",
          type: "photo",
          amountMl: null,
          lifeWeek: 7,
          mediaId: "abc.jpg",
        }),
      ],
      null,
    );

    const byId = new Map(store.entriesSince(CHILD_ID, 0).map((e) => [e.id, e]));
    expect(byId.get("feed")!.amountMl).toBe(180);
    expect(byId.get("diaper")!.diaper).toBe("soiled");
    expect(byId.get("sleep")!.endedAt).toBe("2026-08-04T12:30:00.000Z");
    expect(byId.get("growth")!.weightG).toBe(5400);
    expect(byId.get("growth")!.headMm).toBe(390);
    expect(byId.get("milestone")!.label).toBe("Erstes Lächeln");
    expect(byId.get("note")!.note).toBe("Unruhige Nacht");
    expect(byId.get("photo")!.lifeWeek).toBe(7);
    expect(byId.get("photo")!.mediaId).toBe("abc.jpg");
  });
});

describe("A feed brought back up", () => {
  it("carries the flag without loss", () => {
    store.applyChanges(
      CHILD_ID,
      [entry({ id: "a", amountMl: 120, spatUp: true }), entry({ id: "b", amountMl: 120 })],
      null,
    );

    const byId = new Map(store.entriesSince(CHILD_ID, 0).map((e) => [e.id, e]));
    // The amount is kept — it was offered, after all. Only the charts leave it out;
    // that is the client's decision.
    expect(byId.get("a")!.spatUp).toBe(true);
    expect(byId.get("a")!.amountMl).toBe(120);
    expect(byId.get("b")!.spatUp).toBe(false);
  });
});

describe("Migrations", () => {
  it("run exactly once and are no problem on reopening", () => {
    const path = join(dir, "migrate.db");
    const first = openDatabase(path);
    const applied = first
      .prepare<[], { name: string }>("SELECT name FROM schema_migrations ORDER BY name")
      .all()
      .map((r) => r.name);
    first.close();

    expect(applied).toContain("001_init.sql");
    expect(applied).toContain("002_spat_up.sql");

    // Opening a second time must not try to add the column again —
    // ALTER TABLE ADD COLUMN is not idempotent and would throw.
    const second = openDatabase(path);
    const again = second
      .prepare<[], { name: string }>("SELECT name FROM schema_migrations")
      .all().length;
    second.close();
    expect(again).toBe(applied.length);
  });

  it("upgrades a database that does not know the column yet", () => {
    // The real case: the Pi already holds a database from before the spat-up flag.
    // Without a migration step the server would only have failed on the first write.
    const path = join(dir, "alt.db");
    const legacy = openDatabase(path);
    legacy.exec("DROP TABLE entries");
    legacy.exec(`CREATE TABLE entries (
      id TEXT PRIMARY KEY, child_id TEXT NOT NULL, type TEXT NOT NULL,
      started_at TEXT NOT NULL, ended_at TEXT, amount_ml INTEGER, diaper TEXT,
      weight_g INTEGER, length_mm INTEGER, head_mm INTEGER, label TEXT,
      life_week INTEGER, media_id TEXT, note TEXT, created_by TEXT NOT NULL,
      edited_at TEXT NOT NULL, rev INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
    )`);
    legacy.exec("DELETE FROM schema_migrations WHERE name = '002_spat_up.sql'");
    legacy.close();

    const upgraded = openDatabase(path);
    const columns = upgraded
      .prepare<[], { name: string }>("SELECT name FROM pragma_table_info('entries')")
      .all()
      .map((c) => c.name);
    upgraded.close();

    expect(columns).toContain("spat_up");
  });
});

describe("All known entry types", () => {
  it("are accepted by the database", () => {
    // A guard against drift: the CHECK constraint on `type` was once still at the
    // state of the first migration while the schema had long known new kinds. The
    // result was a 500 the device retried forever. This test fails as soon as a kind
    // is in the schema that the database does not know.
    const changes = ENTRY_TYPES.map((type) =>
      entry({
        id: `t-${type}`,
        type,
        amountMl: type === "feed" ? 120 : null,
        diaper: type === "diaper" ? "wet" : null,
        endedAt: type === "absence" ? "2026-08-05T10:00:00.000Z" : null,
        label: "Testeintrag",
        milestoneKey: type === "milestone" ? "smile" : null,
        supplyCategory: type === "supply" ? "formula" : null,
        lifeWeek: type === "photo" ? 3 : null,
        mediaId: type === "photo" ? "x.jpg" : null,
        note: "Notiz",
      }),
    );

    const result = store.applyChanges(CHILD_ID, changes, null);

    expect(result.failed).toEqual([]);
    expect(store.entriesSince(CHILD_ID, 0)).toHaveLength(ENTRY_TYPES.length);
  });

  it("does not let one unusable entry take the rest down", () => {
    // The constraint on `type` was deliberately dropped (migration 007) — it never
    // prevented a fault but forced a table rebuild for every new kind. Resilience is
    // checked here through `diaper`, where a small, stable enum stays sensible.
    const result = store.applyChanges(
      CHILD_ID,
      [
        entry({ id: "gut1" }),
        entry({ id: "kaputt", type: "diaper", amountMl: null, diaper: "explodiert" as never }),
        entry({ id: "gut2" }),
      ],
      null,
    );

    expect(result.failed.map((f) => f.id)).toEqual(["kaputt"]);
    expect(store.entriesSince(CHILD_ID, 0).map((e) => e.id).sort()).toEqual(["gut1", "gut2"]);
  });
});
