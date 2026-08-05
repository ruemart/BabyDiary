import { describe, expect, it } from "vitest";

// `config` demands these values on load. The logic here does not need them — but the
// module chain does, as long as config.ts validates on import.
process.env["HOUSEHOLD_SECRET"] = "test-household-secret-0123456789";
process.env["COOKIE_SECRET"] = "test-cookie-secret-0123456789abc";

const { dueNotifications, isQuietHour } = await import("./push.ts");
type PushSubscriptionRow = import("./push.ts").PushSubscriptionRow;

function sub(over: Partial<PushSubscriptionRow> = {}): PushSubscriptionRow {
  return {
    endpoint: "https://push.example/abc",
    p256dh: "k",
    auth: "a",
    device_name: "Mama",
    lead_minutes: 10,
    quiet_from_hour: 22,
    quiet_to_hour: 6,
    last_notified_for: null,
    failures: 0,
    ...over,
  };
}

const TZ = "Europe/Berlin";
const next = (dueAt: string) => ({
  lastFeedId: "f1",
  lastFeedAt: Date.parse(dueAt) - 3 * 3600_000,
  typicalGapMinutes: 180,
  dueAt: Date.parse(dueAt),
});

describe("Quiet hours", () => {
  it("stays silent across midnight", () => {
    // 22:00–06:00 local. In summer Berlin is UTC+2.
    expect(isQuietHour(sub(), new Date("2026-08-05T21:00:00Z"), TZ)).toBe(true); // 23:00
    expect(isQuietHour(sub(), new Date("2026-08-05T01:00:00Z"), TZ)).toBe(true); // 03:00
    expect(isQuietHour(sub(), new Date("2026-08-05T10:00:00Z"), TZ)).toBe(false); // 12:00
  });

  it("never stays silent when no quiet hours are set", () => {
    const always = sub({ quiet_from_hour: null, quiet_to_hour: null });
    expect(isQuietHour(always, new Date("2026-08-05T01:00:00Z"), TZ)).toBe(false);
  });
});

describe("Due reminders", () => {
  const due = "2026-08-05T12:00:00Z"; // 14:00 lokal, außerhalb der Ruhezeit

  it("speaks up at the lead time, not earlier", () => {
    // 20 minutes before, lead time is 10 -> nothing yet.
    expect(dueNotifications([sub()], next(due), new Date("2026-08-05T11:40:00Z"), TZ)).toHaveLength(0);
    // 10 Minuten vorher -> jetzt.
    expect(dueNotifications([sub()], next(due), new Date("2026-08-05T11:50:00Z"), TZ)).toHaveLength(1);
  });

  it("does not remind twice about the same feed", () => {
    // Otherwise the message would go out every minute while nothing is recorded.
    const alreadySent = sub({ last_notified_for: "f1" });
    expect(dueNotifications([alreadySent], next(due), new Date("2026-08-05T11:55:00Z"), TZ)).toHaveLength(0);
  });

  it("gives up on a long overdue expectation", () => {
    // Two hours after the expected moment: either a feed happened and was not recorded,
    // or the rhythm has shifted. Either way the reminder is worthless.
    expect(dueNotifications([sub()], next(due), new Date("2026-08-05T14:00:00Z"), TZ)).toHaveLength(0);
  });

  it("stays silent during quiet hours", () => {
    const nightDue = "2026-08-05T01:00:00Z"; // 03:00 lokal
    expect(
      dueNotifications([sub()], next(nightDue), new Date("2026-08-05T00:55:00Z"), TZ),
    ).toHaveLength(0);
  });

  it("speaks up at night when the device wants it to", () => {
    const nightDue = "2026-08-05T01:00:00Z";
    const always = sub({ quiet_from_hour: null, quiet_to_hour: null });
    expect(
      dueNotifications([always], next(nightDue), new Date("2026-08-05T00:55:00Z"), TZ),
    ).toHaveLength(1);
  });

  it("serves several devices with their own settings", () => {
    const mama = sub({ endpoint: "https://push.example/mama", lead_minutes: 30 });
    const papa = sub({ endpoint: "https://push.example/papa", lead_minutes: 0 });
    // 30 minutes before: only Mama.
    const result = dueNotifications([mama, papa], next(due), new Date("2026-08-05T11:30:00Z"), TZ);
    expect(result.map((r) => r.sub.endpoint)).toEqual(["https://push.example/mama"]);
  });

  it("does nothing without a reliable rhythm", () => {
    expect(dueNotifications([sub()], null, new Date(), TZ)).toHaveLength(0);
  });
});
