-- One table for every entry type, discriminated by `type`.
-- The reason is syncing: one endpoint, one cursor, and a new entry type is later a
-- frontend-only change.
CREATE TABLE IF NOT EXISTS entries (
  id          TEXT PRIMARY KEY,
  child_id    TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('feed','diaper','sleep','growth','milestone','note','photo')),

  started_at  TEXT NOT NULL,          -- ISO-8601 UTC, when the event happened
  ended_at    TEXT,                   -- sleep only; NULL while the sleep is running

  amount_ml   INTEGER,                -- feed
  diaper      TEXT CHECK (diaper IS NULL OR diaper IN ('empty','wet','soiled','both')),

  weight_g    INTEGER,                -- growth
  length_mm   INTEGER,
  head_mm     INTEGER,

  label       TEXT,                   -- milestone / photo
  life_week   INTEGER,                -- photo: which week of life the photo counts for
  media_id    TEXT,
  note        TEXT,

  created_by  TEXT NOT NULL,
  edited_at   TEXT NOT NULL,          -- Client-Zeit; entscheidet Konflikte (LWW)

  -- Server-vergebene monotone Sequenz. Der Sync-Cursor.
  -- Deliberately NOT a timestamp: two writes in the same millisecond would, with
  -- einem Zeitstempel-Cursor einen Eintrag verschlucken.
  rev         INTEGER NOT NULL,

  -- A soft delete is mandatory, not a convenience: without it the second phone never
  -- learns of a deletion and pushes the entry back on the next sync.
  deleted     INTEGER NOT NULL DEFAULT 0
);

-- The sync path: "give me everything with rev > ?".
CREATE INDEX IF NOT EXISTS idx_entries_sync ON entries (child_id, rev);
-- The charting path: a time window per type.
CREATE INDEX IF NOT EXISTS idx_entries_time ON entries (child_id, type, started_at);
-- The weekly photo gallery and the "still missing" check.
CREATE INDEX IF NOT EXISTS idx_entries_week ON entries (child_id, life_week)
  WHERE type = 'photo' AND deleted = 0;

-- The child's details. Deliberately a table and not .env, so the app is not tailored
-- to one child and everything stays changeable through the interface.
CREATE TABLE IF NOT EXISTS child (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  sex             TEXT NOT NULL CHECK (sex IN ('female','male')),
  birth_date      TEXT NOT NULL,      -- YYYY-MM-DD, lokal gemeint
  due_date        TEXT,               -- due date; the basis of the leap weeks
  birth_weight_g  INTEGER,
  birth_length_mm INTEGER,
  birth_head_mm   INTEGER,
  timezone        TEXT NOT NULL DEFAULT 'Europe/Berlin',
  edited_at       TEXT NOT NULL,
  rev             INTEGER NOT NULL DEFAULT 0
);

-- Uploaded images. The file itself lives in the file system under data/media, so the
-- SQLite file stays small and `sqlite3 .backup` stays fast.
CREATE TABLE IF NOT EXISTS media (
  id          TEXT PRIMARY KEY,
  child_id    TEXT NOT NULL,
  mime        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  width       INTEGER,
  height      INTEGER,
  created_at  TEXT NOT NULL
);

-- A single counter handing out rev values. One row, incremented in place.
CREATE TABLE IF NOT EXISTS counters (
  name  TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT OR IGNORE INTO counters (name, value) VALUES ('rev', 0);
