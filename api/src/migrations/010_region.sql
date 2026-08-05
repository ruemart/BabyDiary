-- Land des Haushalts: steuert, welche Vorsorge- und Impftermine der Zeitstrahl zeigt.
--
-- Gehört zum Kind und nicht zum Gerät: Beide Eltern leben im selben Land, und die
-- Wahl soll sich auf dem zweiten Telefon nicht wiederholen.
--
-- Vorgabe "none" statt "de": Wer aktualisiert, hat die deutschen Termine bisher
-- gesehen — deshalb setzt die Migration bestehende Haushalte ausdrücklich auf "de".
-- Für NEUE Haushalte ist "none" richtig, weil wir ihr Land nicht kennen und
-- fremde Impftermine anzuzeigen schlimmer wäre als gar keine.
ALTER TABLE child ADD COLUMN region TEXT NOT NULL DEFAULT 'none';
UPDATE child SET region = 'de';
