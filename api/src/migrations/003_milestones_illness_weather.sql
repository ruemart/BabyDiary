-- Meilensteine als Abhakliste statt Freitext.
-- `label` bleibt für eigene Notizen erhalten, `milestone_key` verweist auf einen
-- Eintrag der festen Liste. Ohne diesen Schlüssel müsste man wissen, welche
-- Meilensteine es überhaupt gibt, um sie eintragen zu können — genau andersherum.
ALTER TABLE entries ADD COLUMN milestone_key TEXT;

-- Fieber bei Krankheitseinträgen, in Zehntelgrad als ganze Zahl (385 = 38,5 °C).
-- Dieselbe Begründung wie bei Gramm und Millimetern: keine Fließkomma-Rundung,
-- die sich über Jahre aufsummiert.
ALTER TABLE entries ADD COLUMN temperature_dc INTEGER;

-- Ort für die Wetterabfrage. Ohne Angabe bleibt die Wetterspur einfach leer.
ALTER TABLE child ADD COLUMN latitude REAL;
ALTER TABLE child ADD COLUMN longitude REAL;
ALTER TABLE child ADD COLUMN place_name TEXT;

-- Tageswerte vom Wetterdienst, einmal geholt und behalten.
--
-- Eigene Tabelle statt Eintragstyp: Das sind keine Beobachtungen der Eltern, sondern
-- Umgebungsdaten. Sie gehören nicht in den Verlauf, nicht in den Abgleich zwischen
-- den Geräten und nicht in die Sicherung der Familiendaten im engeren Sinn.
CREATE TABLE IF NOT EXISTS weather (
  day        TEXT PRIMARY KEY,   -- YYYY-MM-DD, lokaler Kalendertag
  tmax_dc    INTEGER,            -- Zehntelgrad
  tmin_dc    INTEGER,
  fetched_at TEXT NOT NULL
);
