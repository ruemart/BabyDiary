-- The CHECK constraint on `type` did not know the new entry types.
--
-- Migrations 003/004/005 added columns but the enumeration in the constraint was still
-- at the state of 001. The result: illness, absence and supply were rejected by the
-- database — as a 500, which is why the device would have retried forever. Exactly the
-- blockage 002 was meant to fix, one layer deeper.
--
-- SQLite cannot alter a CHECK constraint; the table has to be rebuilt.

CREATE TABLE entries_new (
  id              TEXT PRIMARY KEY,
  child_id        TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN (
                    'feed','diaper','sleep','growth','milestone','note','photo',
                    'illness','absence','supply'
                  )),
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

INSERT INTO entries_new (
  id, child_id, type, started_at, ended_at, amount_ml, spat_up, diaper,
  weight_g, length_mm, head_mm, label, milestone_key, temperature_dc,
  latitude, longitude, place_name, supply_category, supply_size, supply_shop,
  life_week, media_id, note, created_by, edited_at, rev, deleted
)
SELECT
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
