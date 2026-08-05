-- Push-Anmeldungen, eine Zeile je Gerät.
--
-- Die Einstellungen hängen bewusst AM GERÄT, nicht am Haushalt: Wer nachts ohnehin
-- wach ist, will die Erinnerung auch nachts; wer daneben schläft, ganz sicher nicht.
-- Eine gemeinsame Einstellung würde zwangsläufig einen von beiden falsch bedienen.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint          TEXT PRIMARY KEY,
  p256dh            TEXT NOT NULL,
  auth              TEXT NOT NULL,
  device_name       TEXT NOT NULL,
  -- Wie lange vor der erwarteten Mahlzeit erinnert wird.
  lead_minutes      INTEGER NOT NULL DEFAULT 10,
  -- Ruhezeit als Stunden in Lokalzeit; NULL heißt: rund um die Uhr senden.
  quiet_from_hour   INTEGER,
  quiet_to_hour     INTEGER,
  -- Für welche Mahlzeit zuletzt erinnert wurde. Verhindert, dass die Erinnerung
  -- im Minutentakt erneut rausgeht, solange die nächste Flasche noch aussteht.
  last_notified_for TEXT,
  -- Wiederholt fehlschlagende Anmeldungen werden aufgeräumt.
  failures          INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL
);
