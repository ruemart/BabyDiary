export type DiaperKindInput = "empty" | "wet" | "soiled";

export type DiaperDecision =
  | { action: "create" }
  | { action: "duplicate"; id: string }
  | { action: "correct"; id: string };

/**
 * The window in which a second nappy tap does not count as a second nappy.
 *
 * Two real changes within two minutes do not happen; a second tap while half asleep
 * happens constantly.
 */
export const DIAPER_GUARD_MS = 2 * 60 * 1000;

/**
 * Decides what a nappy tap means.
 *
 * Within the window it distinguishes:
 *  - the SAME kind again -> a slip, no second entry.
 *  - a DIFFERENT kind    -> a correction, the existing entry is changed.
 *
 * Pulled out as a pure function because the distinction is subtle and can be silently
 * wrong: a guard that accidentally swallows real entries only shows up in everyday use
 * once the charts already have holes in them.
 */
export function classifyDiaperTap(
  recent: { id: string; startedAt: string; diaper: string | null } | undefined,
  kind: DiaperKindInput,
  now: number = Date.now(),
): DiaperDecision {
  if (!recent) return { action: "create" };
  if (now - Date.parse(recent.startedAt) >= DIAPER_GUARD_MS) return { action: "create" };
  if (recent.diaper === kind) return { action: "duplicate", id: recent.id };
  return { action: "correct", id: recent.id };
}
