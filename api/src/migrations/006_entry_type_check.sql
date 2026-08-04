-- Die CHECK-Bedingung auf `type` kannte die neuen Eintragsarten nicht.
--
-- Migration 003/004/005 haben Spalten ergänzt, aber die Aufzählung in der
-- Bedingung stand noch auf dem Stand von 001. Ergebnis: illness, absence und
-- supply wurden von der Datenbank abgewiesen — als 500er, weshalb das Gerät es
-- endlos erneut versucht hätte. Genau die Blockade, die 002 beheben sollte, nur
-- eine Schicht tiefer.
--
-- SQLite kann eine CHECK-Bedingung nicht ändern; die Tabelle muss neu gebaut werden.

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
