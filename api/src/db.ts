import Database from "better-sqlite3";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Child, Entry, StoredEntry } from "@babymonitor/shared";

const here = dirname(fileURLToPath(import.meta.url));

export type Db = Database.Database;

export function openDatabase(path: string): Db {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);

  // WAL: readers do not block the writer. With two phones syncing while the gallery
  // loads, that is the difference between smooth and "database is locked".
  db.pragma("journal_mode = WAL");
  // NORMAL rather than FULL: with WAL this is crash-safe (only a power cut can lose
  // the last transaction) and saves an enormous number of fsyncs on SD/NVMe storage.
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  // In case something does write in parallel: wait 5 s instead of failing at once.
  db.pragma("busy_timeout = 5000");

  migrate(db);
  return db;
}

/**
 * Migrations.
 *
 * Every .sql file under migrations/ in name order, each exactly once, each in its own
 * transaction. Applied files are recorded in `schema_migrations`.
 *
 * Became necessary the moment the first column was added to a table that already held
 * data on the Pi: `CREATE TABLE IF NOT EXISTS` alone would have skipped the new column
 * silently, and the server would only have failed on the first write.
 */
function migrate(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name       TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Set(
    db.prepare<[], { name: string }>("SELECT name FROM schema_migrations").all().map((r) => r.name),
  );

  const dir = join(here, "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const record = db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)");

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      record.run(file, new Date().toISOString());
    })();
  }
}

/* ── Zeilen-Abbildung ───────────────────────────────────────────────────────── */

