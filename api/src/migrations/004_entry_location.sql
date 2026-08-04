-- Ort an Abwesenheits-Einträgen.
--
-- Im Urlaub ist das Wetter zu Hause uninteressant. Statt einer täglichen
-- Ortsangabe hängt der Ort am Urlaubs-Eintrag, der ohnehin schon Anfang und Ende
-- hat: Für die Tage, die er abdeckt, gilt sein Ort — sonst der Heimatort aus den
-- Einstellungen. Eine Eingabe, kein tägliches Nachpflegen.
ALTER TABLE entries ADD COLUMN latitude REAL;
ALTER TABLE entries ADD COLUMN longitude REAL;
ALTER TABLE entries ADD COLUMN place_name TEXT;
