import { describe, expect, it } from "vitest";
import type { EntryType } from "@babymonitor/shared";
import { numberWithinDay } from "./dayOrdinals.ts";

/** A day the way the list shows it: chronological, oldest first. */
function day(...types: EntryType[]) {
  return types.map((type, i) => ({ id: `e${i}`, type }));
}

describe("Numbering within a day", () => {
  it("counts each kind separately and from the start of the day", () => {
    // Chronologisch: Flasche, Windel, Flasche, Flasche
    const ordinals = numberWithinDay(day("feed", "diaper", "feed", "feed"));

    // The OLDEST bottle is the first of the day.
    expect(ordinals.get("e0")).toBe(1);
    expect(ordinals.get("e2")).toBe(2);
    expect(ordinals.get("e3")).toBe(3);
    // Nappies are counted separately.
    expect(ordinals.get("e1")).toBe(1);
  });

  it("leaves existing numbers alone when an entry is added", () => {
    const before = numberWithinDay(day("feed", "feed"));
    // A new bottle is added at the end — the old ids keep their numbers.
    const after = numberWithinDay([...day("feed", "feed"), { id: "neu", type: "feed" as EntryType }]);

    for (const [id, n] of before) expect(after.get(id)).toBe(n);
    expect(after.get("neu")).toBe(3);
  });

  it("does not number kinds where a running number says nothing", () => {
    const ordinals = numberWithinDay(day("growth", "milestone", "bath", "photo", "sleep"));
    expect(ordinals.size).toBe(0);
  });

  it("copes with an empty day", () => {
    expect(numberWithinDay([]).size).toBe(0);
  });
});
