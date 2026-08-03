import type { Child, SyncResponse } from "@babymonitor/shared";
import {
  META_CURSOR,
  applyServerEntries,
  clearSentOutbox,
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
};

let inFlight: Promise<SyncOutcome> | null = null;

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
      body: JSON.stringify({ childId, since, changes: entries, child }),
    });
  } catch {
    // Kein Netz. Der Ausgangskorb bleibt unangetastet und geht beim nächsten Mal mit.
    return { state: "offline", pulled: 0, pushed: 0 };
  }

  if (response.status === 401) return { state: "unauthorized", pulled: 0, pushed: 0 };
  if (!response.ok) {
    console.warn("Sync abgelehnt", response.status, await response.text().catch(() => ""));
    return { state: "error", pulled: 0, pushed: 0 };
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

  return { state: "idle", pulled: body.entries.length, pushed: entries.length };
}

/* ── Sitzung ────────────────────────────────────────────────────────────────── */

export async function checkSession(): Promise<{ authenticated: boolean; name?: string }> {
  try {
    const res = await fetch("/api/session/check", { credentials: "same-origin" });
    if (!res.ok) return { authenticated: false };
    return await res.json();
  } catch {
    // Offline: wir wissen es nicht. Als angemeldet behandeln, damit die App im
    // Funkloch nicht auf den Einladungsbildschirm zurückfällt.
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
