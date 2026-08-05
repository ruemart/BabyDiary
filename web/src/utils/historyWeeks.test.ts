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

describe("A week in the history", () => {
  it("always returns seven days, including the empty ones", () => {
    const week = buildWeek([], TZ, MONTAG, HEUTE);
    expect(week.days).toHaveLength(7);
    expect(week.days.map((d) => d.key)).toEqual([
      "2026-08-03", "2026-08-04", "2026-08-05",
      "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09",
    ]);
    expect(week.days.map((d) => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("sums amount, bottles and nappies per day", () => {
    const week = buildWeek(
      [
        entry({ startedAt: "2026-08-05T06:00:00.000Z", amountMl: 120 }),
        entry({ startedAt: "2026-08-05T09:00:00.000Z", amountMl: 100 }),
        entry({ startedAt: "2026-08-05T10:00:00.000Z", type: "diaper", diaper: "wet" }),
        // A different day — must not count.
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

  it("keeps what came back up out of the daily total", () => {
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

  it("assigns a night feed to the local day, not the UTC day", () => {
    // 00:30 Berlin time = 22:30 UTC of the previous day.
    const week = buildWeek(
      [entry({ startedAt: "2026-08-04T22:30:00.000Z", amountMl: 90 })],
      TZ,
      MONTAG,
      HEUTE,
    );
    expect(week.days[1]!.totalMl).toBe(0);
    expect(week.days[2]!.totalMl).toBe(90);
  });

  it("shows the day chronologically, morning to evening", () => {
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

  it("counts only completed sleeps", () => {
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

  it("marks days after today as future", () => {
    const week = buildWeek([], TZ, MONTAG, HEUTE);
    expect(week.days.map((d) => d.isFuture)).toEqual([
      false, false, false, true, true, true, true,
    ]);
  });
});

describe("Week picker", () => {
  it("offers the current week even without a single entry", () => {
    expect(availableWeeks([], TZ, HEUTE)).toEqual([MONTAG]);
  });

  it("reaches back to the oldest week without gaps", () => {
    const weeks = availableWeeks(
      [entry({ startedAt: "2026-07-15T06:00:00.000Z" })],
      TZ,
      HEUTE,
    );
    // 15 July falls in the week starting 13 July — no gap in between.
    expect(weeks).toEqual(["2026-08-03", "2026-07-27", "2026-07-20", "2026-07-13"]);
  });
});

describe("Changing week", () => {
  it("keeps the weekday so weeks stay comparable", () => {
    // A week back from Wednesday -> the Wednesday before.
    expect(dayAfterWeekChange("2026-07-27", 2, HEUTE)).toBe("2026-07-29");
  });

  it("clamps to today instead of jumping into the future", () => {
    // Friday of the current week still lies ahead of us.
    expect(dayAfterWeekChange(MONTAG, 4, HEUTE)).toBe(HEUTE);
  });
});
