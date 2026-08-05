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
  /** Signs the session cookie. Changing it signs out every device. */
  cookieSecret: required("COOKIE_SECRET"),
  /**
   * Behind the Cloudflare tunnel the browser sees HTTPS while the container sees HTTP —
   * so `secure` belongs on true. Only turn it off for local development on
   * http://localhost, otherwise the browser never sends the cookie.
   */
  cookieSecure: process.env["COOKIE_SECURE"] !== "false",

  /**
   * Suggested country for check-ups and vaccinations, set during installation.
   *
   * Only a suggestion for the setup screen. The binding value lives with the child and
   * syncs to both devices — an environment variable would be the wrong home for
   * something you must be able to change without server access.
   */
  defaultRegion: process.env["DEFAULT_REGION"] ?? "none",

  /**
   * Key pair for web push (VAPID). Without it notifications are simply off — the app
   * works fully without them. Generate with:
   *   node -e "console.log(require('web-push').generateVAPIDKeys())"
   */
  vapidPublicKey: process.env["VAPID_PUBLIC_KEY"] ?? "",
  vapidPrivateKey: process.env["VAPID_PRIVATE_KEY"] ?? "",
  /** Contact address the push service can reach in case of trouble. */
  vapidSubject: process.env["VAPID_SUBJECT"] ?? "mailto:admin@example.invalid",
} as const;
