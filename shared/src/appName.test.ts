import { describe, expect, it } from "vitest";
import { appName, GENERIC_APP_NAME } from "./appName.ts";

describe("What the app calls itself", () => {
  it("is the child's name", () => {
    expect(appName("Robin")).toBe("Robin");
  });

  it("falls back to the generic name before a child exists", () => {
    expect(appName(null)).toBe(GENERIC_APP_NAME);
    expect(appName(undefined)).toBe(GENERIC_APP_NAME);
    expect(appName("")).toBe(GENERIC_APP_NAME);
    // A name of nothing but spaces would otherwise leave a blank home-screen label.
    expect(appName("   ")).toBe(GENERIC_APP_NAME);
  });

  it("trims, so a stray space does not shift the label", () => {
    expect(appName("  Robin  ")).toBe("Robin");
  });

  it("leaves a long name alone — the system shortens labels better than we can", () => {
    expect(appName("Maximilian Alexander Friedrich")).toBe("Maximilian Alexander Friedrich");
  });
});
