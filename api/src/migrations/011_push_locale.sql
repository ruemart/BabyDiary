-- Sprache des Geräts für die Benachrichtigungstexte.
--
-- Am Gerät und nicht am Haushalt: Der Text wird auf DIESEM Telefon gelesen, und die
-- Sprachwahl steht ohnehin dort. Zwei Eltern dürfen die App in verschiedenen Sprachen
-- benutzen, und dann sollen auch die Meldungen unterschiedlich ankommen.
ALTER TABLE push_subscriptions ADD COLUMN locale TEXT NOT NULL DEFAULT 'en';
