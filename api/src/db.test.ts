import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Child, Entry } from "@babymonitor/shared";
import { createStore, openDatabase, type Store } from "./db.ts";

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

describe("Sync-Grundlagen", () => {
  it("nimmt Einträge an und gibt sie ab dem Cursor zurück", () => {
    store.applyChanges(CHILD_ID, [entry({ id: "a" }), entry({ id: "b" })], null);

    const all = store.entriesSince(CHILD_ID, 0);
    expect(all.map((e) => e.id)).toEqual(["a", "b"]);
    expect(all[0]!.amountMl).toBe(120);
  });

  it("liefert ab einem Cursor nur Neues", () => {
    store.applyChanges(CHILD_ID, [entry({ id: "a" })], null);
    const afterFirst = store.currentRev();
    store.applyChanges(CHILD_ID, [entry({ id: "b" })], null);

    expect(store.entriesSince(CHILD_ID, afterFirst).map((e) => e.id)).toEqual(["b"]);
  });

  it("vergibt streng monoton steigende rev — auch bei einem Batch", () => {
    store.applyChanges(
      CHILD_ID,
      [entry({ id: "a" }), entry({ id: "b" }), entry({ id: "c" })],
      null,
    );
    const revs = store.entriesSince(CHILD_ID, 0).map((e) => e.rev);
    expect(revs).toEqual([...revs].sort((x, y) => x - y));
    expect(new Set(revs).size).toBe(3);
  });

  it("trennt Kinder voneinander", () => {
    store.applyChanges(CHILD_ID, [entry({ id: "a" })], null);
    store.applyChanges("child-2", [entry({ id: "b", childId: "child-2" })], null);

    expect(store.entriesSince(CHILD_ID, 0).map((e) => e.id)).toEqual(["a"]);
    expect(store.entriesSince("child-2", 0).map((e) => e.id)).toEqual(["b"]);
  });
});

describe("Konfliktauflösung (Last-Write-Wins)", () => {
  it("lässt die neuere Änderung gewinnen", () => {
    store.applyChanges(CHILD_ID, [entry({ id: "a", amountMl: 100 })], null);
    const result = store.applyChanges(
      CHILD_ID,
      [entry({ id: "a", amountMl: 150, editedAt: "2026-08-04T11:00:00.000Z" })],
      null,
    );

    expect(result.rejected).toEqual([]);
    expect(store.entriesSince(CHILD_ID, 0)[0]!.amountMl).toBe(150);
  });

  it("verwirft die ältere Änderung und meldet sie zurück", () => {
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

  it("gibt bei Gleichstand dem Server recht", () => {
    // Sonst schreiben sich zwei Geräte mit identischem editedAt endlos gegenseitig um.
    store.applyChanges(CHILD_ID, [entry({ id: "a", amountMl: 150 })], null);
    const result = store.applyChanges(CHILD_ID, [entry({ id: "a", amountMl: 100 })], null);

    expect(result.rejected).toEqual(["a"]);
    expect(store.entriesSince(CHILD_ID, 0)[0]!.amountMl).toBe(150);
  });

  it("vergleicht Zeitstempel mit Offset korrekt", () => {
    // 12:00+02:00 ist 10:00Z — also ÄLTER als 11:00Z, obwohl der String größer aussieht.
    // Ohne Normalisierung auf UTC würde der Vergleich hier falsch herum ausgehen.
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
  it("überträgt eine Löschung als eigene Revision", () => {
    store.applyChanges(CHILD_ID, [entry({ id: "a" })], null);
    const cursorBeforeDelete = store.currentRev();

    store.applyChanges(
      CHILD_ID,
      [entry({ id: "a", deleted: true, editedAt: "2026-08-04T11:00:00.000Z" })],
      null,
    );

    // Das zweite Gerät muss die Löschung beim Pull sehen — deshalb bleibt die Zeile
    // bestehen und bekommt eine neue rev, statt zu verschwinden.
    const delta = store.entriesSince(CHILD_ID, cursorBeforeDelete);
    expect(delta).toHaveLength(1);
    expect(delta[0]!.id).toBe("a");
    expect(delta[0]!.deleted).toBe(true);
  });

  it("lässt eine Löschung nicht durch einen älteren Stand wiederbeleben", () => {
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

describe("Kind-Stammdaten", () => {
  it("legt sie an und gibt sie zurück", () => {
    store.applyChanges(CHILD_ID, [], child());
    const saved = store.getChild();

    expect(saved?.name).toBe("Testkind");
    expect(saved?.dueDate).toBe("2026-06-20");
    expect(saved?.birthWeightG).toBe(3200);
  });

  it("aktualisiert nur mit neuerem editedAt", () => {
    store.applyChanges(CHILD_ID, [], child({ name: "Neu", editedAt: "2026-08-04T11:00:00.000Z" }));
    store.applyChanges(CHILD_ID, [], child({ name: "Alt", editedAt: "2026-08-04T10:00:00.000Z" }));

    expect(store.getChild()?.name).toBe("Neu");
  });

  it("erlaubt einen leeren ET", () => {
    store.applyChanges(CHILD_ID, [], child({ dueDate: null }));
    expect(store.getChild()?.dueDate).toBeNull();
  });
});

describe("Alle Eintragstypen überstehen den Roundtrip", () => {
  it("bildet jeden Typ verlustfrei ab", () => {
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
