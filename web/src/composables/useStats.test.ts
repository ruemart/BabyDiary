import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStats } from "./useStats.ts";
import type { LocalEntry } from "../db/local.ts";

/**
 * The two grids added for medicine and baths.
 *
 * Both are about ABSENCE — a day without a dose, a fortnight without a bath — and that
 * is exactly what is easy to get wrong: a day before the medicine existed is not a
 * missed day, and today is not a missed day at nine in the morning.
 */

const TZ = "Europe/Berlin";
/** A Saturday, so the bath grid's week boundary is not accidentally the day itself. */
const TODAY = "2026-08-15T09:00:00.000Z";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(TODAY));
});

afterEach(() => vi.useRealTimers());

function plan(
  id: string,
  startedAt: string,
  timesPerDay: number | null,
  maxPerDay: number | null = null,
): LocalEntry {
  return {
    id,
    type: "medicineplan",
    label: id,
    startedAt,
    medicineTimesPerDay: timesPerDay,
    medicineMaxPerDay: maxPerDay,
  } as LocalEntry;
}

function dose(startedAt: string, medicineId: string): LocalEntry {
  return {
    id: `${medicineId}-${startedAt}`,
    type: "medicine",
    label: medicineId,
    startedAt,
    medicineId,
  } as LocalEntry;
}

const stats = (entries: LocalEntry[], days = 30) =>
  useStats(() => entries, () => TZ, days);

/** The cell for a given day, out of the row. */
const cellOn = (row: { cells: { day: string; state: string }[] }, day: string) =>
  row.cells.find((cell) => cell.day === day)!;

describe("Medicine, day by day", () => {
  it("the days before the medicine existed are not missed days", () => {
    const entries = [plan("vitamin-d", "2026-08-13T08:00:00.000Z", 1)];
    const row = stats(entries).medicineDays.value[0]!;

    expect(cellOn(row, "2026-08-01").state).toBe("none");
    expect(cellOn(row, "2026-08-14").state).toBe("missed");
    // Set up on the 13th, and today does not count yet — so the 13th and the 14th.
    expect(row.daysPossible).toBe(2);
  });

  /**
   * At nine in the morning nothing has been missed. Without this the chart would open
   * on a fresh gap at its right edge every night.
   */
  it("today is not a missed day until something is given", () => {
    const entries = [plan("vitamin-d", "2026-08-01T08:00:00.000Z", 1)];
    expect(cellOn(stats(entries).medicineDays.value[0]!, "2026-08-15").state).toBe("none");

    const withToday = [...entries, dose("2026-08-15T08:00:00.000Z", "vitamin-d")];
    const row = stats(withToday).medicineDays.value[0]!;
    expect(cellOn(row, "2026-08-15").state).toBe("complete");
    // Given today, so today counts on both sides of "13 of 14 days".
    expect(row.daysGiven).toBe(1);
    expect(row.daysPossible).toBe(15);
  });

  /**
   * Recording the past is allowed, and being marked down for it is not: a dose entered
   * for a day before the medicine was set up moves the start back with it.
   */
  it("a dose from before it was set up moves the start back", () => {
    const entries = [
      plan("vitamin-d", "2026-08-13T08:00:00.000Z", 1),
      dose("2026-08-10T08:00:00.000Z", "vitamin-d"),
    ];
    const row = stats(entries).medicineDays.value[0]!;

    expect(cellOn(row, "2026-08-09").state).toBe("none");
    expect(cellOn(row, "2026-08-10").state).toBe("complete");
    expect(cellOn(row, "2026-08-11").state).toBe("missed");
  });

  it("half the doses of a day are partial, all of them complete", () => {
    const entries = [
      plan("bigaia", "2026-08-10T08:00:00.000Z", 3),
      dose("2026-08-12T06:00:00.000Z", "bigaia"),
      dose("2026-08-13T06:00:00.000Z", "bigaia"),
      dose("2026-08-13T12:00:00.000Z", "bigaia"),
      dose("2026-08-13T18:00:00.000Z", "bigaia"),
    ];
    const row = stats(entries).medicineDays.value[0]!;

    expect(cellOn(row, "2026-08-12").state).toBe("partial");
    expect(cellOn(row, "2026-08-13").state).toBe("complete");
  });

  it("a medicine given as needed can never miss a day", () => {
    const entries = [
      plan("simeticon", "2026-08-01T08:00:00.000Z", null),
      dose("2026-08-13T19:00:00.000Z", "simeticon"),
    ];
    const row = stats(entries).medicineDays.value[0]!;

    expect(row.cells.some((cell) => cell.state === "missed")).toBe(false);
    expect(cellOn(row, "2026-08-13").state).toBe("complete");
    expect(row.streak).toBeNull();
  });

  /**
   * At nine in the morning nothing has been missed yet. A streak that resets itself
   * every midnight would be a counter of the time of day.
   */
  it("an incomplete today does not break the streak", () => {
    const entries = [
      plan("vitamin-d", "2026-08-01T08:00:00.000Z", 1),
      dose("2026-08-12T08:00:00.000Z", "vitamin-d"),
      dose("2026-08-13T08:00:00.000Z", "vitamin-d"),
      dose("2026-08-14T08:00:00.000Z", "vitamin-d"),
    ];
    expect(stats(entries).medicineDays.value[0]!.streak).toBe(3);
  });

  it("today counts as soon as it is complete", () => {
    const entries = [
      plan("vitamin-d", "2026-08-01T08:00:00.000Z", 1),
      dose("2026-08-14T08:00:00.000Z", "vitamin-d"),
      dose("2026-08-15T08:00:00.000Z", "vitamin-d"),
    ];
    const row = stats(entries).medicineDays.value[0]!;
    expect(row.streak).toBe(2);
    expect(row.givenToday).toBe(1);
  });

  it("a day missed the day before yesterday ends the streak there", () => {
    const entries = [
      plan("vitamin-d", "2026-08-01T08:00:00.000Z", 1),
      dose("2026-08-11T08:00:00.000Z", "vitamin-d"),
      dose("2026-08-14T08:00:00.000Z", "vitamin-d"),
    ];
    expect(stats(entries).medicineDays.value[0]!.streak).toBe(1);
  });

  /**
   * A day over the household's own ceiling is not a "complete" day. Colouring it as one
   * would hide the single thing on this chart worth going back for.
   */
  it("a day over the ceiling is marked as such, whatever else it would have been", () => {
    /** n doses spread over one day, an hour apart. */
    const doses = (n: number, day: string) =>
      Array.from({ length: n }, (_, i) =>
        dose(`${day}T${String(i + 6).padStart(2, "0")}:00:00.000Z`, "simeticon"),
      );

    const entries = [
      plan("simeticon", "2026-08-01T08:00:00.000Z", null, 6),
      ...doses(6, "2026-08-12"),
      ...doses(7, "2026-08-13"),
    ];
    const row = stats(entries).medicineDays.value[0]!;

    expect(cellOn(row, "2026-08-12").state).toBe("complete");
    expect(cellOn(row, "2026-08-13").state).toBe("over");
    expect(row.maxPerDay).toBe(6);
  });

  /**
   * A finished course of treatment: the medicine is off the list, the doses given are
   * not. They stay readable, and without a target — nothing is due any more.
   */
  it("doses of a medicine no longer set up keep their row", () => {
    const entries = [dose("2026-08-13T08:00:00.000Z", "antibiotic")];
    const row = stats(entries).medicineDays.value[0]!;

    expect(row.active).toBe(false);
    expect(row.name).toBe("antibiotic");
    expect(row.timesPerDay).toBeNull();
    expect(row.cells.some((cell) => cell.state === "missed")).toBe(false);
  });
});

