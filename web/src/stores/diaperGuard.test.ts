import { describe, expect, it } from "vitest";
import { DIAPER_GUARD_MS, classifyDiaperTap } from "./diaperGuard.ts";

const NOW = Date.parse("2026-08-04T22:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("Doppeltap-Schutz für Windeln", () => {
  it("legt ohne vorherigen Eintrag an", () => {
    expect(classifyDiaperTap(undefined, "wet", NOW)).toEqual({ action: "create" });
  });

  it("erkennt den zweiten Tap auf dieselbe Art als Versehen", () => {
    const recent = { id: "a", startedAt: ago(3_000), diaper: "soiled" };
    expect(classifyDiaperTap(recent, "soiled", NOW)).toEqual({ action: "duplicate", id: "a" });
  });

  it("behandelt eine andere Art als Korrektur, nicht als zweite Windel", () => {
    // "Feucht" getippt, dann gemerkt dass es doch voll war.
    const recent = { id: "a", startedAt: ago(20_000), diaper: "wet" };
    expect(classifyDiaperTap(recent, "soiled", NOW)).toEqual({ action: "correct", id: "a" });
  });

  it("legt nach Ablauf des Fensters normal an", () => {
    const recent = { id: "a", startedAt: ago(DIAPER_GUARD_MS + 1000), diaper: "wet" };
    expect(classifyDiaperTap(recent, "wet", NOW)).toEqual({ action: "create" });
  });

  it("greift exakt an der Fenstergrenze nicht mehr", () => {
    const recent = { id: "a", startedAt: ago(DIAPER_GUARD_MS), diaper: "wet" };
    expect(classifyDiaperTap(recent, "wet", NOW)).toEqual({ action: "create" });
  });

  it("verschluckt keine echte zweite Windel eine Stunde später", () => {
    // Der Fall, der den Schutz gefährlich machen würde: Wenn er zu weit griffe,
    // fehlten Einträge in der Auswertung, ohne dass es jemand bemerkt.
    const recent = { id: "a", startedAt: ago(60 * 60 * 1000), diaper: "soiled" };
    expect(classifyDiaperTap(recent, "soiled", NOW)).toEqual({ action: "create" });
  });
});
