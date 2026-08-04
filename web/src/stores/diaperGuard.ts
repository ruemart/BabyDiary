export type DiaperKindInput = "empty" | "wet" | "soiled";

export type DiaperDecision =
  | { action: "create" }
  | { action: "duplicate"; id: string }
  | { action: "correct"; id: string };

/**
 * Zeitfenster, in dem ein zweiter Windel-Tap nicht als zweite Windel gilt.
 *
 * Zwei echte Wickel innerhalb von zwei Minuten kommen nicht vor; ein zweiter Tap im
 * Halbschlaf dagegen ständig.
 */
export const DIAPER_GUARD_MS = 2 * 60 * 1000;

/**
 * Entscheidet, was ein Windel-Tap bedeutet.
 *
 * Innerhalb des Zeitfensters wird unterschieden:
 *  - GLEICHE Art nochmal -> Versehen, kein zweiter Eintrag.
 *  - ANDERE Art          -> Korrektur, der bestehende Eintrag wird geändert.
 *
 * Als reine Funktion herausgezogen, weil die Unterscheidung subtil ist und still
 * falsch sein kann: Ein Schutz, der versehentlich echte Einträge verschluckt, fällt
 * im Alltag erst auf, wenn die Auswertung schon Lücken hat.
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
