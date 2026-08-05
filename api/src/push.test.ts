import { describe, expect, it } from "vitest";

// `config` verlangt diese Werte beim Laden. Die Logik hier braucht sie nicht — aber
// die Modulkette schon, solange config.ts beim Import prüft.
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

describe("Ruhezeit", () => {
  it("schweigt über Mitternacht hinweg", () => {
    // 22–6 Uhr lokal. Im Sommer ist Berlin UTC+2.
    expect(isQuietHour(sub(), new Date("2026-08-05T21:00:00Z"), TZ)).toBe(true); // 23:00
    expect(isQuietHour(sub(), new Date("2026-08-05T01:00:00Z"), TZ)).toBe(true); // 03:00
    expect(isQuietHour(sub(), new Date("2026-08-05T10:00:00Z"), TZ)).toBe(false); // 12:00
  });

  it("schweigt nie, wenn keine Ruhezeit gesetzt ist", () => {
    const always = sub({ quiet_from_hour: null, quiet_to_hour: null });
    expect(isQuietHour(always, new Date("2026-08-05T01:00:00Z"), TZ)).toBe(false);
  });
});

describe("Fällige Erinnerungen", () => {
  const due = "2026-08-05T12:00:00Z"; // 14:00 lokal, außerhalb der Ruhezeit

  it("meldet sich zur Vorlaufzeit, nicht früher", () => {
    // 20 Minuten vorher, Vorlauf ist 10 -> noch nichts.
    expect(dueNotifications([sub()], next(due), new Date("2026-08-05T11:40:00Z"), TZ)).toHaveLength(0);
    // 10 Minuten vorher -> jetzt.
    expect(dueNotifications([sub()], next(due), new Date("2026-08-05T11:50:00Z"), TZ)).toHaveLength(1);
  });

  it("erinnert nicht zweimal an dieselbe Mahlzeit", () => {
    // Sonst ginge die Meldung im Minutentakt raus, solange nichts eingetragen wird.
    const alreadySent = sub({ last_notified_for: "f1" });
    expect(dueNotifications([alreadySent], next(due), new Date("2026-08-05T11:55:00Z"), TZ)).toHaveLength(0);
  });

  it("gibt eine lange überfällige Erwartung auf", () => {
    // Zwei Stunden nach dem erwarteten Zeitpunkt: Entweder wurde gefüttert und
    // nicht eingetragen, oder der Rhythmus hat sich verschoben. Beides macht die
    // Erinnerung wertlos.
    expect(dueNotifications([sub()], next(due), new Date("2026-08-05T14:00:00Z"), TZ)).toHaveLength(0);
  });

  it("schweigt in der Ruhezeit", () => {
    const nightDue = "2026-08-05T01:00:00Z"; // 03:00 lokal
    expect(
      dueNotifications([sub()], next(nightDue), new Date("2026-08-05T00:55:00Z"), TZ),
    ).toHaveLength(0);
  });

  it("meldet sich nachts, wenn das Gerät das so will", () => {
    const nightDue = "2026-08-05T01:00:00Z";
    const always = sub({ quiet_from_hour: null, quiet_to_hour: null });
    expect(
      dueNotifications([always], next(nightDue), new Date("2026-08-05T00:55:00Z"), TZ),
    ).toHaveLength(1);
  });

  it("bedient mehrere Geräte mit eigenen Einstellungen", () => {
    const mama = sub({ endpoint: "https://push.example/mama", lead_minutes: 30 });
    const papa = sub({ endpoint: "https://push.example/papa", lead_minutes: 0 });
    // 30 Minuten vorher: nur Mama.
    const result = dueNotifications([mama, papa], next(due), new Date("2026-08-05T11:30:00Z"), TZ);
    expect(result.map((r) => r.sub.endpoint)).toEqual(["https://push.example/mama"]);
  });

  it("tut nichts ohne belastbaren Rhythmus", () => {
    expect(dueNotifications([sub()], null, new Date(), TZ)).toHaveLength(0);
  });
});
