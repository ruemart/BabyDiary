import Dexie, { type EntityTable } from "dexie";
import type { Child, Entry, StoredEntry } from "@babymonitor/shared";

/**
 * Lokale Datenbank. Jede Eingabe landet ZUERST hier und wird sofort gerendert;
 * der Sync läuft danach im Hintergrund.
 *
 * Das ist der Grund, warum sich der "Flasche"-Knopf auch dann augenblicklich anfühlt,
 * wenn der Pi neu startet oder das WLAN im Kinderzimmer wegbricht — und der Grund,
 * warum die App überhaupt brauchbar ist.
 */

/** Eintrag im lokalen Bestand. `rev` ist null, solange der Server ihn nicht kennt. */
export type LocalEntry = Entry & { rev: number | null };

/** Ausgangskorb: was noch zum Server muss. */
export type OutboxItem = {
  id: string;
  /** Stand, mit dem der Eintrag in den Korb gelegt wurde — Grundlage der Wettlauf-Prüfung. */
  editedAt: string;
};

export type MetaRow = { key: string; value: string };

const db = new Dexie("babymonitor") as Dexie & {
  entries: EntityTable<LocalEntry, "id">;
  outbox: EntityTable<OutboxItem, "id">;
  meta: EntityTable<MetaRow, "key">;
  child: EntityTable<Child, "id">;
};

db.version(1).stores({
  entries: "id, type, startedAt, lifeWeek, deleted, [type+startedAt]",
  outbox: "id",
  meta: "key",
  child: "id",
});

export { db };

/* ── Metadaten ──────────────────────────────────────────────────────────────── */

export async function getMeta(key: string): Promise<string | null> {
  return (await db.meta.get(key))?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}

export const META_CURSOR = "syncCursor";
export const META_CHILD_ID = "childId";
export const META_DEVICE_NAME = "deviceName";

/* ── Einträge ───────────────────────────────────────────────────────────────── */

/**
 * Schreibt einen Eintrag lokal und legt ihn in den Ausgangskorb.
 * Beides in einer Transaktion — sonst könnte ein Absturz zwischen den Schritten einen
 * Eintrag erzeugen, der lokal existiert, aber nie zum anderen Handy wandert.
 */
export async function saveEntry(entry: Entry): Promise<void> {
  await db.transaction("rw", db.entries, db.outbox, async () => {
    const existing = await db.entries.get(entry.id);
    await db.entries.put({ ...entry, rev: existing?.rev ?? null });
    await db.outbox.put({ id: entry.id, editedAt: entry.editedAt });
  });
}

/** Löschen heißt markieren, nicht entfernen — sonst erfährt das zweite Gerät nichts davon. */
export async function softDeleteEntry(id: string): Promise<void> {
  const existing = await db.entries.get(id);
  if (!existing) return;
  await saveEntry({ ...existing, deleted: true, editedAt: new Date().toISOString() });
}

export async function listEntries(): Promise<LocalEntry[]> {
  return db.entries.filter((e) => !e.deleted).toArray();
}

/* ── Anwenden dessen, was vom Server kam ────────────────────────────────────── */

/**
 * Übernimmt Server-Einträge in den lokalen Bestand.
 *
 * Ein Server-Eintrag wird NICHT übernommen, wenn lokal noch eine neuere, ungesendete
 * Änderung im Ausgangskorb liegt. Ohne diese Prüfung würde eine Korrektur, die während
 * eines laufenden Sync-Durchgangs entsteht, von der Antwort desselben Durchgangs wieder
 * überschrieben — der klassische Fall, in dem eine Eingabe "einfach verschwindet".
 */
export async function applyServerEntries(entries: StoredEntry[]): Promise<void> {
  if (entries.length === 0) return;

  await db.transaction("rw", db.entries, db.outbox, async () => {
    const pending = new Map(
      (await db.outbox.bulkGet(entries.map((e) => e.id)))
        .filter((o): o is OutboxItem => !!o)
        .map((o) => [o.id, o.editedAt]),
    );

    const toWrite = entries.filter((incoming) => {
      const localEditedAt = pending.get(incoming.id);
      return !localEditedAt || localEditedAt <= incoming.editedAt;
    });

    await db.entries.bulkPut(toWrite.map((e) => ({ ...e, rev: e.rev })));
  });
}

/**
 * Räumt den Ausgangskorb nach erfolgreichem Senden auf — aber nur die Einträge, die
 * sich seit dem Absenden nicht wieder geändert haben. Wer in der Zwischenzeit editiert
 * hat, bleibt im Korb und geht beim nächsten Durchgang mit.
 */
export async function clearSentOutbox(sent: OutboxItem[]): Promise<void> {
  await db.transaction("rw", db.outbox, async () => {
    for (const item of sent) {
      const current = await db.outbox.get(item.id);
      if (current && current.editedAt === item.editedAt) {
        await db.outbox.delete(item.id);
      }
    }
  });
}

/**
 * Nimmt Einträge aus dem Ausgangskorb, ohne sie lokal zu löschen.
 *
 * Für Einträge, die der Server dauerhaft ablehnt: Ein erneuter Versuch hilft nie, aber
 * die Eingabe gehört dem Menschen — sie bleibt im Bestand sichtbar und korrigierbar.
 * Sobald sie geändert wird, landet sie über `saveEntry` wieder im Korb.
 */
export async function dropFromOutbox(ids: string[]): Promise<void> {
  await db.outbox.bulkDelete(ids);
}

export async function takeOutbox(limit = 400): Promise<{ items: OutboxItem[]; entries: Entry[] }> {
  const items = await db.outbox.limit(limit).toArray();
  if (items.length === 0) return { items: [], entries: [] };

  const entries = (await db.entries.bulkGet(items.map((i) => i.id))).filter(
    (e): e is LocalEntry => !!e,
  );
  return { items, entries: entries.map(({ rev: _rev, ...entry }) => entry) };
}

export async function outboxCount(): Promise<number> {
  return db.outbox.count();
}

/* ── Kind ───────────────────────────────────────────────────────────────────── */

export async function getLocalChild(): Promise<Child | null> {
  return (await db.child.toArray())[0] ?? null;
}

export async function saveLocalChild(child: Child): Promise<void> {
  await db.child.put(child);
  await setMeta(META_CHILD_ID, child.id);
}

/** Alles löschen — für den Abmelde-Weg in den Einstellungen. */
export async function wipeLocal(): Promise<void> {
  await db.delete();
}
