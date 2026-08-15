-- Medicines as a list you set up, and a dose as an entry of its own.
--
-- There were two boolean columns before: `vitamin_d` and `colic_drops`. Both were the
-- right shape for one medicine each and the wrong shape for the third — BiGaia would
-- have meant a third column, a third flag in five files, and a third special case in the
-- charts. The pattern only ever worked because there happened to be two.
--
-- A plan (`medicineplan`) is what the household set up: name, unit, how big a dose, how
-- often a day. A dose (`medicine`) is what was actually given, pointing at the plan and
-- carrying the name along — a plan gets deleted when a treatment ends, and the history
-- has to stay readable afterwards.
--
-- Still no table of its own: an entry syncs, is deleted softly, resolves conflicts and
-- appears in the history without a single line of new plumbing. That is what the one
-- table was for.
ALTER TABLE entries ADD COLUMN medicine_id TEXT;
ALTER TABLE entries ADD COLUMN medicine_amount REAL;
ALTER TABLE entries ADD COLUMN medicine_unit TEXT;
ALTER TABLE entries ADD COLUMN medicine_times_per_day INTEGER;
ALTER TABLE entries ADD COLUMN with_entry_id TEXT;

-- The daily question is "which doses on this day", per medicine.
CREATE INDEX IF NOT EXISTS idx_entries_medicine ON entries (child_id, medicine_id, started_at)
  WHERE type = 'medicine' AND deleted = 0;

/*
 * Taking the old flags across.
 *
 * Every flagged feed becomes a dose at the same moment, by the same person, linked back
 * to its feed. The flags themselves STAY as they are: they are what this conversion can
 * be checked against afterwards, and clearing them would edit entries the devices have
 * long since agreed on. Nothing reads them any more — the app shows the doses.
 *
 * Ids are derived from the feed's id instead of being random, so the same feed can never
 * produce two doses even if this ever ran twice.
 *
 * `rev` is the sync cursor and must keep climbing: every row gets one above the highest
 * in use, otherwise a device whose cursor already stands higher would never be sent
 * these entries. The counter is pulled up after each block, because the next block reads
 * its base from it. The base sits in a MATERIALIZED CTE rather than in a subquery on the
 * insert line — a correlated subquery over the table being written to may be evaluated
 * again per row, and two rows sharing a rev is a sync cursor that skips one of them.
 *
 * Vitamin D is one a day — that is the dose regime, not a guess. Its AMOUNT stays empty,
 * and so does everything about the drops: the flags recorded that something was given,
 * never how much. Settings shows the gap and it takes ten seconds to fill in; an
 * invented number would look like a checked one forever.
 */
WITH base AS MATERIALIZED (
  SELECT MAX(
    (SELECT value FROM counters WHERE name = 'rev'),
    (SELECT COALESCE(MAX(rev), 0) FROM entries)
  ) AS v
)
INSERT INTO entries (
  id, child_id, type, started_at, label,
  medicine_unit, medicine_times_per_day,
  created_by, edited_at, rev, deleted
)
SELECT
  plan.id,
  (SELECT child_id FROM entries WHERE type = 'feed' ORDER BY started_at LIMIT 1),
  'medicineplan',
  -- Starts when it was first given: the adherence grid must not report missed days for
  -- a time before the medicine existed.
  (SELECT MIN(started_at) FROM entries f WHERE f.type = 'feed' AND f.deleted = 0
     AND ((plan.flag = 'vitamin_d' AND f.vitamin_d = 1) OR (plan.flag = 'colic_drops' AND f.colic_drops = 1))),
  plan.label,
  'drops',
  plan.times_per_day,
  'Migration',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  base.v + ROW_NUMBER() OVER (ORDER BY plan.id),
  0
FROM (
  SELECT 'medplan-vitamin-d' AS id, 'Vitamin D' AS label, 'vitamin_d' AS flag, 1 AS times_per_day
  UNION ALL
  -- No number of times a day: the drops are given when the evening calls for them.
  SELECT 'medplan-simeticon', 'Simeticon', 'colic_drops', NULL
) AS plan
CROSS JOIN base
WHERE EXISTS (
  SELECT 1 FROM entries f WHERE f.type = 'feed' AND f.deleted = 0
    AND ((plan.flag = 'vitamin_d' AND f.vitamin_d = 1) OR (plan.flag = 'colic_drops' AND f.colic_drops = 1))
);

UPDATE counters SET value = MAX(value, (SELECT COALESCE(MAX(rev), 0) FROM entries))
  WHERE name = 'rev';

WITH base AS MATERIALIZED (SELECT value AS v FROM counters WHERE name = 'rev')
INSERT INTO entries (
  id, child_id, type, started_at, label,
  medicine_id, medicine_unit, with_entry_id,
  created_by, edited_at, rev, deleted
)
SELECT
  'med-vd-' || f.id,
  f.child_id,
  'medicine',
  f.started_at,
  'Vitamin D',
  'medplan-vitamin-d',
  'drops',
  f.id,
  f.created_by,
  f.edited_at,
  base.v + ROW_NUMBER() OVER (ORDER BY f.started_at),
  0
FROM entries f
CROSS JOIN base
WHERE f.type = 'feed' AND f.deleted = 0 AND f.vitamin_d = 1;

UPDATE counters SET value = MAX(value, (SELECT COALESCE(MAX(rev), 0) FROM entries))
  WHERE name = 'rev';

WITH base AS MATERIALIZED (SELECT value AS v FROM counters WHERE name = 'rev')
INSERT INTO entries (
  id, child_id, type, started_at, label,
  medicine_id, medicine_unit, with_entry_id,
  created_by, edited_at, rev, deleted
)
SELECT
  'med-cd-' || f.id,
  f.child_id,
  'medicine',
  f.started_at,
  'Simeticon',
  'medplan-simeticon',
  'drops',
  f.id,
  f.created_by,
  f.edited_at,
  base.v + ROW_NUMBER() OVER (ORDER BY f.started_at),
  0
FROM entries f
CROSS JOIN base
WHERE f.type = 'feed' AND f.deleted = 0 AND f.colic_drops = 1;

UPDATE counters SET value = MAX(value, (SELECT COALESCE(MAX(rev), 0) FROM entries))
  WHERE name = 'rev';