type EntryRow = {
  id: string;
  child_id: string;
  type: string;
  started_at: string;
  ended_at: string | null;
  amount_ml: number | null;
  spat_up: number;
  vitamin_d: number;
  colic_drops: number;
  diaper: string | null;
  weight_g: number | null;
  length_mm: number | null;
  head_mm: number | null;
  label: string | null;
  milestone_key: string | null;
  temperature_dc: number | null;
  latitude: number | null;
  longitude: number | null;
  place_name: string | null;
  supply_category: string | null;
  supply_size: string | null;
  supply_shop: string | null;
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
    spatUp: row.spat_up === 1,
    vitaminD: row.vitamin_d === 1,
    colicDrops: row.colic_drops === 1,
    diaper: row.diaper as Entry["diaper"],
    weightG: row.weight_g,
    lengthMm: row.length_mm,
    headMm: row.head_mm,
    label: row.label,
    milestoneKey: row.milestone_key,
    temperatureDc: row.temperature_dc,
    latitude: row.latitude,
    longitude: row.longitude,
    placeName: row.place_name,
    supplyCategory: row.supply_category as Entry["supplyCategory"],
    supplySize: row.supply_size,
    supplyShop: row.supply_shop,
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
 * Normalises every timestamp to UTC with `Z` and milliseconds.
 *
 * Not cosmetic: conflict resolution compares `edited_at` as a STRING. If a client sent
 * a "+02:00" offset, the lexicographic comparison would be wrong and the older device
 * could overwrite the newer one.
 */
function normalizeInstant(iso: string): string {
  return new Date(iso).toISOString();
}

/* ── Sync ───────────────────────────────────────────────────────────────────── */

export type ApplyResult = {
  rev: number;
  /** Overruled by the server (LWW) — the other version was newer. */
  rejected: string[];
  /**
   * Failed at the database. Unlike `rejected`, retrying does not help here: it would
   * only fail again and block the queue.
   */
  failed: { id: string; reason: string }[];
};

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
      id, child_id, type, started_at, ended_at, amount_ml, spat_up, vitamin_d, colic_drops, diaper,
      weight_g, length_mm, head_mm, label, milestone_key, temperature_dc, latitude, longitude, place_name, supply_category, supply_size, supply_shop, life_week, media_id, note,
      created_by, edited_at, rev, deleted
    ) VALUES (
      @id, @child_id, @type, @started_at, @ended_at, @amount_ml, @spat_up, @vitamin_d, @colic_drops, @diaper,
      @weight_g, @length_mm, @head_mm, @label, @milestone_key, @temperature_dc, @latitude, @longitude, @place_name, @supply_category, @supply_size, @supply_shop, @life_week, @media_id, @note,
      @created_by, @edited_at, @rev, @deleted
    )
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      started_at = excluded.started_at,
      ended_at = excluded.ended_at,
      amount_ml = excluded.amount_ml,
      spat_up = excluded.spat_up,
      vitamin_d = excluded.vitamin_d,
      colic_drops = excluded.colic_drops,
      diaper = excluded.diaper,
      weight_g = excluded.weight_g,
      length_mm = excluded.length_mm,
      head_mm = excluded.head_mm,
      label = excluded.label,
      milestone_key = excluded.milestone_key,
      temperature_dc = excluded.temperature_dc,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      place_name = excluded.place_name,
      supply_category = excluded.supply_category,
      supply_size = excluded.supply_size,
      supply_shop = excluded.supply_shop,
      life_week = excluded.life_week,
      media_id = excluded.media_id,
      note = excluded.note,
      created_by = excluded.created_by,
      edited_at = excluded.edited_at,
      rev = excluded.rev,
      deleted = excluded.deleted
  `);

  // ORDER BY, not just LIMIT 1: without sorting SQLite picks an arbitrary row.
// Should two records ever exist, the most recently edited one wins.
const selectChild = db.prepare<[], Record<string, unknown>>(
  "SELECT * FROM child ORDER BY edited_at DESC LIMIT 1",
);
  const upsertChild = db.prepare(`
    INSERT INTO child (
      id, name, sex, birth_date, due_date, birth_weight_g, birth_length_mm,
      birth_head_mm, timezone, region, latitude, longitude, place_name, edited_at, rev
    ) VALUES (
      @id, @name, @sex, @birth_date, @due_date, @birth_weight_g, @birth_length_mm,
      @birth_head_mm, @timezone, @region, @latitude, @longitude, @place_name, @edited_at, @rev
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
      region = excluded.region,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      place_name = excluded.place_name,
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
      region: (row["region"] as string | null) ?? "none",
      latitude: (row["latitude"] as number | null) ?? null,
      longitude: (row["longitude"] as number | null) ?? null,
      placeName: (row["place_name"] as string | null) ?? null,
      editedAt: row["edited_at"] as string,
    };
  }

  /**
   * Push and pull in one transaction.
   *
   * Conflicts: last-write-wins on `editedAt`. On a tie the server wins — otherwise a
   * client with a wrongly set clock would write back and forth forever.
   */
  const applyChanges = db.transaction(
    (childId: string, changes: Entry[], child: Child | null): ApplyResult => {
      const rejected: string[] = [];
      const failed: { id: string; reason: string }[] = [];

      if (child) {
        const existing = getChild();
        const incomingEditedAt = normalizeInstant(child.editedAt);
        if (!existing || incomingEditedAt > normalizeInstant(existing.editedAt)) {
          upsertChild.run({
            /**
             * One household, one child.
             *
             * If a record already exists, ITS id is kept even when the device sends a
             * different one. Otherwise a device that does not know the id yet creates a
             * second row — and `getChild` then picks now one, now the other.
             */
            id: existing?.id ?? child.id,
            name: child.name,
            sex: child.sex,
            birth_date: child.birthDate,
            due_date: child.dueDate,
            birth_weight_g: child.birthWeightG,
            birth_length_mm: child.birthLengthMm,
            birth_head_mm: child.birthHeadMm,
            timezone: child.timezone,
            region: child.region,
            latitude: child.latitude,
            longitude: child.longitude,
            place_name: child.placeName,
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
        try {
          upsert.run({
          id: entry.id,
          child_id: childId,
          type: entry.type,
          started_at: normalizeInstant(entry.startedAt),
          ended_at: entry.endedAt ? normalizeInstant(entry.endedAt) : null,
          amount_ml: entry.amountMl,
          spat_up: entry.spatUp ? 1 : 0,
          vitamin_d: entry.vitaminD ? 1 : 0,
          colic_drops: entry.colicDrops ? 1 : 0,
          diaper: entry.diaper,
          weight_g: entry.weightG,
          length_mm: entry.lengthMm,
          head_mm: entry.headMm,
          label: entry.label,
          milestone_key: entry.milestoneKey,
          temperature_dc: entry.temperatureDc,
          latitude: entry.latitude,
          longitude: entry.longitude,
          place_name: entry.placeName,
          supply_category: entry.supplyCategory,
          supply_size: entry.supplySize,
          supply_shop: entry.supplyShop,
          life_week: entry.lifeWeek,
          media_id: entry.mediaId,
          note: entry.note,
          created_by: entry.createdBy,
          edited_at: editedAt,
          rev: bumpRev.get()!.value,
          deleted: entry.deleted ? 1 : 0,
          });
        } catch (error) {
          /**
           * A single entry the database refuses must never bring down the whole
           * transaction, and with it the device's queue.
           *
           * That happened once: the CHECK constraint on `type` did not know about new
           * entry types, the error became a 500, and the device retried forever. A
           * fault in ONE record is a problem with that record, not with all the others.
           */
          failed.push({
            id: entry.id,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return { rev: currentRev.get()!.value, rejected, failed };
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
    /** Away periods with a location — they decide which weather applies to which days. */
    locatedAbsences(): { from: string; to: string; latitude: number; longitude: number }[] {
      return db
        .prepare<[], EntryRow>(
          `SELECT * FROM entries
           WHERE type = 'absence' AND deleted = 0
             AND latitude IS NOT NULL AND longitude IS NOT NULL AND ended_at IS NOT NULL
           ORDER BY started_at`,
        )
        .all()
        .map((r) => ({
          from: r.started_at.slice(0, 10),
          to: r.ended_at!.slice(0, 10),
          latitude: r.latitude!,
          longitude: r.longitude!,
        }));
    },
  };
}

export type Store = ReturnType<typeof createStore>;
