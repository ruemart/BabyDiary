import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Auth in einem Satz: Wer den Einladungs-Link einmal öffnet, bekommt ein signiertes
 * Cookie mit einem Jahr Laufzeit und sieht danach nie wieder eine Abfrage.
 *
 * Das ist bewusst simpel. Die Alternative (echtes Login) kostet bei jedem abgelaufenen
 * Token einen Anmeldebildschirm — nachts um drei, mit Baby auf dem Arm, an genau der
 * Stelle, an der die App schnell sein muss. Für eine Familien-App auf einer Domain,
 * die niemand kennt, ist der Tausch richtig.
 */

export type Session = {
  deviceId: string;
  /** Anzeigename, landet als `createdBy` an jedem Eintrag. */
  name: string;
  issuedAt: number;
};

export const SESSION_COOKIE = "bm_session";
export const SESSION_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function hmac(secret: string, data: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

export function signSession(session: Session, secret: string): string {
  const payload = b64url(Buffer.from(JSON.stringify(session), "utf8"));
  return `${payload}.${b64url(hmac(secret, payload))}`;
}

export function verifySession(token: string | undefined, secret: string): Session | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const payload = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = hmac(secret, payload);
  // Längen vorab prüfen: timingSafeEqual wirft bei ungleicher Länge, statt false zu liefern.
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    if (typeof parsed.deviceId !== "string" || typeof parsed.name !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Konstantzeit-Vergleich des Einladungs-Tokens gegen HOUSEHOLD_SECRET. */
export function isValidInvite(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function newSession(name: string): Session {
  return { deviceId: randomUUID(), name, issuedAt: Date.now() };
}
