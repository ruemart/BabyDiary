import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStats } from "./useStats.ts";
import type { LocalEntry } from "../db/local.ts";

/**
 * The gap chart is read for its slope, so what it must get right is which day a gap
 * belongs to and what a single forgotten bottle does to the line.
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
  it("measures the gap between consecutive bottles in minutes", () => {
    const result = gaps([
      feed("2026-08-08T06:00:00.000Z"),
      feed("2026-08-08T09:00:00.000Z"),
      feed("2026-08-08T13:00:00.000Z"),
    ]);
    const day = result.days.find((d) => d.day === "2026-08-08")!;
    // Three hours and four hours — the median of the two is three and a half.
    expect(day.typicalMinutes).toBe(210);
    expect(day.longestMinutes).toBe(240);
    expect(day.gaps).toBe(2);
  });

  /**
   * The night stretch starts in the evening and ends the next morning. Filed under the
   * day it ends, every night would land on the following morning and the picture would
   * sit a day to the right.
   */
  it("files a gap on the day it starts, not the day it ends", () => {
    const result = gaps([
      feed("2026-08-08T20:00:00.000Z"),
      feed("2026-08-09T03:00:00.000Z"),
      feed("2026-08-09T07:00:00.000Z"),
    ]);
    expect(result.days.find((d) => d.day === "2026-08-08")!.longestMinutes).toBe(420);
    expect(result.days.find((d) => d.day === "2026-08-09")!.longestMinutes).toBe(240);
  });

  /** A second tap, or both parents recording the same bottle. */
  it("ignores two entries within a quarter of an hour", () => {
    const result = gaps([
      feed("2026-08-08T06:00:00.000Z"),
      feed("2026-08-08T06:05:00.000Z"),
      feed("2026-08-08T09:00:00.000Z"),
    ]);
    const day = result.days.find((d) => d.day === "2026-08-08")!;
    expect(day.gaps).toBe(1);
    expect(day.typicalMinutes).toBe(175);
  });

  it("starts at the first bottle ever and runs to today without holes", () => {
    const result = gaps([
      feed("2026-08-01T06:00:00.000Z"),
      feed("2026-08-01T09:00:00.000Z"),
      feed("2026-08-09T06:00:00.000Z"),
      feed("2026-08-09T09:00:00.000Z"),
    ]);
    expect(result.firstDay).toBe("2026-08-01");
    expect(result.days[0]!.day).toBe("2026-08-01");
    expect(result.days[result.days.length - 1]!.day).toBe("2026-08-10");
    // A day nobody recorded is a hole in the line, not a day that closes up.
    expect(result.days.find((d) => d.day === "2026-08-05")!.typicalMinutes).toBeNull();
  });

  /**
   * The reason both lines are medians: one forgotten bottle turns two three-hour gaps
   * into one of six, and a mean would carry that for a week.
   */
  it("does not let one forgotten bottle bend the trend", () => {
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
    expect(result.days.find((d) => d.day === "2026-08-05")!.longestMinutes).toBe(360);
    // The trend stays on the real rhythm of three hours.
    expect(result.days.find((d) => d.day === "2026-08-09")!.trendTypical).toBe(180);
  });

  it("says nothing at all when there are no bottles", () => {
    const result = gaps([]);
    expect(result.days).toEqual([]);
    expect(result.firstDay).toBeNull();
    expect(result.typicalNow).toBeNull();
  });
});
