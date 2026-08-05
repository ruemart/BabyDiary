import { describe, expect, it } from "vitest";
import { DIAPER_GUARD_MS, classifyDiaperTap } from "./diaperGuard.ts";

const NOW = Date.parse("2026-08-04T22:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("Double-tap guard for nappies", () => {
  it("creates without a previous entry", () => {
    expect(classifyDiaperTap(undefined, "wet", NOW)).toEqual({ action: "create" });
  });

  it("recognises a second tap of the same kind as a slip", () => {
    const recent = { id: "a", startedAt: ago(3_000), diaper: "soiled" };
    expect(classifyDiaperTap(recent, "soiled", NOW)).toEqual({ action: "duplicate", id: "a" });
  });

  it("treats a different kind as a correction, not a second nappy", () => {
    // Tapped "wet", then remembered it was soiled after all.
    const recent = { id: "a", startedAt: ago(20_000), diaper: "wet" };
    expect(classifyDiaperTap(recent, "soiled", NOW)).toEqual({ action: "correct", id: "a" });
  });

  it("creates normally once the window has passed", () => {
    const recent = { id: "a", startedAt: ago(DIAPER_GUARD_MS + 1000), diaper: "wet" };
    expect(classifyDiaperTap(recent, "wet", NOW)).toEqual({ action: "create" });
  });

  it("stops applying exactly at the window boundary", () => {
    const recent = { id: "a", startedAt: ago(DIAPER_GUARD_MS), diaper: "wet" };
    expect(classifyDiaperTap(recent, "wet", NOW)).toEqual({ action: "create" });
  });

  it("does not swallow a real second nappy an hour later", () => {
    // The case that would make the guard dangerous: if it reached too far, entries
    // would be missing from the charts without anyone noticing.
    const recent = { id: "a", startedAt: ago(60 * 60 * 1000), diaper: "soiled" };
    expect(classifyDiaperTap(recent, "soiled", NOW)).toEqual({ action: "create" });
  });
});
