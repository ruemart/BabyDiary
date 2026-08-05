-- What we buy: formula, nappy size and whatever else is needed regularly.
--
-- Deliberately a normal entry with a date rather than a setting: the NEWEST entry per
-- category is the current one, all older ones are automatically the switch history. That
-- answers "since when size 3?" with no extra effort — and for formula that history is
-- exactly what matters, because a brand change should not happen casually.
ALTER TABLE entries ADD COLUMN supply_category TEXT;
ALTER TABLE entries ADD COLUMN supply_size TEXT;
ALTER TABLE entries ADD COLUMN supply_shop TEXT;

CREATE INDEX IF NOT EXISTS idx_entries_supply ON entries (child_id, supply_category, started_at)
  WHERE type = 'supply' AND deleted = 0;
