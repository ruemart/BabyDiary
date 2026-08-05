import { describe, expect, it } from "vitest";
import { localDayKey, setDisplayLocale } from "@babymonitor/shared";
import { supplyPeriods } from "./supplyPeriods.ts";

const TZ = "Europe/Berlin";
// Pinned to German: the date notation depends on the display language, and a test that
// comes out differently depending on a preference is testing nothing.
setDisplayLocale("de");
const key = (iso: string) => localDayKey(iso, TZ);
const HEUTE = "2026-08-05";

/** Einträge kommen neueste zuerst — so liefert die App sie. */
const KETTE = [
  { startedAt: "2026-07-17T06:00:00.000Z", size: "Größe 3" },
  { startedAt: "2026-05-02T06:00:00.000Z", size: "Größe 2" },
  { startedAt: "2026-04-28T06:00:00.000Z", size: "Größe 1" },
];

describe("Wechsel-Historie aus der Eintragskette", () => {
  it("markiert nur den jüngsten Eintrag als aktuell", () => {
    const periods = supplyPeriods(KETTE, key, HEUTE);
    expect(periods.map((p) => p.isCurrent)).toEqual([true, false, false]);
  });

  it("lässt jeden Stand gelten, bis der nächste beginnt", () => {
    const [aktuell, mittel, erster] = supplyPeriods(KETTE, key, HEUTE);

    expect(aktuell!.rangeLabel).toBe("seit 17. Juli 2026");
    // 2. Mai bis 17. Juli — der Nachfolger beendet den Zeitraum.
    expect(mittel!.rangeLabel).toBe("2. Mai – 17. Juli 2026");
    expect(mittel!.days).toBe(76);
    expect(erster!.rangeLabel).toBe("28. Apr. – 2. Mai 2026");
    expect(erster!.durationLabel).toBe("4 Tage");
  });

  it("zählt den laufenden Stand bis heute", () => {
    const [aktuell] = supplyPeriods(KETTE, key, HEUTE);
    // 17. Juli bis 5. August = 19 Tage.
    expect(aktuell!.days).toBe(19);
    expect(aktuell!.durationLabel).toBe("3 Wochen");
  });

  it("zeigt keine Spanne, wenn am selben Tag gewechselt wurde", () => {
    const periods = supplyPeriods(
      [{ startedAt: "2026-05-02T15:00:00.000Z" }, { startedAt: "2026-05-02T08:00:00.000Z" }],
      key,
      HEUTE,
    );
    expect(periods[1]!.rangeLabel).toBe("2. Mai 2026");
    expect(periods[1]!.durationLabel).toBe("am selben Tag");
  });

  it("ordnet eine Nachtangabe dem lokalen Tag zu", () => {
    // 23:30 UTC is already the next day in Berlin.
    const periods = supplyPeriods([{ startedAt: "2026-05-01T23:30:00.000Z" }], key, HEUTE);
    expect(periods[0]!.rangeLabel).toBe("seit 2. Mai 2026");
  });

  it("sagt am Wechseltag \"seit heute\" und lässt die Dauer weg", () => {
    const heute = supplyPeriods([{ startedAt: "2026-08-05T09:00:00.000Z" }], key, HEUTE);
    expect(heute[0]!.rangeLabel).toBe("seit heute");
    expect(heute[0]!.durationLabel).toBe("");

    const gestern = supplyPeriods([{ startedAt: "2026-08-04T09:00:00.000Z" }], key, HEUTE);
    expect(gestern[0]!.rangeLabel).toBe("seit gestern");
  });

  it("kommt mit einer leeren Kategorie zurecht", () => {
    expect(supplyPeriods([], key, HEUTE)).toEqual([]);
  });
});