describe("Baths, week by week", () => {
  const bath = (startedAt: string) => ({ id: startedAt, type: "bath", startedAt }) as LocalEntry;

  it("marks the day it happened and leaves the rest empty", () => {
    const { bathDays } = stats([bath("2026-08-12T17:00:00.000Z")]);
    // Wednesday is row 2, the current week the last column.
    const wednesday = bathDays.value.grid[2]!;
    expect(wednesday[wednesday.length - 1]!.count).toBe(1);
    expect(bathDays.value.grid[0]![0]!.count).toBe(0);
    expect(bathDays.value.total).toBe(1);
  });

  /** Days that have not happened yet are not days without a bath. */
  it("knows which days are still to come", () => {
    const { bathDays } = stats([]);
    const sunday = bathDays.value.grid[6]!;
    expect(sunday[sunday.length - 1]!.isFuture).toBe(true);
    const friday = bathDays.value.grid[4]!;
    expect(friday[friday.length - 1]!.isFuture).toBe(false);
  });

  it("works out the rhythm and how long ago the last one was", () => {
    const { bathDays } = stats([
      bath("2026-08-01T17:00:00.000Z"),
      bath("2026-08-05T17:00:00.000Z"),
      bath("2026-08-11T17:00:00.000Z"),
    ]);
    // Ten days between the first and the last, over two gaps.
    expect(bathDays.value.averageGapDays).toBe(5);
    expect(bathDays.value.daysSinceLast).toBe(4);
  });

  it("says nothing about a rhythm after a single bath", () => {
    const { bathDays } = stats([bath("2026-08-11T17:00:00.000Z")]);
    expect(bathDays.value.averageGapDays).toBeNull();
    expect(bathDays.value.daysSinceLast).toBe(4);
  });
});
