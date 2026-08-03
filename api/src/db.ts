import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Child, Entry, StoredEntry } from "@babymonitor/shared";

const here = dirname(fileURLToPath(import.meta.url));

export type Db = Database.Database;

export function openDatabase(path: string): Db {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);

  // WAL: Leser blockieren den Schreiber nicht. Bei zwei Handys, die gleichzeitig
  // syncen während die Galerie lädt, ist das der Unterschied zwischen flüssig und "database is locked".
  db.pragma("journal_mode = WAL");
  // NORMAL statt FULL: bei WAL ist das crashsicher (nur bei Stromausfall kann die
  // letzte Transaktion fehlen) und spart auf SD-/NVMe-Speicher enorm viele fsyncs.
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  // Falls doch mal parallel geschrieben wird: 5 s warten statt sofort zu scheitern.
  db.pragma("busy_timeout = 5000");

  db.exec(readFileSync(join(here, "migrations/001_init.sql"), "utf8"));
  return db;
}

/* ── Zeilen-Abbildung ───────────────────────────────────────────────────────── */

type EntryRow = {
  id: string;
  child_id: string;
  type: string;
  started_at: string;
  ended_at: string | null;
  amount_ml: number | null;
  diaper: string | null;
  weight_g: number | null;
  length_mm: number | null;
  head_mm: number | null;
  label: string | null;
  life_week: number | null;
  media_id: string | null;
  note: string | null;
  created_by: string;
  edited_at: string;
  rev: number;
  deleted: number;
};

function toEntry(row: EntryRow): StoredEntry {
  return {
    id: row.id,
    childId: row.child_id,
    type: row.type as Entry["type"],
    startedAt: row.started_at,
    endedAt: row.ended_at,
    amountMl: row.amount_ml,
    diaper: row.diaper as Entry["diaper"],
    weightG: row.weight_g,
    lengthMm: row.length_mm,
    headMm: row.head_mm,
    label: row.label,
    lifeWeek: row.life_week,
    mediaId: row.media_id,
    note: row.note,
    createdBy: row.created_by,
    editedAt: row.edited_at,
    deleted: row.deleted === 1,
    rev: row.rev,
  };
}

/**
 * Normalisiert jeden Zeitstempel auf UTC mit `Z` und Millisekunden.
 *
 * Nicht kosmetisch: die Konfliktauflösung vergleicht `edited_at` als STRING. Käme ein
 * Client mit "+02:00"-Offset an, wäre der lexikografische Vergleich falsch und das
 * ältere Gerät könnte das neuere überschreiben.
 */
function normalizeInstant(iso: string): string {
  return new Date(iso).toISOString();
}

/* ── Sync ───────────────────────────────────────────────────────────────────── */

export type ApplyResult = { rev: number; rejected: string[] };

