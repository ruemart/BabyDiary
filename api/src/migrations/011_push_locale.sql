-- The device's language for the notification texts.
--
-- On the device, not the household: the text is read on THIS phone, and the language
-- choice lives there anyway. Two parents may use the app in different languages, and
-- then the messages should arrive differently too.
ALTER TABLE push_subscriptions ADD COLUMN locale TEXT NOT NULL DEFAULT 'en';
