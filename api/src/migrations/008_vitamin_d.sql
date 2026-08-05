-- Vitamin D given with a feed.
--
-- The daily rickets prophylaxis is exactly the kind of task you do once a day and
-- therefore reliably forget: it has no occasion of its own but hangs off a feed. A flag
-- ON the entry rather than an entry type of its own, because that is where it happens
-- in everyday life — at the bottle.
ALTER TABLE entries ADD COLUMN vitamin_d INTEGER NOT NULL DEFAULT 0;

-- The daily question "has it happened today?" runs over type and time.
CREATE INDEX IF NOT EXISTS idx_entries_vitamin ON entries (child_id, started_at)
  WHERE type = 'feed' AND vitamin_d = 1 AND deleted = 0;
