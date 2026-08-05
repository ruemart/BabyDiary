-- A feed that was brought back up completely.
--
-- The event remains — she did drink, and the moment counts towards the rhythm and
-- towards "when was the last bottle". Only the millilitres must stay out of the daily
-- total; otherwise the charts show an intake that never made it into the child.
ALTER TABLE entries ADD COLUMN spat_up INTEGER NOT NULL DEFAULT 0;
