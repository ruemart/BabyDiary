import { calendarDateLabel, daysBetween, shortDateLabel } from "@babymonitor/shared";

/**
 * The chain of supply entries is the switch history.
 *
 * Each entry holds until the next one begins. That is not a separately maintained table
 * but follows from the order — which is exactly why a switch has to be a NEW entry and
 * must not overwrite the old one.
 *
 * For formula that is the whole point: if something disagrees with her, you want to know
 * what was introduced when. An overwritten row never answers that.
 */

export type SupplyPeriod<T> = {
  entry: T;
  /** The most recent entry — what is being bought right now. */
  isCurrent: boolean;
  /** „seit 17. Jul 2026" bzw. „2. Mai – 17. Jul 2026" */
  rangeLabel: string;
  /** „3 Wochen" — wie lange dieser Stand galt bzw. schon gilt. */
  durationLabel: string;
  days: number;
};

type Dated = { startedAt: string };

/**
 * @param entries Entries of ONE category, newest first.
 * @param dayKey Conversion to the local calendar day (the time zone sits in the caller).
 * @param today Local day key for the open period of the current entry.
 */
export function supplyPeriods<T extends Dated>(
  entries: readonly T[],
  dayKey: (iso: string) => string,
  today: string,
): SupplyPeriod<T>[] {
  return entries.map((entry, i) => {
    const from = dayKey(entry.startedAt);
    // The successor sits BEFORE it in the descending list.
    const successor = entries[i - 1];
    const until = successor ? dayKey(successor.startedAt) : today;
    const days = Math.max(0, daysBetween(from, until));

    return {
      entry,
      isCurrent: !successor,
      rangeLabel: rangeLabel(from, until, !successor, days),
      // On the first day of the current entry the duration says nothing the period does
      // not already say — then it stays empty and the view leaves it out.
      durationLabel: !successor && days < 2 ? "" : durationLabel(days),
      days,
    };
  });
}

function rangeLabel(from: string, until: string, isCurrent: boolean, days: number): string {
  if (isCurrent) {
    // "since today" reads right on the day of the switch; a date feels oddly formal
    // there for something that happened moments ago.
    if (days === 0) return "seit heute";
    if (days === 1) return "seit gestern";
    return `seit ${calendarDateLabel(from)}`;
  }
  // Switched on the same day: showing a span would only be confusing.
  if (from === until) return calendarDateLabel(from);
  return `${shortDateLabel(from)} – ${calendarDateLabel(until)}`;
}



/**
 * Rough but readable. Counting to the day helps nobody here — the question is "for a
 * long time" or "only briefly", not "exactly how many days".
 */
function durationLabel(days: number): string {
  if (days < 1) return "am selben Tag";
  if (days === 1) return "1 Tag";
  if (days < 14) return `${days} Tage`;
  const weeks = Math.round(days / 7);
  if (weeks < 10) return `${weeks} Wochen`;
  const months = Math.round(days / 30.44);
  return months === 1 ? "1 Monat" : `${months} Monate`;
}
