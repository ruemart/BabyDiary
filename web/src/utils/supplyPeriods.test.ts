import { describe, expect, it } from "vitest";
import { localDayKey, setDisplayLocale } from "@babydiary/shared";
import { supplyPeriods } from "./supplyPeriods.ts";

const TZ = "Europe/Berlin";
// Pinned to German: the date notation depends on the display language, and a test that
// comes out differently depending on a preference is testing nothing.
setDisplayLocale("de");
const key = (iso: string) => localDayKey(iso, TZ);
const TODAY = "2026-08-05";

/** Entries arrive newest first — that is how the app supplies them. */
const CHAIN = [
  { startedAt: "2026-07-17T06:00:00.000Z", size: "size 3" },
  { startedAt: "2026-05-02T06:00:00.000Z", size: "size 2" },
  { startedAt: "2026-04-28T06:00:00.000Z", size: "size 1" },
];

describe("Switch history from the chain of entries", () => {
  it("marks only the most recent entry as current", () => {
    const periods = supplyPeriods(CHAIN, key, TODAY);
    expect(periods.map((p) => p.isCurrent)).toEqual([true, false, false]);
  });

  it("lets every entry hold until the next one begins", () => {
    const [current, middle, first] = supplyPeriods(CHAIN, key, TODAY);

    expect(current!.rangeLabel).toBe("seit 17. Juli 2026");
    // 2 May to 17 July — the successor ends the period.
    expect(middle!.rangeLabel).toBe("2. Mai – 17. Juli 2026");
    expect(middle!.days).toBe(76);
    expect(first!.rangeLabel).toBe("28. Apr. – 2. Mai 2026");
    expect(first!.durationLabel).toBe("4 Tage");
  });

  it("counts the current entry up to today", () => {
    const [current] = supplyPeriods(CHAIN, key, TODAY);
    // 17. Juli bis 5. August = 19 Tage.
    expect(current!.days).toBe(19);
    expect(current!.durationLabel).toBe("3 Wochen");
  });

  it("shows no span when switched on the same day", () => {
    const periods = supplyPeriods(
      [{ startedAt: "2026-05-02T15:00:00.000Z" }, { startedAt: "2026-05-02T08:00:00.000Z" }],
      key,
      TODAY,
    );
    expect(periods[1]!.rangeLabel).toBe("2. Mai 2026");
    expect(periods[1]!.durationLabel).toBe("am selben Tag");
  });

  it("assigns a night entry to the local day", () => {
    // 23:30 UTC is already the next day in Berlin.
    const periods = supplyPeriods([{ startedAt: "2026-05-01T23:30:00.000Z" }], key, TODAY);
    expect(periods[0]!.rangeLabel).toBe("seit 2. Mai 2026");
  });

  it("says \"since today\" on the switch day and leaves the duration out", () => {
    const todayEntry = supplyPeriods([{ startedAt: "2026-08-05T09:00:00.000Z" }], key, TODAY);
    expect(todayEntry[0]!.rangeLabel).toBe("seit heute");
    expect(todayEntry[0]!.durationLabel).toBe("");

    const yesterdayEntry = supplyPeriods([{ startedAt: "2026-08-04T09:00:00.000Z" }], key, TODAY);
    expect(yesterdayEntry[0]!.rangeLabel).toBe("seit gestern");
  });

  it("copes with an empty category", () => {
    expect(supplyPeriods([], key, TODAY)).toEqual([]);
  });
});
