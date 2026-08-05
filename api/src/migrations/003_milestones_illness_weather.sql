-- Milestones as a checklist instead of free text.
-- `label` stays for your own notes, `milestone_key` points at an entry in the fixed
-- list. Without that key you would have to know which milestones exist in order to
-- record them — exactly back to front.
ALTER TABLE entries ADD COLUMN milestone_key TEXT;

-- Fever on illness entries, in tenths of a degree as an integer (385 = 38.5 °C).
-- The same reasoning as for grams and millimetres: no floating-point rounding
-- accumulating over years.
ALTER TABLE entries ADD COLUMN temperature_dc INTEGER;

-- Location for the weather lookup. Without one the weather track simply stays empty.
ALTER TABLE child ADD COLUMN latitude REAL;
ALTER TABLE child ADD COLUMN longitude REAL;
ALTER TABLE child ADD COLUMN place_name TEXT;

-- Daily values from the weather service, fetched once and kept.
--
-- Its own table rather than an entry type: these are not observations by the parents but
-- environmental data. They do not belong in the history, in the sync between devices, or
-- in the backup of the family's data in the narrower sense.
CREATE TABLE IF NOT EXISTS weather (
  day        TEXT PRIMARY KEY,   -- YYYY-MM-DD, lokaler Kalendertag
  tmax_dc    INTEGER,            -- Zehntelgrad
  tmin_dc    INTEGER,
  fetched_at TEXT NOT NULL
);
