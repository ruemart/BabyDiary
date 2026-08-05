-- A location on away entries.
--
-- On holiday the weather at home is of no interest. Instead of a daily location, the
-- place hangs off the holiday entry, which already has a start and an end: for the days
-- it covers, its location applies — otherwise the home location from Settings. One
-- input, not daily upkeep.
ALTER TABLE entries ADD COLUMN latitude REAL;
ALTER TABLE entries ADD COLUMN longitude REAL;
ALTER TABLE entries ADD COLUMN place_name TEXT;
