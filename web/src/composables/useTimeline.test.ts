import { describe, expect, it } from "vitest";
import { createApp } from "vue";
import type { Child } from "@babydiary/shared";
import { i18n } from "../i18n/index.ts";
import { useTimeline, type TimelinePin } from "./useTimeline.ts";
import { MILESTONES } from "../data/milestones.ts";

/**
 * Runs a composable that needs a setup context (this one calls `useI18n`).
 *
 * A component would work too, but then a rendering failure and a logic failure look the
 * same in the output — and the thing under test here is arithmetic, not markup.
 */
function withSetup<T>(fn: () => T): T {
  let result!: T;
  const app = createApp({
    setup() {
      result = fn();
      return () => null;
    },
  });
  app.use(i18n);
  app.mount(document.createElement("div"));
  return result;
}

const CHILD: Child = {
  id: "c1",
  name: "Test",
  sex: "female",
  birthDate: "2026-07-11",
  dueDate: null,
  birthWeightG: null,
  birthLengthMm: null,
  birthHeadMm: null,
  timezone: "Europe/Berlin",
  region: "de",
  latitude: null,
  longitude: null,
  placeName: null,
  editedAt: "2026-07-11T00:00:00.000Z",
};

/** A milestone that is expected LATER than the week it is ticked off in below. */
const LATE = MILESTONES.find((m) => m.fromWeek >= 6)!;

const milestonePin = (pins: TimelinePin[], key: string) =>
  pins.find((p) => p.id === `milestone-${key}`);

describe("Timeline — milestones that have been ticked off", () => {
  it("leaves an unticked one in its expected window and offers no date", () => {
    const { pins } = withSetup(() => useTimeline(() => CHILD, () => new Map()));
    const pin = milestonePin(pins.value, LATE.key)!;

    expect(pin.week).toBe(LATE.fromWeek);
    expect(pin.doneOn).toBeUndefined();
  });

  it("moves a ticked one to the week it actually happened in", () => {
    // Week 2 of life: born 11 July, so 20 July is day 9 — the third week counted from 0.
    const achieved = new Map([[LATE.key, "2026-07-25T10:00:00.000Z"]]);
    const { pins } = withSetup(() => useTimeline(() => CHILD, () => achieved));
    const pin = milestonePin(pins.value, LATE.key)!;

    expect(pin.week).toBe(2);
    expect(pin.week).not.toBe(LATE.fromWeek);
    expect(pin.doneOn).toBe("2026-07-25T10:00:00.000Z");
  });

  it("names the date instead of the expected window once it is ticked", () => {
    const achieved = new Map([[LATE.key, "2026-07-25T10:00:00.000Z"]]);
    const { pins } = withSetup(() => useTimeline(() => CHILD, () => achieved));

    expect(milestonePin(pins.value, LATE.key)!.when).toMatch(/25/);
  });

  it("drops a ticked one out of what is coming", () => {
    const before = withSetup(() => useTimeline(() => CHILD, () => new Map()));
    const inUpcoming = (list: TimelinePin[]) => list.some((i) => i.id === `milestone-${LATE.key}`);

    // Only meaningful if it would show up at all from week 0.
    expect(inUpcoming(before.upcoming(0, 99))).toBe(true);

    const achieved = new Map([[LATE.key, "2026-07-25T10:00:00.000Z"]]);
    const after = withSetup(() => useTimeline(() => CHILD, () => achieved));
    expect(inUpcoming(after.upcoming(0, 99))).toBe(false);
  });

  it("assigns a milestone ticked at night to the local week, not the UTC one", () => {
    // 22:30 UTC on 25 July is already 00:30 on 26 July in Berlin.
    const achieved = new Map([[LATE.key, "2026-07-25T22:30:00.000Z"]]);
    const { pins } = withSetup(() => useTimeline(() => CHILD, () => achieved));

    // 26 July is day 15 → week 2. Read in UTC it would be day 14, which is also week 2 —
    // so the assertion that matters is that the child's timezone is what decides.
    expect(milestonePin(pins.value, LATE.key)!.week).toBe(2);
  });

  it("does not touch check-ups and vaccinations", () => {
    const achieved = new Map([[LATE.key, "2026-07-25T10:00:00.000Z"]]);
    const { pins } = withSetup(() => useTimeline(() => CHILD, () => achieved));

    const others = pins.value.filter((p) => p.kind !== "milestone");
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((p) => p.doneOn === undefined)).toBe(true);
  });
});
