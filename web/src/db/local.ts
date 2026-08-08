import Dexie, { type EntityTable } from "dexie";
import type { Child, Entry, StoredEntry } from "@babydiary/shared";

/**
 * The local database. Every input lands HERE first and is rendered immediately; syncing
 * happens afterwards in the background.
 *
 * That is why the "bottle" button feels instant even when the Pi is rebooting or the
 * Wi-Fi drops out in the nursery — and why the app is usable at all.
 */

/** An entry in the local store. `rev` is null while the server does not know it. */
export type LocalEntry = Entry & { rev: number | null };

/** Outbox: what still has to go to the server. */
export type OutboxItem = {
  id: string;
  /** The state the entry was put in the outbox with — the basis of the race check. */
  editedAt: string;
};

export type MetaRow = { key: string; value: string };

/*
 * Still the old name, on purpose.
 *
 * The project has been renamed twice since, but this string names an IndexedDB database
 * that already exists on every phone. Changing it opens a fresh, empty one — the entries
 * would come back on the next sync, but anything sitting in the outbox because the
 * phone was offline would be stranded in a database nothing opens any more. A tidier
 * name is not worth losing a night feed nobody noticed had not gone through.
 */
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

/* ── Entries ────────────────────────────────────────────────────────────────── */

/**
 * Writes an entry locally and puts it in the outbox.
 * Both in one transaction — otherwise a crash between the steps could create an entry
 * that exists locally but never travels to the other phone.
 */
export async function saveEntry(entry: Entry): Promise<void> {
  await db.transaction("rw", db.entries, db.outbox, async () => {
    const existing = await db.entries.get(entry.id);
    await db.entries.put({ ...entry, rev: existing?.rev ?? null });
    await db.outbox.put({ id: entry.id, editedAt: entry.editedAt });
  });
}

/** Deleting means marking, not removing — otherwise the second device never learns of it. */
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
 * Takes server entries into the local store.
 *
 * A server entry is NOT taken when a newer, unsent change is still sitting in the local
 * outbox. Without that check, a correction made while a sync round was in flight would
 * be overwritten by the response of that same round — the classic case where an input
 * "just disappears".
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
 * Clears the outbox after a successful send — but only the entries that have not changed
 * again since they were sent. Anything edited in the meantime stays in the outbox and
 * goes along on the next round.
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
 * Takes entries out of the outbox without deleting them locally.
 *
 * For entries the server permanently rejects: retrying never helps, but the input
 * belongs to the person — it stays visible and correctable in the store. As soon as it
 * is changed, `saveEntry` puts it back in the outbox.
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

/** Delete everything — for the sign-out path in Settings. */
export async function wipeLocal(): Promise<void> {
  await db.delete();
}
