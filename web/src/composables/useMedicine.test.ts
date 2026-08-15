import { describe, expect, it } from "vitest";
import { dayQuotaUsed, dosesOnDay } from "./useMedicine.ts";
import type { LocalEntry } from "../db/local.ts";

/**
 * The quota is what locks a tick in the bottle sheet, and it is the one piece of this
 * feature that can go wrong quietly: too strict and a dose cannot be recorded, too loose
 * and the app invites a double dose.
 */

const TZ = "Europe/Berlin";

function plan(id: string, timesPerDay: number | null): LocalEntry {
  return { id, type: "medicineplan", medicineTimesPerDay: timesPerDay } as LocalEntry;
}

function dose(id: string, startedAt: string, medicineId: string, withEntryId?: string): LocalEntry {
  return { id, type: "medicine", startedAt, medicineId, withEntryId: withEntryId ?? null } as LocalEntry;
}

describe("Doses of a day", () => {
  it("counts only that medicine, and only that day", () => {
    const entries = [
      dose("a", "2026-08-15T06:00:00.000Z", "vitamin-d"),
      dose("b", "2026-08-15T18:00:00.000Z", "bigaia"),
      dose("c", "2026-08-14T06:00:00.000Z", "vitamin-d"),
    ];
    expect(dosesOnDay(entries, TZ, "2026-08-15", "vitamin-d").map((e) => e.id)).toEqual(["a"]);
  });

  /**
   * Half past eleven at night is still that evening's dose. Counting in UTC would move
   * it to the next day and report the evening's dose as tomorrow's — and tomorrow as
   * missed.
   */
  it("goes by the local day, not by UTC", () => {
    const entries = [dose("late", "2026-08-15T21:30:00.000Z", "vitamin-d")];
    expect(dosesOnDay(entries, TZ, "2026-08-15", "vitamin-d")).toHaveLength(1);
    expect(dosesOnDay(entries, TZ, "2026-08-16", "vitamin-d")).toHaveLength(0);
  });

  it("hands back the newest first", () => {
    const entries = [
      dose("morning", "2026-08-15T06:00:00.000Z", "bigaia"),
      dose("evening", "2026-08-15T17:00:00.000Z", "bigaia"),
    ];
    expect(dosesOnDay(entries, TZ, "2026-08-15", "bigaia")[0]!.id).toBe("evening");
  });
});

describe("Whether the day's quota is used up", () => {
  const vitaminD = plan("vitamin-d", 1);

  it("one a day is full after one", () => {
    expect(dayQuotaUsed([], TZ, "2026-08-15", vitaminD)).toBe(false);
    expect(
      dayQuotaUsed([dose("a", "2026-08-15T06:00:00.000Z", "vitamin-d")], TZ, "2026-08-15", vitaminD),
    ).toBe(true);
  });

  it("three a day has room for two more after the first", () => {
    const drops = plan("bigaia", 3);
    const entries = [dose("a", "2026-08-15T06:00:00.000Z", "bigaia")];
    expect(dayQuotaUsed(entries, TZ, "2026-08-15", drops)).toBe(false);
    entries.push(dose("b", "2026-08-15T12:00:00.000Z", "bigaia"));
    entries.push(dose("c", "2026-08-15T18:00:00.000Z", "bigaia"));
    expect(dayQuotaUsed(entries, TZ, "2026-08-15", drops)).toBe(true);
  });

  /** Nobody set a number, so the app has none to enforce. */
  it("as needed is never full", () => {
    const asNeeded = plan("simeticon", null);
    const entries = Array.from({ length: 9 }, (_, i) =>
      dose(`d${i}`, `2026-08-15T0${i}:00:00.000Z`, "simeticon"),
    );
    expect(dayQuotaUsed(entries, TZ, "2026-08-15", asNeeded)).toBe(false);
  });

  /**
   * The case that makes editing usable: a feed already carrying the dose must be able to
   * give it up again. Without the exception its own dose would be the reason the tick is
   * locked, and a tick once set could never be taken back off.
   */
  it("a feed's own dose does not lock its own tick", () => {
    const entries = [dose("a", "2026-08-15T06:00:00.000Z", "vitamin-d", "feed-1")];
    expect(dayQuotaUsed(entries, TZ, "2026-08-15", vitaminD, "feed-1")).toBe(false);
    // Another feed's dose does lock it — that would be the second one that day.
    expect(dayQuotaUsed(entries, TZ, "2026-08-15", vitaminD, "feed-2")).toBe(true);
  });

  it("yesterday's dose says nothing about today", () => {
    const entries = [dose("a", "2026-08-14T06:00:00.000Z", "vitamin-d")];
    expect(dayQuotaUsed(entries, TZ, "2026-08-15", vitaminD)).toBe(false);
  });
});
