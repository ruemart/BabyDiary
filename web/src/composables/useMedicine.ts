import { computed } from "vue";
import { localDayKey, localTimeLabel, type MedicineUnit } from "@babydiary/shared";
import type { LocalEntry } from "../db/local.ts";

/**
 * What is due today, per medicine.
 *
 * The predecessor of this file asked one question — "has the vitamin D been given
 * today?" — and got it right, for one medicine. The daily dose is exactly the kind of
 * task that gets forgotten because it is so small: no occasion of its own, no feedback,
 * and by the evening nobody is sure any more whether it happened.
 *
 * That question does not become a different one with three medicines, it becomes three
 * of the same. So it is asked once here, per medicine set up, and the home screen shows
 * a line each instead of a card for the one the app happened to know about.
 *
 * The tone stays the same as before: a forgotten day is not an emergency. The app
 * reminds, it does not nag — only from the evening on does the note get clearer, because
 * by then the day really is running out.
 */

export type MedicineStatus = {
  /** The plan entry itself — the sheets need it to record a dose. */
  plan: LocalEntry;
  id: string;
  name: string;
  amount: number | null;
  unit: MedicineUnit | null;
  /** Null = as needed. Only a medicine with a number can fall short of it. */
  timesPerDay: number | null;
  /** The most that may be given in a day, if the household stated one. */
  maxPerDay: number | null;
  givenToday: number;
  /** The day's ceiling is reached — the quick way to record another is closed. */
  atMax: boolean;
  /** More was given than the ceiling allows. Recorded, and said out loud. */
  overMax: boolean;
  /** Time of the most recent dose today, for the line on the home screen. */
  lastAtLabel: string | null;
  /** The dose to take back off again — the newest of the day. */
  lastDoseId: string | null;
  /** Everything for today has been given. Always false while nothing is due. */
  complete: boolean;
  /** Something is still outstanding and the day is running out. */
  urgent: boolean;
};

/** Doses of one medicine on one calendar day, newest first. */
export function dosesOnDay(
  entries: LocalEntry[],
  timezone: string,
  dayKey: string,
  medicineId: string,
): LocalEntry[] {
  return entries
    .filter(
      (e) =>
        e.type === "medicine" &&
        e.medicineId === medicineId &&
        localDayKey(e.startedAt, timezone) === dayKey,
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/**
 * How many doses a day this medicine stops at — the maximum where one is stated,
 * otherwise the planned number.
 *
 * The maximum wins because it is the harder boundary. A medicine with three planned and
 * four permitted must not refuse the fourth; a medicine given as needed has no planned
 * number at all and is bounded only by its maximum. Where neither is set — as needed,
 * no ceiling — nothing bounds it, and the app has nothing to enforce.
 */
export function dailyCap(plan: LocalEntry): number | null {
  return plan.medicineMaxPerDay ?? plan.medicineTimesPerDay;
}

/**
 * Is the day's quota already used up — ignoring what one particular feed carries?
 *
 * This is what locks the tick in the bottle sheet. The exception is what makes it usable
 * while editing: a feed that already carries the dose must be able to give it up again,
 * and without the exception its own dose would be the reason it may not.
 */
export function dayQuotaUsed(
  entries: LocalEntry[],
  timezone: string,
  dayKey: string,
  plan: LocalEntry,
  exceptWithEntryId: string | null = null,
): boolean {
  const cap = dailyCap(plan);
  if (cap === null) return false;
  const given = dosesOnDay(entries, timezone, dayKey, plan.id).filter(
    (dose) => !exceptWithEntryId || dose.withEntryId !== exceptWithEntryId,
  );
  return given.length >= cap;
}

export function useMedicines(
  entries: () => LocalEntry[],
  timezone: () => string,
  now: () => Date,
  plans: () => LocalEntry[],
) {
  return computed<MedicineStatus[]>(() => {
    const tz = timezone();
    const today = localDayKey(now(), tz);
    const all = entries();

    return plans().map((plan) => {
      const doses = dosesOnDay(all, tz, today, plan.id);
      const target = plan.medicineTimesPerDay;
      const complete = target !== null && doses.length >= target;
      const max = plan.medicineMaxPerDay;

      return {
        plan,
        id: plan.id,
        name: plan.label ?? "",
        amount: plan.medicineAmount,
        unit: plan.medicineUnit,
        timesPerDay: target,
        maxPerDay: max,
        givenToday: doses.length,
        atMax: max !== null && doses.length >= max,
        // Possible even with the guard: the deliberate path stays open, and the other
        // phone may have recorded one at the same moment.
        overMax: max !== null && doses.length > max,
        lastAtLabel: doses[0] ? localTimeLabel(doses[0].startedAt, tz) : null,
        lastDoseId: doses[0]?.id ?? null,
        complete,
        // From 6 pm on, "still outstanding" becomes a clearer note — and only for a
        // medicine that is actually due. An as-needed one is never late.
        urgent: target !== null && !complete && now().getHours() >= 18,
      };
    });
  });
}
