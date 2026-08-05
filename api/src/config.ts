import { join } from "node:path";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 16) {
    throw new Error(
      `${name} fehlt oder ist zu kurz (mindestens 16 Zeichen). ` +
        `Erzeugen mit: openssl rand -hex 32`,
    );
  }
  return value;
}

const dataDir = process.env["DATA_DIR"] ?? join(process.cwd(), "..", "data");

export const config = {
  port: Number(process.env["PORT"] ?? 3010),
  host: process.env["HOST"] ?? "0.0.0.0",
  dataDir,
  databasePath: process.env["DATABASE_PATH"] ?? join(dataDir, "babymonitor.db"),
  mediaDir: process.env["MEDIA_DIR"] ?? join(dataDir, "media"),

  /** Wer diesen Wert im Einladungs-Link kennt, darf ein Gerät registrieren. */
  householdSecret: required("HOUSEHOLD_SECRET"),
  /** Signiert das Sitzungs-Cookie. Ändern setzt alle Geräte zurück. */
  cookieSecret: required("COOKIE_SECRET"),
  /**
   * Hinter dem Cloudflare-Tunnel sieht der Browser HTTPS, der Container HTTP —
   * `secure` gehört also auf true. Nur für lokale Entwicklung auf http://localhost
   * abschalten, sonst sendet der Browser das Cookie nie.
   */
  cookieSecure: process.env["COOKIE_SECURE"] !== "false",

  /**
   * Vorgeschlagenes Land für Vorsorge- und Impftermine, gesetzt beim Einrichten.
   *
   * Nur ein Vorschlag für den Einrichtungs-Assistenten. Die verbindliche Angabe steht
   * am Kind und wird mit beiden Geräten abgeglichen — ein Wert in der Umgebung wäre
   * dafür der falsche Ort, weil man ihn nur mit Serverzugriff ändern könnte.
   */
  defaultRegion: process.env["DEFAULT_REGION"] ?? "none",

  /**
   * Schlüsselpaar für Web Push (VAPID). Fehlt es, sind Benachrichtigungen einfach
   * aus — die App funktioniert vollständig ohne. Erzeugen mit:
   *   node -e "console.log(require('web-push').generateVAPIDKeys())"
   */
  vapidPublicKey: process.env["VAPID_PUBLIC_KEY"] ?? "",
  vapidPrivateKey: process.env["VAPID_PRIVATE_KEY"] ?? "",
  /** Kontaktadresse, die der Push-Dienst im Fehlerfall ansprechen kann. */
  vapidSubject: process.env["VAPID_SUBJECT"] ?? "mailto:admin@example.invalid",
} as const;
