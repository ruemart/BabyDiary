import type { EntryType } from "@babymonitor/shared";

/**
 * Flaschen und Windeln innerhalb eines Tages durchzählen: 1. Flasche, 2. Flasche …
 *
 * Gezählt wird VOM TAGESANFANG AN, obwohl die Liste neueste zuerst zeigt. Nur so bleibt
 * eine Nummer stabil: Die dritte Flasche von heute Mittag heißt heute Abend immer noch
 * „3.". Rückwärts gezählt würde jeder neue Eintrag alle darunter umbenennen — und eine
 * Zahl, die sich ändert, kann man niemandem sagen.
 *
 * Nebeneffekt, der die eigentliche Frage beantwortet: Die oberste Zahl des Tages ist
 * zugleich die Anzahl. „6. Flasche" heißt sechs Flaschen bisher.
 */
const NUMBERED_TYPES = new Set<EntryType>(["feed", "diaper"]);

type Countable = { id: string; type: EntryType };

/**
 * @param entries Einträge EINES Tages, absteigend nach Zeit (so wie die Liste sie zeigt).
 * @returns Eintrags-Id → laufende Nummer. Arten ohne sinnvolle Zählung fehlen darin:
 *   Bei Wachstum oder Meilenstein sagt eine laufende Nummer nichts, und ein Bad am Tag
 *   braucht keine.
 */
export function numberWithinDay(entries: readonly Countable[]): Map<string, number> {
  const counted = new Map<EntryType, number>();
  const ordinals = new Map<string, number>();

  // Die Gruppe kommt absteigend an — zum Zählen einmal umdrehen.
  for (const entry of [...entries].reverse()) {
    if (!NUMBERED_TYPES.has(entry.type)) continue;
    const n = (counted.get(entry.type) ?? 0) + 1;
    counted.set(entry.type, n);
    ordinals.set(entry.id, n);
  }

  return ordinals;
}
