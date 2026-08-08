import webpush from "web-push";
import { localParts } from "@babydiary/shared";
import { config } from "./config.ts";
import type { Db } from "./db.ts";
import type { Store } from "./db.ts";

/**
 * A reminder when the next bottle might be due.
 *
 * The expected moment does NOT come from a table but from the child's own rhythm: the
 * median of recent gaps. A population average would be worthless here — every child has
 * their own pace, and it shifts over the months anyway.
 *
 * Median rather than mean, because a single long night tips the mean and the reminder
 * would then be systematically late.
 */

export type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
  device_name: string;
  lead_minutes: number;
  /** This device's language for the notification texts. */
  locale: string;
  quiet_from_hour: number | null;
  quiet_to_hour: number | null;
  last_notified_for: string | null;
  failures: number;
};

/** From this many failures on, a subscription counts as dead and is removed. */
const MAX_FAILURES = 5;

/** Weniger Mahlzeiten ergeben keinen belastbaren Rhythmus. */
const MIN_FEEDS_FOR_RHYTHM = 5;

export function isPushConfigured(): boolean {
  return !!config.vapidPublicKey && !!config.vapidPrivateKey;
}

/**
 * Set the keys up on the first send, not on import.
 *
 * A module that reads secrets on load and configures a library as a side effect cannot
 * be tested without standing up the whole environment — even though the actual logic
 * here (rhythm, quiet hours, due times) is pure arithmetic without any secret at all.
 * The test run uncovered exactly that.
 */
let vapidReady = false;

function ensureVapid(): void {
  if (vapidReady || !isPushConfigured()) return;
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  vapidReady = true;
}

export function createPushStore(db: Db) {
  const upsert = db.prepare(`
    INSERT INTO push_subscriptions (
      endpoint, p256dh, auth, device_name, lead_minutes, locale,
      quiet_from_hour, quiet_to_hour, created_at
    ) VALUES (
      @endpoint, @p256dh, @auth, @device_name, @lead_minutes, @locale,
      @quiet_from_hour, @quiet_to_hour, @created_at
    )
    ON CONFLICT(endpoint) DO UPDATE SET
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      device_name = excluded.device_name,
      lead_minutes = excluded.lead_minutes,
      locale = excluded.locale,
      quiet_from_hour = excluded.quiet_from_hour,
      quiet_to_hour = excluded.quiet_to_hour,
      failures = 0
  `);

  return {
    save(row: Omit<PushSubscriptionRow, "last_notified_for" | "failures">) {
      upsert.run({ ...row, created_at: new Date().toISOString() });
    },
    remove(endpoint: string) {
      db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
    },
    get(endpoint: string): PushSubscriptionRow | undefined {
      return db
        .prepare<[string], PushSubscriptionRow>(
          "SELECT * FROM push_subscriptions WHERE endpoint = ?",
        )
        .get(endpoint);
    },
    all(): PushSubscriptionRow[] {
      return db.prepare<[], PushSubscriptionRow>("SELECT * FROM push_subscriptions").all();
    },
    markNotified(endpoint: string, forId: string) {
      db.prepare("UPDATE push_subscriptions SET last_notified_for = ?, failures = 0 WHERE endpoint = ?")
        .run(forId, endpoint);
    },
    recordFailure(endpoint: string) {
      db.prepare("UPDATE push_subscriptions SET failures = failures + 1 WHERE endpoint = ?")
        .run(endpoint);
    },
    prune() {
      return db
        .prepare("DELETE FROM push_subscriptions WHERE failures >= ?")
        .run(MAX_FAILURES).changes;
    },
  };
}

export type PushStore = ReturnType<typeof createPushStore>;

/* ── Vorhersage ─────────────────────────────────────────────────────────────── */

export type NextFeed = {
  /** The last feed the estimate is based on. */
  lastFeedId: string;
  lastFeedAt: number;
  /** Typischer Abstand in Minuten. */
  typicalGapMinutes: number;
  /** When the next one is expected. */
  dueAt: number;
};

