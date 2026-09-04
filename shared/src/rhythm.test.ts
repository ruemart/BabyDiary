import { describe, expect, it } from "vitest";
import { predictNext, type RhythmEvent } from "./rhythm.ts";

/**
 * The estimate behind both the bottle reminder and the "next expected" line on the home
 * screen. Its failure modes are quiet ones: an estimate that is systematically late, or
 * one built from a correction that was never a rhythm.
 */

/** Events every `gapHours` apart, newest last. */
function every(gapHours: number, count: number, from = "2026-08-16T00:00:00.000Z"): RhythmEvent[] {
  const start = Date.parse(from);
  return Array.from({ length: count }, (_, i) => ({
    id: `e${i}`,
    startedAt: new Date(start + i * gapHours * 3_600_000).toISOString(),
  }));
}

describe("The next one, from the child's own rhythm", () => {
  it("expects the next after the usual gap", () => {
    const rhythm = predictNext(every(3, 6))!;

    expect(rhythm.typicalGapMinutes).toBe(180);
    expect(rhythm.lastId).toBe("e5");
    expect(new Date(rhythm.dueAt).toISOString()).toBe("2026-08-16T18:00:00.000Z");
  });

  it("takes the order it is handed and sorts it itself", () => {
    const ordered = predictNext(every(3, 6))!;
    const shuffled = predictNext([...every(3, 6)].reverse())!;

    expect(shuffled.dueAt).toBe(ordered.dueAt);
    expect(shuffled.lastId).toBe(ordered.lastId);
  });

  /**
   * The reason it is a median. One long night among short days must not push every
   * following estimate late — with a mean, these gaps would come out at 3 h 40.
   */
  it("is not dragged along by one long night", () => {
    const events = [
      { id: "a", startedAt: "2026-08-15T20:00:00.000Z" },
      { id: "b", startedAt: "2026-08-15T23:00:00.000Z" },
      // Eight hours of sleep.
      { id: "c", startedAt: "2026-08-16T07:00:00.000Z" },
      { id: "d", startedAt: "2026-08-16T10:00:00.000Z" },
      { id: "e", startedAt: "2026-08-16T13:00:00.000Z" },
      { id: "f", startedAt: "2026-08-16T16:00:00.000Z" },
    ];
    expect(predictNext(events)!.typicalGapMinutes).toBe(180);
  });

  /** A second tap, or both parents recording the same bottle. Not a rhythm. */
  it("ignores two entries a minute apart", () => {
    const events = [
      ...every(3, 5),
      { id: "double", startedAt: "2026-08-16T12:01:00.000Z" },
    ];
    expect(predictNext(events)!.typicalGapMinutes).toBe(180);
  });

  it("says nothing when there is not enough to go on", () => {
    expect(predictNext([])).toBeNull();
    expect(predictNext(every(3, 4))).toBeNull();
    // Five events, but four of them within a quarter of an hour: no usable gaps.
    const clustered = [
      { id: "a", startedAt: "2026-08-16T08:00:00.000Z" },
      { id: "b", startedAt: "2026-08-16T08:05:00.000Z" },
      { id: "c", startedAt: "2026-08-16T08:10:00.000Z" },
      { id: "d", startedAt: "2026-08-16T08:12:00.000Z" },
      { id: "e", startedAt: "2026-08-16T08:14:00.000Z" },
    ];
    expect(predictNext(clustered)).toBeNull();
  });

  /** A rhythm from three weeks ago describes a different child. */
  it("looks only at the recent ones", () => {
    const old = every(6, 8, "2026-07-01T00:00:00.000Z");
    const recent = every(3, 8, "2026-08-16T00:00:00.000Z");
    expect(predictNext([...old, ...recent])!.typicalGapMinutes).toBe(180);
  });

  it("can be asked to look further back", () => {
    expect(predictNext(every(3, 30), { window: 30 })!.typicalGapMinutes).toBe(180);
  });
});
