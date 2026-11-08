import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStats } from "./useStats.ts";
import type { LocalEntry } from "../db/local.ts";

/**
 * The gap chart is read for its slope, so what it must get right is which week a gap
 * belongs to and what a single forgotten bottle does to a bar.
 */
const TZ = "Europe/Berlin";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-10T12:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

const feed = (startedAt: string): LocalEntry =>
  ({ id: startedAt, type: "feed", startedAt, amountMl: 120 }) as LocalEntry;

const gaps = (entries: LocalEntry[]) =>
  useStats(() => entries, () => TZ, 30).feedGaps.value;

describe("How far apart the bottles stand", () => {
  it("takes the median of the week's gaps, in minutes", () => {
    const result = gaps([
      feed("2026-08-08T06:00:00.000Z"),
      feed("2026-08-08T09:00:00.000Z"),
      feed("2026-08-08T13:00:00.000Z"),
    ]);
    // Three hours and four hours — the median of the two is three and a half.
    expect(result.weeks[0]!.typicalMinutes).toBe(210);
    expect(result.weeks[0]!.gaps).toBe(2);
    expect(result.longestEver).toBe(240);
  });

  /**
   * The night stretch starts in the evening and ends the next morning. Filed under the
   * day it ends, it would be dated a day late — and across a week boundary it would
   * land in the wrong bar altogether.
   */
  it("files a gap on the day it starts, not the day it ends", () => {
    const entries: LocalEntry[] = [];
    // A week of bottles at 03:00, 06:00 ... 22:00 local, so no gap runs over five hours.
    for (let d = 1; d <= 7; d++) {
      for (const hour of [1, 4, 7, 10, 13, 16, 20]) {
        entries.push(feed(`2026-08-0${d}T${String(hour).padStart(2, "0")}:00:00.000Z`));
      }
    }
    // Then one long night: 22:00 on the 7th to 05:00 on the 8th.
    entries.push(feed("2026-08-08T03:00:00.000Z"));

    const result = gaps(entries);
    expect(result.longestEver).toBe(420);
    expect(result.longestEverDay).toBe("2026-08-07");
    // The 7th is the last day of the first seven-day bucket, so that night counts
    // there — not in the bucket its morning belongs to.
    expect(result.weeks).toHaveLength(2);
    expect(result.weeks[1]!.gaps).toBe(0);
  });

  /** A second tap, or both parents recording the same bottle. */
  it("ignores two entries within a quarter of an hour", () => {
    const result = gaps([
      feed("2026-08-08T06:00:00.000Z"),
      feed("2026-08-08T06:05:00.000Z"),
      feed("2026-08-08T09:00:00.000Z"),
    ]);
    expect(result.weeks[0]!.gaps).toBe(1);
    expect(result.weeks[0]!.typicalMinutes).toBe(175);
  });

  it("runs in seven-day buckets from the first bottle to today, without holes", () => {
    const result = gaps([
      feed("2026-07-20T06:00:00.000Z"),
      feed("2026-07-20T09:00:00.000Z"),
      feed("2026-08-09T06:00:00.000Z"),
      feed("2026-08-09T09:00:00.000Z"),
    ]);
    expect(result.firstDay).toBe("2026-07-20");
    expect(result.weeks.map((w) => w.start)).toEqual([
      "2026-07-20",
      "2026-07-27",
      "2026-08-03",
      "2026-08-10",
    ]);
    // A week nobody recorded is an empty slot, not a week that closes up.
    expect(result.weeks[1]!.typicalMinutes).toBeNull();
    expect(result.weeks[2]!.typicalMinutes).toBe(180);
    // Today's bucket exists even though its first gap has not happened yet.
    expect(result.weeks[3]!.gaps).toBe(0);
  });

  /** The sentence under the chart quotes the first bar and the last one with data. */
  it("reads the start and the current rhythm off the bars", () => {
    const entries: LocalEntry[] = [];
    // Week one: every three hours. Three weeks later: every four.
    for (let hour = 6; hour <= 18; hour += 3) {
      entries.push(feed(`2026-07-20T${String(hour).padStart(2, "0")}:00:00.000Z`));
    }
    for (let hour = 6; hour <= 18; hour += 4) {
      entries.push(feed(`2026-08-09T${String(hour).padStart(2, "0")}:00:00.000Z`));
    }
    const result = gaps(entries);
    expect(result.typicalStart).toBe(180);
    expect(result.typicalNow).toBe(240);
  });

  /**
   * The reason a bar is a median: one forgotten bottle turns two three-hour gaps into
   * one of six, and a mean would carry that for the whole week.
   */
  it("does not let one forgotten bottle bend a bar", () => {
    // Every three hours round the clock, so the only unusual gap is the made-up one.
    const entries: LocalEntry[] = [];
    for (let d = 1; d <= 9; d++) {
      const day = `2026-08-${String(d).padStart(2, "0")}`;
      for (let hour = 0; hour < 24; hour += 3) {
        // On the 5th the midday bottle is missing — one six-hour gap instead of two.
        if (day === "2026-08-05" && hour === 12) continue;
        entries.push(feed(`${day}T${String(hour).padStart(2, "0")}:00:00.000Z`));
      }
    }
    const result = gaps(entries);
    expect(result.longestEver).toBe(360);
    // The bar stays on the real rhythm of three hours.
    expect(result.weeks[0]!.typicalMinutes).toBe(180);
  });

  it("says nothing at all when there are no bottles", () => {
    const result = gaps([]);
    expect(result.weeks).toEqual([]);
    expect(result.firstDay).toBeNull();
    expect(result.typicalNow).toBeNull();
  });
});
