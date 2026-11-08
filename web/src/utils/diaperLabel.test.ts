import { describe, expect, it } from "vitest";
import { diaperKey } from "./diaperLabel.ts";

/**
 * This mapping lived in two views as identical copies and was about to be written a
 * third time. What it has to keep doing is reading the legacy fourth kind as soiled.
 */
describe("Which message names a nappy kind", () => {
  it("names the three kinds the app records", () => {
    expect(diaperKey("empty")).toBe("diaper.empty");
    expect(diaperKey("wet")).toBe("diaper.wet");
    expect(diaperKey("soiled")).toBe("diaper.soiled");
  });

  /** Nothing writes "both" any more, but old entries carry it. */
  it("reads the legacy kind as soiled", () => {
    expect(diaperKey("both")).toBe("diaper.soiled");
  });

  it("falls back rather than showing a raw key", () => {
    expect(diaperKey(null)).toBe("diaper.empty");
    expect(diaperKey("something-else")).toBe("diaper.empty");
  });
});
