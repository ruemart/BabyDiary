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
  port: Number(process.env["PORT"] ?? 3000),
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
} as const;
