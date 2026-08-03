-- Eine Tabelle für alle Eintragstypen, diskriminiert über `type`.
-- Der Grund ist der Sync: ein Endpoint, ein Cursor, und ein neuer Eintragstyp
-- ist später eine reine Frontend-Änderung.
CREATE TABLE IF NOT EXISTS entries (
  id          TEXT PRIMARY KEY,
  child_id    TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('feed','diaper','sleep','growth','milestone','note','photo')),

  started_at  TEXT NOT NULL,          -- ISO-8601 UTC, Zeitpunkt des Ereignisses
  ended_at    TEXT,                   -- nur sleep; NULL solange der Schlaf läuft

  amount_ml   INTEGER,                -- feed
  diaper      TEXT CHECK (diaper IS NULL OR diaper IN ('empty','wet','soiled','both')),

  weight_g    INTEGER,                -- growth
  length_mm   INTEGER,
  head_mm     INTEGER,

  label       TEXT,                   -- milestone / photo
  life_week   INTEGER,                -- photo: für welche Lebenswoche das Foto zählt
  media_id    TEXT,
  note        TEXT,

  created_by  TEXT NOT NULL,
  edited_at   TEXT NOT NULL,          -- Client-Zeit; entscheidet Konflikte (LWW)

  -- Server-vergebene monotone Sequenz. Der Sync-Cursor.
  -- Bewusst KEIN Zeitstempel: zwei Writes in derselben Millisekunde würden bei
  -- einem Zeitstempel-Cursor einen Eintrag verschlucken.
  rev         INTEGER NOT NULL,

  -- Soft-Delete ist Pflicht, nicht Komfort: ohne ihn erfährt das zweite Handy nie
  -- von einer Löschung und schiebt den Eintrag beim nächsten Sync wieder hoch.
  deleted     INTEGER NOT NULL DEFAULT 0
);

-- Der Sync-Pfad: "gib mir alles mit rev > ?".
CREATE INDEX IF NOT EXISTS idx_entries_sync ON entries (child_id, rev);
-- Der Auswertungspfad: Zeitfenster je Typ.
CREATE INDEX IF NOT EXISTS idx_entries_time ON entries (child_id, type, started_at);
-- Wochenfoto-Galerie und die "fehlt noch"-Prüfung.
CREATE INDEX IF NOT EXISTS idx_entries_week ON entries (child_id, life_week)
  WHERE type = 'photo' AND deleted = 0;

-- Stammdaten des Kindes. Bewusst eine Tabelle und nicht .env, damit die App
-- nicht auf ein Kind zugeschnitten ist und alles über die Oberfläche änderbar bleibt.
CREATE TABLE IF NOT EXISTS child (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  sex             TEXT NOT NULL CHECK (sex IN ('female','male')),
  birth_date      TEXT NOT NULL,      -- YYYY-MM-DD, lokal gemeint
  due_date        TEXT,               -- errechneter Termin; Basis der Sprungwochen
  birth_weight_g  INTEGER,
  birth_length_mm INTEGER,
  birth_head_mm   INTEGER,
  timezone        TEXT NOT NULL DEFAULT 'Europe/Berlin',
  edited_at       TEXT NOT NULL,
  rev             INTEGER NOT NULL DEFAULT 0
);

-- Hochgeladene Bilder. Die Datei selbst liegt im Dateisystem unter data/media,
-- damit die SQLite-Datei klein und `sqlite3 .backup` schnell bleibt.
CREATE TABLE IF NOT EXISTS media (
  id          TEXT PRIMARY KEY,
  child_id    TEXT NOT NULL,
  mime        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  width       INTEGER,
  height      INTEGER,
  created_at  TEXT NOT NULL
);

-- Ein einziger Zähler für die rev-Vergabe. Eine Zeile, in-place erhöht.
CREATE TABLE IF NOT EXISTS counters (
  name  TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT OR IGNORE INTO counters (name, value) VALUES ('rev', 0);
