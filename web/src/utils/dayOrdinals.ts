import type { EntryType } from "@babydiary/shared";

/**
 * Number bottles and nappies within a day: 1st bottle, 2nd bottle …
 *
 * Counted from the start of the day — the same direction in which the list shows it.
 * Only that way does a number stay stable: the third bottle from midday is still "3."
 * in the evening. Counted backwards, every new entry would rename everything below it,
 * and a number that changes is a number you cannot tell anyone.
 *
 * A side effect that answers the actual question: the last number of the day is also
 * the count. "6th bottle" means six bottles that day.
 */
const NUMBERED_TYPES = new Set<EntryType>(["feed", "diaper"]);

type Countable = { id: string; type: EntryType };

/**
 * @param entries Entries of ONE day, ascending by time (the way the list shows them).
 * @returns Entry id → running number. Kinds without a meaningful count are absent:
 *   for growth or a milestone a running number says nothing, and one bath a day needs
 *   no counting.
 */
export function numberWithinDay(entries: readonly Countable[]): Map<string, number> {
  const counted = new Map<EntryType, number>();
  const ordinals = new Map<string, number>();

  for (const entry of entries) {
    if (!NUMBERED_TYPES.has(entry.type)) continue;
    const n = (counted.get(entry.type) ?? 0) + 1;
    counted.set(entry.type, n);
    ordinals.set(entry.id, n);
  }

  return ordinals;
}
