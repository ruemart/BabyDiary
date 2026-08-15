import { describe, expect, it } from "vitest";
import { planDoseChanges, type DoseState } from "./feedDoses.ts";

const AT = "2026-08-15T06:00:00.000Z";
const EARLIER = "2026-08-15T03:00:00.000Z";

const dose = (id: string, medicineId: string, startedAt = AT): DoseState => ({
  id,
  medicineId,
  startedAt,
});

describe("What a feed's doses have to do when it is saved", () => {
  it("a newly ticked medicine gets a dose", () => {
    expect(planDoseChanges([], ["vitamin-d"], AT)).toEqual({
      remove: [],
      move: [],
      create: ["vitamin-d"],
    });
  });

  it("an unticked one loses its dose", () => {
    expect(planDoseChanges([dose("d1", "vitamin-d")], [], AT)).toMatchObject({
      remove: ["d1"],
      create: [],
    });
  });

  it("a tick left alone changes nothing", () => {
    expect(planDoseChanges([dose("d1", "vitamin-d")], ["vitamin-d"], AT)).toEqual({
      remove: [],
      move: [],
      create: [],
    });
  });

  /**
   * The case nobody thinks to try by hand: correcting the time of a feed. Without this
   * the drops stay behind at three in the morning while the bottle moves to half past
   * two — and the medicine chart then reports a dose on a day it may not even belong to.
   */
  it("a dose follows the feed when its time is corrected", () => {
    expect(planDoseChanges([dose("d1", "vitamin-d", EARLIER)], ["vitamin-d"], AT)).toMatchObject({
      move: [{ id: "d1", startedAt: AT }],
      remove: [],
      create: [],
    });
  });

  it("several medicines on one bottle are handled independently", () => {
    const existing = [dose("d1", "vitamin-d", EARLIER), dose("d2", "simeticon", EARLIER)];
    expect(planDoseChanges(existing, ["simeticon", "bigaia"], AT)).toEqual({
      remove: ["d1"],
      move: [{ id: "d2", startedAt: AT }],
      create: ["bigaia"],
    });
  });

  /** A dose whose medicine reference is somehow missing cannot be matched to a tick. */
  it("a dose without a medicine is taken off rather than kept", () => {
    expect(planDoseChanges([dose("d1", null as unknown as string)], ["vitamin-d"], AT)).toMatchObject({
      remove: ["d1"],
      create: ["vitamin-d"],
    });
  });
});
