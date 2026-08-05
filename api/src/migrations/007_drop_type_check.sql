-- The CHECK constraint on `type` goes away.
--
-- It never prevented a fault but has already caused one: in migration 006 the whole
-- table had to be rebuilt because three new entry types were added while the
-- enumeration was still at the state of 001. Before that it surfaced as a 500 the
-- device retried forever.
--
-- Why it contributes nothing: every entry passes `entrySchema` (Zod) before being
-- written, and `applyChanges` has exactly one caller — the sync route, which only ever
-- passes validated entries on. So the constraint duplicates a check already performed
-- at the only entrance, and demands a table rebuild on a database holding real data for
-- every new type.
--
-- The guard test in db.test.ts, which writes every type from ENTRY_TYPES once, stays.
-- The constraint on `diaper` stays too: three values that are not going to change.

CREATE TABLE entries_new (
  id              TEXT PRIMARY KEY,
  child_id        TEXT NOT NULL,
  type            TEXT NOT NULL,
  started_at      TEXT NOT NULL,
  ended_at        TEXT,
  amount_ml       INTEGER,
  spat_up         INTEGER NOT NULL DEFAULT 0,
  diaper          TEXT CHECK (diaper IS NULL OR diaper IN ('empty','wet','soiled','both')),
  weight_g        INTEGER,
  length_mm       INTEGER,
  head_mm         INTEGER,
  label           TEXT,
  milestone_key   TEXT,
  temperature_dc  INTEGER,
  latitude        REAL,
  longitude       REAL,
  place_name      TEXT,
  supply_category TEXT,
  supply_size     TEXT,
  supply_shop     TEXT,
  life_week       INTEGER,
  media_id        TEXT,
  note            TEXT,
  created_by      TEXT NOT NULL,
  edited_at       TEXT NOT NULL,
  rev             INTEGER NOT NULL,
  deleted         INTEGER NOT NULL DEFAULT 0
);

INSERT INTO entries_new SELECT
  id, child_id, type, started_at, ended_at, amount_ml, spat_up, diaper,
  weight_g, length_mm, head_mm, label, milestone_key, temperature_dc,
  latitude, longitude, place_name, supply_category, supply_size, supply_shop,
  life_week, media_id, note, created_by, edited_at, rev, deleted
FROM entries;

DROP TABLE entries;
ALTER TABLE entries_new RENAME TO entries;

CREATE INDEX idx_entries_sync ON entries (child_id, rev);
CREATE INDEX idx_entries_time ON entries (child_id, type, started_at);
CREATE INDEX idx_entries_week ON entries (child_id, life_week)
  WHERE type = 'photo' AND deleted = 0;
CREATE INDEX idx_entries_supply ON entries (child_id, supply_category, started_at)
  WHERE type = 'supply' AND deleted = 0;
-- Open periods: "Currently running" on the home screen queries exactly this.
CREATE INDEX idx_entries_open ON entries (child_id, type)
  WHERE ended_at IS NULL AND deleted = 0;
