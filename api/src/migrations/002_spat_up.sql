-- Eine Mahlzeit, die vollständig wieder ausgespuckt wurde.
--
-- Das Ereignis bleibt bestehen — sie hat getrunken, der Zeitpunkt zählt für den
-- Rhythmus und für "wann war die letzte Flasche". Nur die Milliliter dürfen nicht in
-- die Tagesmenge eingehen, sonst zeigt die Auswertung eine Aufnahme, die nie im Kind
-- angekommen ist.
ALTER TABLE entries ADD COLUMN spat_up INTEGER NOT NULL DEFAULT 0;
