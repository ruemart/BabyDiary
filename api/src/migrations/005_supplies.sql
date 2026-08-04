-- Was wir kaufen: Milchnahrung, Windelgröße und was sonst noch regelmäßig gebraucht wird.
--
-- Bewusst als normaler Eintrag mit Datum, nicht als Einstellung: Der jeweils
-- NEUESTE Eintrag je Kategorie ist der aktuelle Stand, alle älteren sind
-- automatisch die Wechsel-Historie. Damit ist "seit wann Größe 3?" ohne
-- zusätzliches Zutun beantwortet — und bei Milchnahrung ist genau dieser Verlauf
-- interessant, weil ein Markenwechsel nicht beiläufig passieren soll.
ALTER TABLE entries ADD COLUMN supply_category TEXT;
ALTER TABLE entries ADD COLUMN supply_size TEXT;
ALTER TABLE entries ADD COLUMN supply_shop TEXT;

CREATE INDEX IF NOT EXISTS idx_entries_supply ON entries (child_id, supply_category, started_at)
  WHERE type = 'supply' AND deleted = 0;