export function predictNextFeed(store: Store, childId: string): NextFeed | null {
  const feeds = store
    .entriesSince(childId, 0)
    .filter((e) => e.type === "feed" && !e.deleted)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 12);

  if (feeds.length < MIN_FEEDS_FOR_RHYTHM) return null;

  const gaps: number[] = [];
  for (let i = 1; i < feeds.length; i++) {
    const gap = Date.parse(feeds[i - 1]!.startedAt) - Date.parse(feeds[i]!.startedAt);
    // Two entries in the same minute are a correction, not a rhythm.
    if (gap > 15 * 60_000) gaps.push(gap);
  }
  if (gaps.length < 3) return null;

  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)]!;

  const last = feeds[0]!;
  return {
    lastFeedId: last.id,
    lastFeedAt: Date.parse(last.startedAt),
    typicalGapMinutes: Math.round(median / 60_000),
    dueAt: Date.parse(last.startedAt) + median,
  };
}

/** Does this time of day fall into this device's quiet hours? */
export function isQuietHour(
  sub: Pick<PushSubscriptionRow, "quiet_from_hour" | "quiet_to_hour">,
  at: Date,
  timezone: string,
): boolean {
  if (sub.quiet_from_hour === null || sub.quiet_to_hour === null) return false;
  const hour = localParts(at, timezone).hour;
  const { quiet_from_hour: from, quiet_to_hour: to } = sub;
  // Across midnight, e.g. 22:00 to 06:00.
  return from > to ? hour >= from || hour < to : hour >= from && hour < to;
}

/* ── Versand ────────────────────────────────────────────────────────────────── */

export type Notification = { title: string; body: string; tag?: string; url?: string };

export async function sendTo(
  pushStore: PushStore,
  sub: PushSubscriptionRow,
  notification: Notification,
): Promise<boolean> {
  ensureVapid();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(notification),
      { TTL: 30 * 60 },
    );
    return true;
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    // 404/410 means this subscription no longer exists. Remove it at once rather than
    // writing to it for another five rounds.
    if (status === 404 || status === 410) {
      pushStore.remove(sub.endpoint);
    } else {
      pushStore.recordFailure(sub.endpoint);
    }
    return false;
  }
}

/**
 * One pass of the scheduler: who should get a reminder now?
 *
 * Built as a pure function of the current moment so it can be tested without waiting
 * an hour.
 */
/**
 * The server's notification texts.
 *
 * Deliberately small and kept here rather than in the frontend's language files: the
 * server should not have to load that JSON for two sentences. An unknown language falls
 * back to English.
 */
const PUSH_TEXTS: Record<string, Record<string, string>> = {
  en: {
    soon: "Bottle in about {minutes} min",
    due: "A bottle would be due",
    body: "Usually every {hours} h {minutes} min. She decides — this is only a reminder.",
  },
  de: {
    soon: "Fläschchen in etwa {minutes} Min",
    due: "Fläschchen wäre dran",
    body: "Sonst alle {hours} Std {minutes} Min. Sie entscheidet — das hier ist nur eine Erinnerung.",
  },
};

function text(locale: string, key: string, values: Record<string, string> = {}): string {
  const table = PUSH_TEXTS[locale] ?? PUSH_TEXTS["en"]!;
  const template = table[key] ?? PUSH_TEXTS["en"]![key]!;
  return template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
}

export function dueNotifications(
  subs: PushSubscriptionRow[],
  next: NextFeed | null,
  now: Date,
  timezone: string,
): { sub: PushSubscriptionRow; notification: Notification }[] {
  if (!next) return [];

  const result: { sub: PushSubscriptionRow; notification: Notification }[] = [];

  for (const sub of subs) {
    // Already reminded for this feed — otherwise it would go out every minute.
    if (sub.last_notified_for === next.lastFeedId) continue;

    const notifyAt = next.dueAt - sub.lead_minutes * 60_000;
    if (now.getTime() < notifyAt) continue;

    // Stop reminding once the expected moment is long past: by then either a feed
    // happened and was not recorded, or the rhythm has shifted. A reminder about a
    // three-hour-old expectation does not help.
    if (now.getTime() > next.dueAt + 90 * 60_000) continue;

    if (isQuietHour(sub, now, timezone)) continue;

    const minutesAway = Math.round((next.dueAt - now.getTime()) / 60_000);
    result.push({
      sub,
      notification: {
        title:
          minutesAway > 0
            ? text(sub.locale, "soon", { minutes: String(minutesAway) })
            : text(sub.locale, "due"),
        body: text(sub.locale, "body", {
          hours: String(Math.floor(next.typicalGapMinutes / 60)),
          minutes: String(next.typicalGapMinutes % 60),
        }),
        tag: "next-feed",
        url: "/",
      },
    });
  }

  return result;
}