export function createStore(db: Db) {
  const bumpRev = db.prepare<[], { value: number }>(
    "UPDATE counters SET value = value + 1 WHERE name = 'rev' RETURNING value",
  );
  const currentRev = db.prepare<[], { value: number }>(
    "SELECT value FROM counters WHERE name = 'rev'",
  );
  const selectEditedAt = db.prepare<[string], { edited_at: string }>(
    "SELECT edited_at FROM entries WHERE id = ?",
  );
  const selectSince = db.prepare<[string, number], EntryRow>(
    "SELECT * FROM entries WHERE child_id = ? AND rev > ? ORDER BY rev",
  );

  const upsert = db.prepare(`
    INSERT INTO entries (
      id, child_id, type, started_at, ended_at, amount_ml, diaper,
      weight_g, length_mm, head_mm, label, life_week, media_id, note,
      created_by, edited_at, rev, deleted
    ) VALUES (
      @id, @child_id, @type, @started_at, @ended_at, @amount_ml, @diaper,
      @weight_g, @length_mm, @head_mm, @label, @life_week, @media_id, @note,
      @created_by, @edited_at, @rev, @deleted
    )
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      started_at = excluded.started_at,
      ended_at = excluded.ended_at,
      amount_ml = excluded.amount_ml,
      diaper = excluded.diaper,
      weight_g = excluded.weight_g,
      length_mm = excluded.length_mm,
      head_mm = excluded.head_mm,
      label = excluded.label,
      life_week = excluded.life_week,
      media_id = excluded.media_id,
      note = excluded.note,
      created_by = excluded.created_by,
      edited_at = excluded.edited_at,
      rev = excluded.rev,
      deleted = excluded.deleted
  `);

  const selectChild = db.prepare<[], Record<string, unknown>>("SELECT * FROM child LIMIT 1");
  const upsertChild = db.prepare(`
    INSERT INTO child (
      id, name, sex, birth_date, due_date, birth_weight_g, birth_length_mm,
      birth_head_mm, timezone, edited_at, rev
    ) VALUES (
      @id, @name, @sex, @birth_date, @due_date, @birth_weight_g, @birth_length_mm,
      @birth_head_mm, @timezone, @edited_at, @rev
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      sex = excluded.sex,
      birth_date = excluded.birth_date,
      due_date = excluded.due_date,
      birth_weight_g = excluded.birth_weight_g,
      birth_length_mm = excluded.birth_length_mm,
      birth_head_mm = excluded.birth_head_mm,
      timezone = excluded.timezone,
      edited_at = excluded.edited_at,
      rev = excluded.rev
  `);

  function getChild(): Child | null {
    const row = selectChild.get();
    if (!row) return null;
    return {
      id: row["id"] as string,
      name: row["name"] as string,
      sex: row["sex"] as Child["sex"],
      birthDate: row["birth_date"] as string,
      dueDate: (row["due_date"] as string | null) ?? null,
      birthWeightG: (row["birth_weight_g"] as number | null) ?? null,
      birthLengthMm: (row["birth_length_mm"] as number | null) ?? null,
      birthHeadMm: (row["birth_head_mm"] as number | null) ?? null,
      timezone: row["timezone"] as string,
      editedAt: row["edited_at"] as string,
    };
  }

  /**
   * Push und Pull in einer Transaktion.
   *
   * Konflikte: Last-Write-Wins über `editedAt`. Bei Gleichstand gewinnt der Server —
   * sonst würde ein Client mit falsch gestellter Uhr endlos hin- und herschreiben.
   */
  const applyChanges = db.transaction(
    (childId: string, changes: Entry[], child: Child | null): ApplyResult => {
      const rejected: string[] = [];

      if (child) {
        const existing = getChild();
        const incomingEditedAt = normalizeInstant(child.editedAt);
        if (!existing || incomingEditedAt > normalizeInstant(existing.editedAt)) {
          upsertChild.run({
            id: child.id,
            name: child.name,
            sex: child.sex,
            birth_date: child.birthDate,
            due_date: child.dueDate,
            birth_weight_g: child.birthWeightG,
            birth_length_mm: child.birthLengthMm,
            birth_head_mm: child.birthHeadMm,
            timezone: child.timezone,
            edited_at: incomingEditedAt,
            rev: bumpRev.get()!.value,
          });
        }
      }

      for (const entry of changes) {
        const editedAt = normalizeInstant(entry.editedAt);
        const existing = selectEditedAt.get(entry.id);
        if (existing && editedAt <= existing.edited_at) {
          rejected.push(entry.id);
          continue;
        }
        upsert.run({
          id: entry.id,
          child_id: childId,
          type: entry.type,
          started_at: normalizeInstant(entry.startedAt),
          ended_at: entry.endedAt ? normalizeInstant(entry.endedAt) : null,
          amount_ml: entry.amountMl,
          diaper: entry.diaper,
          weight_g: entry.weightG,
          length_mm: entry.lengthMm,
          head_mm: entry.headMm,
          label: entry.label,
          life_week: entry.lifeWeek,
          media_id: entry.mediaId,
          note: entry.note,
          created_by: entry.createdBy,
          edited_at: editedAt,
          rev: bumpRev.get()!.value,
          deleted: entry.deleted ? 1 : 0,
        });
      }

      return { rev: currentRev.get()!.value, rejected };
    },
  );

  return {
    getChild,
    applyChanges,
    entriesSince(childId: string, since: number): StoredEntry[] {
      return selectSince.all(childId, since).map(toEntry);
    },
    currentRev(): number {
      return currentRev.get()!.value;
    },
  };
}

export type Store = ReturnType<typeof createStore>;
