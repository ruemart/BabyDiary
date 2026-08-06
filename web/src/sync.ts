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
  /** Entries the server permanently refuses — they need correcting. */
  invalid: InvalidEntry[];
};

let inFlight: Promise<SyncOutcome> | null = null;

/**
 * An upper bound for every network request.
 *
 * A hanging `fetch` does NOT fail — it simply never answers. Without a timeout every
 * `await` on it stands still forever, and whatever depends on it stands still too.
 * That is exactly how the boot sequence ended up in an endless loop: on a bad network
 * the session check stayed open and the app never got past the loading dot.
 */
const NETWORK_TIMEOUT_MS = 8000;

function timeoutSignal(ms = NETWORK_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(ms);
}

/**
 * Push and pull in one request.
 *
 * Only ever runs once at a time: a second call gets the promise already in flight.
 * Otherwise a timer tick and a focus change would send the same outbox twice.
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
      // Syncing may take longer than a session check — it carries data.
      signal: timeoutSignal(20_000),
      body: JSON.stringify({ childId, since, changes: entries, child }),
    });
  } catch {
    // No network. The outbox stays untouched and goes along next time.
    return { state: "offline", pulled: 0, pushed: 0, invalid: [] };
  }

  if (response.status === 401) return { state: "unauthorized", pulled: 0, pushed: 0, invalid: [] };
  if (!response.ok) {
    console.warn("Sync rejected", response.status, await response.text().catch(() => ""));
    return { state: "error", pulled: 0, pushed: 0, invalid: [] };
  }

  const body = (await response.json()) as SyncResponse;

  await applyServerEntries(body.entries);
  if (body.child) await saveLocalChild(body.child);
  await clearSentOutbox(items);
  await setMeta(META_CURSOR, String(body.rev));

  if (body.rejected.length > 0) {
    // Not an error: the other device was faster, and its version is already in the
    // store — it came along in the same response.
    console.info(`${body.rejected.length} change(s) overruled by the server`);
  }

  const invalid = body.invalid ?? [];
  if (invalid.length > 0) {
    // Take it out of the outbox but do NOT delete it locally: retrying never helps,
    // but the input belongs to the person, not to the schema. It stays visible and
    // correctable — it just no longer blocks everything behind it.
    await dropFromOutbox(invalid.map((i) => i.id));
    console.warn("Rejected by the server:", invalid);
  }

  return {
    state: "idle",
    pulled: body.entries.length,
    pushed: entries.length,
    invalid,
  };
}

/* ── Sitzung ────────────────────────────────────────────────────────────────── */

/**
 * The server's suggestion for the country. If the call fails it stays empty and the
 * setup screen shows "no appointments" — the right default when you know nothing.
 */
export async function fetchDefaultRegion(): Promise<string> {
  try {
    const res = await fetch("/api/health", { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return "";
    return ((await res.json()) as { defaultRegion?: string }).defaultRegion ?? "";
  } catch {
    return "";
  }
}

export async function checkSession(): Promise<{ authenticated: boolean; name?: string }> {
  try {
    const res = await fetch("/api/session/check", {
      credentials: "same-origin",
      signal: timeoutSignal(),
    });
    if (!res.ok) return { authenticated: false };
    return await res.json();
  } catch {
    // Offline OR timed out: we do not know. Treat as signed in so the app keeps working
    // in a dead spot instead of falling back to the invite screen — recording works
    // locally anyway.
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
