import { describe, expect, it } from "vitest";
import { dailyCap, dayQuotaUsed, dosesOnDay } from "./useMedicine.ts";
import type { LocalEntry } from "../db/local.ts";

/**
 * The quota is what locks a tick in the bottle sheet, and it is the one piece of this
 * feature that can go wrong quietly: too strict and a dose cannot be recorded, too loose
 * and the app invites a double dose.
 */

const TZ = "Europe/Berlin";

function plan(id: string, timesPerDay: number | null, maxPerDay: number | null = null): LocalEntry {
  return {
    id,
    type: "medicineplan",
    medicineTimesPerDay: timesPerDay,
    medicineMaxPerDay: maxPerDay,
  } as LocalEntry;
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

  /** Nobody set a number of any kind, so the app has none to enforce. */
  it("as needed with no ceiling is never full", () => {
    const asNeeded = plan("simeticon", null);
    const entries = Array.from({ length: 9 }, (_, i) =>
      dose(`d${i}`, `2026-08-15T0${i}:00:00.000Z`, "simeticon"),
    );
    expect(dayQuotaUsed(entries, TZ, "2026-08-15", asNeeded)).toBe(false);
  });

  /**
   * The case the ceiling was added for: given when the evening calls for it, and never
   * more than six times.
   */
  it("as needed with a ceiling stops at the ceiling", () => {
    const capped = plan("simeticon", null, 6);
    const entries = Array.from({ length: 5 }, (_, i) =>
      dose(`d${i}`, `2026-08-15T0${i}:00:00.000Z`, "simeticon"),
    );
    expect(dayQuotaUsed(entries, TZ, "2026-08-15", capped)).toBe(false);
    entries.push(dose("d5", "2026-08-15T19:00:00.000Z", "simeticon"));
    expect(dayQuotaUsed(entries, TZ, "2026-08-15", capped)).toBe(true);
  });

  /**
   * Three planned, four permitted: the fourth must not be refused. The ceiling is the
   * harder boundary, so it is the one that decides — the plan only says what should
   * happen.
   */
  it("the ceiling wins over the planned number, not the other way round", () => {
    const both = plan("paracetamol", 3, 4);
    expect(dailyCap(both)).toBe(4);

    const entries = Array.from({ length: 3 }, (_, i) =>
      dose(`d${i}`, `2026-08-15T0${i}:00:00.000Z`, "paracetamol"),
    );
    expect(dayQuotaUsed(entries, TZ, "2026-08-15", both)).toBe(false);
    entries.push(dose("d3", "2026-08-15T20:00:00.000Z", "paracetamol"));
    expect(dayQuotaUsed(entries, TZ, "2026-08-15", both)).toBe(true);
  });

  it("without a ceiling the planned number still stops it", () => {
    expect(dailyCap(plan("vitamin-d", 1))).toBe(1);
    expect(dailyCap(plan("simeticon", null))).toBeNull();
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
