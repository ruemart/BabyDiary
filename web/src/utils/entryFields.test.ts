import { describe, expect, it } from "vitest";
import type { EntryType } from "@babydiary/shared";
import { entryFields, PERIOD_TYPES, type EntryForm } from "./entryFields.ts";

/** A filled-in form. Each test changes only what it is about. */
const form = (over: Partial<EntryForm> = {}): EntryForm => ({
  type: "feed",
  amountMl: 120,
  spatUp: true,
  vitaminD: true,
  colicDrops: true,
  diaper: "soiled",
  medicineId: "medplan-vitamin-d",
  medicineName: "Vitamin D",
  medicineAmount: 1,
  medicineUnit: "drops",
  withEntryId: "feed-1",
  hasEnd: false,
  endAt: new Date("2026-08-08T10:30:00.000Z"),
  temperatureDc: 385,
  place: { latitude: 52.5, longitude: 13.4, placeName: "Berlin" },
  weightG: 4200,
  lengthMm: 540,
  headMm: 380,
  label: "  Erkältung  ",
  note: "  hat gut getrunken  ",
  ...over,
});

describe("What an entry keeps, by type", () => {
  /**
   * The one that was broken: the drops were saved when recording a bottle straight away
   * and silently dropped when adding one afterwards or correcting one. Every flag a feed
   * carries is checked here, so the next one added cannot go missing in the same way.
   */
  it("a feed keeps all three of its ticks", () => {
    expect(entryFields(form())).toMatchObject({
      amountMl: 120,
      spatUp: true,
      vitaminD: true,
      colicDrops: true,
    });
  });

  it("a feed's ticks can be taken off again", () => {
    expect(
      entryFields(form({ spatUp: false, vitaminD: false, colicDrops: false })),
    ).toMatchObject({ spatUp: false, vitaminD: false, colicDrops: false });
  });

  /**
   * A bottle corrected into a nappy must not keep its millilitres — the sheet is one form
   * for seven kinds of thing, and switching the type is the normal way to fix a slip.
   */
  it("everything belonging to another type is cleared", () => {
    expect(entryFields(form({ type: "diaper" }))).toMatchObject({
      diaper: "soiled",
      amountMl: null,
      spatUp: false,
      vitaminD: false,
      colicDrops: false,
      weightG: null,
      temperatureDc: null,
      label: null,
      medicineId: null,
      medicineAmount: null,
      medicineUnit: null,
      withEntryId: null,
    });
  });

  /**
   * The dose is a snapshot: which medicine, how much, and the feed it went into. The
   * name comes along because the medicine can later be taken off the list, and a history
   * that then reads "medicine" without saying which one would be worthless.
   */
  it("a dose keeps the medicine, the amount and the feed it belongs to", () => {
    expect(entryFields(form({ type: "medicine" }))).toMatchObject({
      medicineId: "medplan-vitamin-d",
      medicineAmount: 1,
      medicineUnit: "drops",
      withEntryId: "feed-1",
      label: "Vitamin D",
      amountMl: null,
      diaper: null,
    });
  });

  it("a dose without a stated amount stays without one", () => {
    expect(entryFields(form({ type: "medicine", medicineAmount: null })).medicineAmount).toBeNull();
  });

  it("a growth entry keeps its measurements and nothing else", () => {
    expect(entryFields(form({ type: "growth" }))).toMatchObject({
      weightG: 4200,
      lengthMm: 540,
      headMm: 380,
      amountMl: null,
      diaper: null,
    });
  });

  it("an illness keeps the temperature and the name, trimmed", () => {
    expect(entryFields(form({ type: "illness" }))).toMatchObject({
      temperatureDc: 385,
      label: "Erkältung",
      latitude: null,
      longitude: null,
    });
  });

  it("an absence keeps the place, an illness does not", () => {
    expect(entryFields(form({ type: "absence" }))).toMatchObject({
      latitude: 52.5,
      longitude: 13.4,
      placeName: "Berlin",
      temperatureDc: null,
    });
    expect(entryFields(form({ type: "illness" }))).toMatchObject({ placeName: null });
  });

  /** Without an end a period counts as running — the normal case when recording one. */
  it("a period only gets an end once one is ticked", () => {
    expect(entryFields(form({ type: "sleep", hasEnd: false })).endedAt).toBeNull();
    expect(entryFields(form({ type: "sleep", hasEnd: true })).endedAt).toBe(
      "2026-08-08T10:30:00.000Z",
    );
  });

  it("a type without an end never gets one, even when the tick is on", () => {
    for (const type of ["feed", "diaper", "growth", "note", "bath"] as EntryType[]) {
      expect(PERIOD_TYPES.has(type)).toBe(false);
      expect(entryFields(form({ type, hasEnd: true })).endedAt).toBeNull();
    }
  });

  it("an empty note becomes nothing rather than an empty string", () => {
    expect(entryFields(form({ note: "   " })).note).toBeNull();
    expect(entryFields(form({ note: " kurz " })).note).toBe("kurz");
  });
});
