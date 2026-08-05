import { describe, expect, it } from "vitest";
import { vitaminHolderOn } from "./useVitaminD.ts";
import type { LocalEntry } from "../db/local.ts";

const TZ = "Europe/Berlin";

function feed(id: string, startedAt: string, vitaminD = false): LocalEntry {
  return { id, type: "feed", startedAt, vitaminD } as LocalEntry;
}

describe("Vitamin D — an welcher Mahlzeit hängt es", () => {
  it("findet die Mahlzeit des Tages, an der es vermerkt ist", () => {
    const entries = [feed("a", "2026-08-05T06:00:00.000Z"), feed("b", "2026-08-05T12:00:00.000Z", true)];
    expect(vitaminHolderOn(entries, TZ, "2026-08-05")?.id).toBe("b");
  });

  it("hält Tage auseinander — gestern gesetzt sperrt heute nicht", () => {
    const entries = [feed("gestern", "2026-08-04T12:00:00.000Z", true)];
    expect(vitaminHolderOn(entries, TZ, "2026-08-05")).toBeUndefined();
    expect(vitaminHolderOn(entries, TZ, "2026-08-04")?.id).toBe("gestern");
  });

  it("ordnet eine Nachtmahlzeit dem lokalen Tag zu, nicht dem UTC-Tag", () => {
    // 00:30 Berliner Sommerzeit ist 22:30 UTC des VORTAGS.
    const entries = [feed("nachts", "2026-08-04T22:30:00.000Z", true)];
    expect(vitaminHolderOn(entries, TZ, "2026-08-05")?.id).toBe("nachts");
  });

  it("ignoriert Mahlzeiten ohne Vermerk und andere Eintragsarten", () => {
    const entries = [
      feed("ohne", "2026-08-05T06:00:00.000Z"),
      { id: "windel", type: "diaper", startedAt: "2026-08-05T07:00:00.000Z", vitaminD: true } as LocalEntry,
    ];
    expect(vitaminHolderOn(entries, TZ, "2026-08-05")).toBeUndefined();
  });
});
