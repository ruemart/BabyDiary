import type { Child, InvalidEntry, SyncResponse } from "@babymonitor/shared";
import {
  META_CURSOR,
  applyServerEntries,
  clearSentOutbox,
  dropFromOutbox,
  getLocalChild,
  getMeta,
  saveLocalChild,
  setMeta,
  takeOutbox,
} from "./db/local.ts";

export type SyncState = "idle" | "syncing" | "offline" | "unauthorized" | "error";

export type SyncOutcome = {
  state: SyncState;
  pulled: number;
  pushed: number;
  /** Einträge, die der Server dauerhaft nicht annimmt — brauchen eine Korrektur. */
  invalid: InvalidEntry[];
};

let inFlight: Promise<SyncOutcome> | null = null;

/**
 * Obergrenze für jede Netzanfrage.
 *
 * Ein hängender `fetch` schlägt NICHT fehl — er antwortet nur nie. Ohne Zeitlimit
 * bleibt jeder `await` darauf für immer stehen, und was daran hängt, hängt mit.
 * Genau so ist der Startvorgang in einer Endlosschleife gelandet: In einem schlechten
 * Netz blieb die Sitzungsprüfung offen, und die App kam nie über den Ladepunkt hinaus.
 */
const NETWORK_TIMEOUT_MS = 8000;

function timeoutSignal(ms = NETWORK_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(ms);
}

/**
 * Push und Pull in einem Request.
 *
 * Läuft immer nur einmal gleichzeitig: ein zweiter Aufruf bekommt das laufende
 * Versprechen zurück. Sonst würden ein Timer-Tick und ein Fokuswechsel denselben
 * Ausgangskorb doppelt senden.
 */
export function sync(childId: string): Promise<SyncOutcome> {
  if (inFlight) return inFlight;
  inFlight = run(childId).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(childId: string): Promise<SyncOutcome> {
  const { items, entries } = await takeOutbox();
  const since = Number((await getMeta(META_CURSOR)) ?? 0);
  const child = await getLocalChild();

  let response: Response;
  try {
    response = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      // Der Sync darf länger dauern als eine Sitzungsprüfung — er trägt Daten.
      signal: timeoutSignal(20_000),
      body: JSON.stringify({ childId, since, changes: entries, child }),
    });
  } catch {
    // Kein Netz. Der Ausgangskorb bleibt unangetastet und geht beim nächsten Mal mit.
    return { state: "offline", pulled: 0, pushed: 0, invalid: [] };
  }

  if (response.status === 401) return { state: "unauthorized", pulled: 0, pushed: 0, invalid: [] };
  if (!response.ok) {
    console.warn("Sync abgelehnt", response.status, await response.text().catch(() => ""));
    return { state: "error", pulled: 0, pushed: 0, invalid: [] };
  }

  const body = (await response.json()) as SyncResponse;

  await applyServerEntries(body.entries);
  if (body.child) await saveLocalChild(body.child);
  await clearSentOutbox(items);
  await setMeta(META_CURSOR, String(body.rev));

  if (body.rejected.length > 0) {
    // Kein Fehler: das andere Gerät war schneller, und dessen Fassung steht jetzt
    // bereits im Bestand — sie kam in derselben Antwort mit.
    console.info(`${body.rejected.length} Änderung(en) vom Server überstimmt`);
  }

  const invalid = body.invalid ?? [];
  if (invalid.length > 0) {
    // Aus dem Ausgangskorb nehmen, aber NICHT lokal löschen: Ein erneuter Versuch
    // hilft nie, aber die Eingabe gehört dem Menschen, nicht dem Schema. Sie bleibt
    // sichtbar und korrigierbar — nur blockiert sie nicht länger alles dahinter.
    await dropFromOutbox(invalid.map((i) => i.id));
    console.warn("Vom Server abgelehnt:", invalid);
  }

  return {
    state: "idle",
    pulled: body.entries.length,
    pushed: entries.length,
    invalid,
  };
}

/* ── Sitzung ────────────────────────────────────────────────────────────────── */

export async function checkSession(): Promise<{ authenticated: boolean; name?: string }> {
  try {
    const res = await fetch("/api/session/check", {
      credentials: "same-origin",
      signal: timeoutSignal(),
    });
    if (!res.ok) return { authenticated: false };
    return await res.json();
  } catch {
    // Offline ODER Zeitüberschreitung: Wir wissen es nicht. Als angemeldet behandeln,
    // damit die App im Funkloch weiterläuft statt auf den Einladungsbildschirm
    // zurückzufallen — die Eingabe funktioniert lokal ohnehin.
    return { authenticated: true };
  }
}

export async function redeemInvite(token: string, name: string): Promise<boolean> {
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ token, name }),
  });
  return res.ok;
}

export async function uploadImage(file: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", file, "foto.jpg");
  const res = await fetch("/api/media", {
    method: "POST",
    credentials: "same-origin",
    body: form,
  });
  if (!res.ok) throw new Error(`Upload fehlgeschlagen (${res.status})`);
  return (await res.json()).mediaId as string;
}

export type { Child };
