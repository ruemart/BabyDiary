-- Die CHECK-Bedingung auf `type` fällt weg.
--
-- Sie hat nie einen Fehler verhindert, aber schon einen verursacht: In Migration 006
-- musste die ganze Tabelle neu gebaut werden, weil drei neue Eintragsarten dazukamen
-- und die Aufzählung noch auf dem Stand von 001 stand. Davor lief das als 500er, den
-- das Gerät endlos wiederholte.
--
-- Der Grund, warum sie nichts beiträgt: Jeder Eintrag durchläuft vor dem Schreiben
-- `entrySchema` (Zod), und `applyChanges` hat genau einen Aufrufer — die Sync-Route,
-- die ausschließlich geprüfte Einträge weitergibt. Die Bedingung dupliziert also eine
-- Prüfung, die bereits an der einzigen Eingangstür stattfindet, und verlangt für jede
-- neue Art einen Tabellen-Neubau auf einer Datenbank mit echten Daten.
--
-- Der Wächter-Test in db.test.ts, der jede Art aus ENTRY_TYPES einmal schreibt,
-- bleibt bestehen. Die Bedingung auf `diaper` bleibt ebenfalls: drei Werte, die sich
-- absehbar nicht ändern.

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
-- Offene Zeiträume: das "Läuft gerade" auf dem Startbildschirm fragt genau das ab.
CREATE INDEX idx_entries_open ON entries (child_id, type)
  WHERE ended_at IS NULL AND deleted = 0;
