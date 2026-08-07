import type { Entry, EntryType } from "@milo/shared";

/**
 * Which fields an entry carries, decided by its type.
 *
 * One sheet records seven kinds of thing, and the same form fields mean nothing at all
 * for most of them: an amount belongs to a feed, a temperature to an illness. What gets
 * saved is therefore not "whatever is in the form" but the fields the chosen type owns —
 * everything else is cleared. That clearing is what makes the sheet safe to switch types
 * in, and safe to EDIT with: a bottle corrected into a nappy must not keep its millilitres.
 *
 * This lives outside the sheet because it was maintained by hand inside it, and hand
 * maintenance is exactly how it broke. The anti-colic drops were added to the schema, the
 * API, the migration, the quick bottle sheet and the history — and forgotten in this one
 * list. The tick then worked when recording a bottle straight away and quietly did
 * nothing when adding one afterwards or correcting one, which is the harder failure to
 * notice: nothing goes wrong, something simply is not there.
 */
export const PERIOD_TYPES = new Set<EntryType>(["sleep", "illness", "absence"]);

/** What the sheet holds, in plain values — the same shape whether creating or editing. */
export type EntryForm = {
  type: EntryType;
  amountMl: number;
  spatUp: boolean;
  vitaminD: boolean;
  colicDrops: boolean;
  diaper: "empty" | "wet" | "soiled";
  /** A period without an end counts as running; see the sheet. */
  hasEnd: boolean;
  endAt: Date;
  temperatureDc: number | null;
  place: { latitude: number; longitude: number; placeName: string } | null;
  weightG: number | null;
  lengthMm: number | null;
  headMm: number | null;
  label: string;
  note: string;
};

/** The type-dependent fields — identical when creating and when editing. */
export function entryFields(form: EntryForm): Partial<Entry> {
  const isFeed = form.type === "feed";
  const isPeriod = PERIOD_TYPES.has(form.type);
  const isNamed = form.type === "illness" || form.type === "absence";

  return {
    amountMl: isFeed ? form.amountMl : null,
    spatUp: isFeed ? form.spatUp : false,
    vitaminD: isFeed ? form.vitaminD : false,
    colicDrops: isFeed ? form.colicDrops : false,
    diaper: form.type === "diaper" ? form.diaper : null,
    endedAt: isPeriod && form.hasEnd ? form.endAt.toISOString() : null,
    temperatureDc: form.type === "illness" ? form.temperatureDc : null,
    latitude: form.type === "absence" ? (form.place?.latitude ?? null) : null,
    longitude: form.type === "absence" ? (form.place?.longitude ?? null) : null,
    placeName: form.type === "absence" ? (form.place?.placeName ?? null) : null,
    weightG: form.type === "growth" ? form.weightG : null,
    lengthMm: form.type === "growth" ? form.lengthMm : null,
    headMm: form.type === "growth" ? form.headMm : null,
    label: isNamed ? form.label.trim() : null,
    note: form.note.trim() || null,
  };
}
