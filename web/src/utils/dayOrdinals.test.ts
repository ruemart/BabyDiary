import { describe, expect, it } from "vitest";
import type { EntryType } from "@babymonitor/shared";
import { numberWithinDay } from "./dayOrdinals.ts";

/** Ein Tag, wie die Liste ihn zeigt: chronologisch, älteste zuerst. */
function day(...types: EntryType[]) {
  return types.map((type, i) => ({ id: `e${i}`, type }));
}

describe("Nummerierung innerhalb eines Tages", () => {
  it("zählt jede Art getrennt und vom Tagesanfang an", () => {
    // Chronologisch: Flasche, Windel, Flasche, Flasche
    const ordinals = numberWithinDay(day("feed", "diaper", "feed", "feed"));

    // Die ÄLTESTE Flasche ist die erste des Tages.
    expect(ordinals.get("e0")).toBe(1);
    expect(ordinals.get("e2")).toBe(2);
    expect(ordinals.get("e3")).toBe(3);
    // Windeln zählen eigenständig.
    expect(ordinals.get("e1")).toBe(1);
  });

  it("lässt bestehende Nummern in Ruhe, wenn ein Eintrag dazukommt", () => {
    const before = numberWithinDay(day("feed", "feed"));
    // Eine neue Flasche kommt hinten dazu — die alten Ids behalten ihre Nummer.
    const after = numberWithinDay([...day("feed", "feed"), { id: "neu", type: "feed" as EntryType }]);

    for (const [id, n] of before) expect(after.get(id)).toBe(n);
    expect(after.get("neu")).toBe(3);
  });

  it("nummeriert Arten nicht, bei denen eine laufende Nummer nichts aussagt", () => {
    const ordinals = numberWithinDay(day("growth", "milestone", "bath", "photo", "sleep"));
    expect(ordinals.size).toBe(0);
  });

  it("kommt mit einem leeren Tag zurecht", () => {
    expect(numberWithinDay([]).size).toBe(0);
  });
});
