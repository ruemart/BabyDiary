import { describe, expect, it } from "vitest";
import { vitaminHolderOn } from "./useVitaminD.ts";
import type { LocalEntry } from "../db/local.ts";

const TZ = "Europe/Berlin";

function feed(id: string, startedAt: string, vitaminD = false): LocalEntry {
  return { id, type: "feed", startedAt, vitaminD } as LocalEntry;
}

describe("Vitamin D — which feed does it hang off", () => {
  it("finds the feed of the day it is recorded on", () => {
    const entries = [feed("a", "2026-08-05T06:00:00.000Z"), feed("b", "2026-08-05T12:00:00.000Z", true)];
    expect(vitaminHolderOn(entries, TZ, "2026-08-05")?.id).toBe("b");
  });

  it("keeps days apart — set yesterday does not lock today", () => {
    const entries = [feed("yesterday", "2026-08-04T12:00:00.000Z", true)];
    expect(vitaminHolderOn(entries, TZ, "2026-08-05")).toBeUndefined();
    expect(vitaminHolderOn(entries, TZ, "2026-08-04")?.id).toBe("yesterday");
  });

  it("assigns a night feed to the local day, not the UTC day", () => {
    // 00:30 Berlin summer time is 22:30 UTC of the PREVIOUS day.
    const entries = [feed("at-night", "2026-08-04T22:30:00.000Z", true)];
    expect(vitaminHolderOn(entries, TZ, "2026-08-05")?.id).toBe("at-night");
  });

  it("ignores feeds without the flag and other entry types", () => {
    const entries = [
      feed("without", "2026-08-05T06:00:00.000Z"),
      { id: "nappy", type: "diaper", startedAt: "2026-08-05T07:00:00.000Z", vitaminD: true } as LocalEntry,
    ];
    expect(vitaminHolderOn(entries, TZ, "2026-08-05")).toBeUndefined();
  });
});
