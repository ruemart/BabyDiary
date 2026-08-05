import { describe, expect, it } from "vitest";
import type { LocalEntry } from "../db/local.ts";
import { availableWeeks, buildWeek, dayAfterWeekChange } from "./historyWeeks.ts";

const TZ = "Europe/Berlin";
/** Monday, 3 August 2026 — start of the week that 5 August falls in. */
const MONTAG = "2026-08-03";
const HEUTE = "2026-08-05";

function entry(partial: Partial<LocalEntry> & { startedAt: string }): LocalEntry {
  return { id: partial.startedAt, type: "feed", ...partial } as LocalEntry;
}

describe("Woche im Verlauf", () => {
  it("liefert immer sieben Tage, auch die leeren", () => {
    const week = buildWeek([], TZ, MONTAG, HEUTE);
    expect(week.days).toHaveLength(7);
    expect(week.days.map((d) => d.key)).toEqual([
      "2026-08-03", "2026-08-04", "2026-08-05",
      "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09",
    ]);
    expect(week.days.map((d) => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("summiert Menge, Flaschen und Windeln je Tag", () => {
    const week = buildWeek(
      [
        entry({ startedAt: "2026-08-05T06:00:00.000Z", amountMl: 120 }),
        entry({ startedAt: "2026-08-05T09:00:00.000Z", amountMl: 100 }),
        entry({ startedAt: "2026-08-05T10:00:00.000Z", type: "diaper", diaper: "wet" }),
        // Anderer Tag — darf nicht mitzählen.
        entry({ startedAt: "2026-08-04T09:00:00.000Z", amountMl: 999 }),
      ],
      TZ,
      MONTAG,
      HEUTE,
    );

    const mittwoch = week.days[2]!;
    expect(mittwoch.totalMl).toBe(220);
    expect(mittwoch.feeds).toBe(2);
    expect(mittwoch.diapers).toBe(1);
    expect(mittwoch.entries).toHaveLength(3);
  });

  it("lässt Ausgespucktes nicht in die Tagesmenge zählen", () => {
    const week = buildWeek(
      [
        entry({ startedAt: "2026-08-05T06:00:00.000Z", amountMl: 120 }),
        entry({ startedAt: "2026-08-05T09:00:00.000Z", amountMl: 100, spatUp: true }),
      ],
      TZ,
      MONTAG,
      HEUTE,
    );
    // She was fed twice; only the first amount stayed down.
    expect(week.days[2]!.totalMl).toBe(120);
    expect(week.days[2]!.feeds).toBe(2);
  });

  it("ordnet eine Nachtmahlzeit dem lokalen Tag zu, nicht dem UTC-Tag", () => {
    // 00:30 Berliner Zeit = 22:30 UTC des Vortags.
    const week = buildWeek(
      [entry({ startedAt: "2026-08-04T22:30:00.000Z", amountMl: 90 })],
      TZ,
      MONTAG,
      HEUTE,
    );
    expect(week.days[1]!.totalMl).toBe(0);
    expect(week.days[2]!.totalMl).toBe(90);
  });

  it("zeigt den Tag chronologisch, von morgens nach abends", () => {
    const week = buildWeek(
      [
        entry({ id: "abends", startedAt: "2026-08-05T18:00:00.000Z" }),
        entry({ id: "morgens", startedAt: "2026-08-05T05:00:00.000Z" }),
        entry({ id: "mittags", startedAt: "2026-08-05T11:00:00.000Z" }),
      ],
      TZ,
      MONTAG,
      HEUTE,
    );
    expect(week.days[2]!.entries.map((e) => e.id)).toEqual(["morgens", "mittags", "abends"]);
  });

  it("zählt nur abgeschlossene Schlafphasen", () => {
    const week = buildWeek(
      [
        entry({
          startedAt: "2026-08-05T10:00:00.000Z",
          endedAt: "2026-08-05T11:30:00.000Z",
          type: "sleep",
        }),
        // Still running — no duration yet.
        entry({ startedAt: "2026-08-05T14:00:00.000Z", type: "sleep" }),
      ],
      TZ,
      MONTAG,
      HEUTE,
    );
    expect(week.days[2]!.sleepMinutes).toBe(90);
  });

  it("markiert Tage nach heute als Zukunft", () => {
    const week = buildWeek([], TZ, MONTAG, HEUTE);
    expect(week.days.map((d) => d.isFuture)).toEqual([
      false, false, false, true, true, true, true,
    ]);
  });
});

describe("Wochenauswahl", () => {
  it("bietet die laufende Woche auch ohne einen einzigen Eintrag an", () => {
    expect(availableWeeks([], TZ, HEUTE)).toEqual([MONTAG]);
  });

  it("reicht lückenlos bis zur ältesten Woche zurück", () => {
    const weeks = availableWeeks(
      [entry({ startedAt: "2026-07-15T06:00:00.000Z" })],
      TZ,
      HEUTE,
    );
    // 15. Juli liegt in der Woche ab dem 13. Juli — dazwischen keine Lücke.
    expect(weeks).toEqual(["2026-08-03", "2026-07-27", "2026-07-20", "2026-07-13"]);
  });
});

describe("Wochenwechsel", () => {
  it("behält den Wochentag bei, damit sich Wochen vergleichen lassen", () => {
    // A week back from Wednesday -> the Wednesday before.
    expect(dayAfterWeekChange("2026-07-27", 2, HEUTE)).toBe("2026-07-29");
  });

  it("klemmt auf heute, statt in die Zukunft zu springen", () => {
    // Friday of the current week still lies ahead of us.
    expect(dayAfterWeekChange(MONTAG, 4, HEUTE)).toBe(HEUTE);
  });
});
