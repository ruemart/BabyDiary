-- Push subscriptions, one row per device.
--
-- The settings deliberately hang off THE DEVICE, not the household: someone awake at
-- night anyway wants the reminder at night; someone sleeping next to them certainly does
-- not. A shared setting would inevitably serve one of the two badly.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint          TEXT PRIMARY KEY,
  p256dh            TEXT NOT NULL,
  auth              TEXT NOT NULL,
  device_name       TEXT NOT NULL,
  -- How long before the expected feed the reminder goes out.
  lead_minutes      INTEGER NOT NULL DEFAULT 10,
  -- Quiet hours as local hours; NULL means: send around the clock.
  quiet_from_hour   INTEGER,
  quiet_to_hour     INTEGER,
  -- Which feed the last reminder was for. Stops the reminder
  -- going out every minute while the next bottle is still outstanding.
  last_notified_for TEXT,
  -- Subscriptions that keep failing get cleaned up.
  failures          INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL
);
