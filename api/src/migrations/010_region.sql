-- The household's country: drives which check-ups and vaccinations the timeline shows.
--
-- Belongs to the child, not the device: both parents live in the same country, and the
-- choice should not have to be repeated on the second phone.
--
-- Default "none" rather than "de": anyone upgrading has been seeing the German dates so
-- far — which is why this migration explicitly sets existing households to "de". For NEW
-- households "none" is right, because we do not know their country and showing another
-- country's vaccination dates would be worse than showing none.
ALTER TABLE child ADD COLUMN region TEXT NOT NULL DEFAULT 'none';
UPDATE child SET region = 'de';
