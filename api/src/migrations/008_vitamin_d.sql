-- Vitamin D zu einer Mahlzeit gegeben.
--
-- Die tägliche Rachitisprophylaxe ist genau die Art Aufgabe, die man einmal am Tag
-- erledigt und deshalb zuverlässig vergisst: Sie hat keinen eigenen Anlass, sondern
-- hängt an einer Mahlzeit. Als Kennzeichen AM Eintrag statt als eigener Eintragstyp,
-- weil sie im Alltag genau dort passiert — beim Fläschchen.
ALTER TABLE entries ADD COLUMN vitamin_d INTEGER NOT NULL DEFAULT 0;

-- Die Tagesabfrage "wurde heute schon?" läuft über Typ und Zeitpunkt.
CREATE INDEX IF NOT EXISTS idx_entries_vitamin ON entries (child_id, started_at)
  WHERE type = 'feed' AND vitamin_d = 1 AND deleted = 0;
