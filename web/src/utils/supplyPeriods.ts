import { calendarDateLabel, daysBetween } from "@babymonitor/shared";

/**
 * Aus der Kette der Vorrats-Einträge wird die Wechsel-Historie.
 *
 * Jeder Eintrag gilt, bis der nächste beginnt. Das ist keine zusätzlich geführte
 * Tabelle, sondern ergibt sich aus der Reihenfolge — genau deshalb muss ein Wechsel
 * ein NEUER Eintrag sein und darf den alten nicht überschreiben.
 *
 * Für die Milchnahrung ist das der eigentliche Zweck: Wenn etwas nicht bekommt, will
 * man wissen, was wann dazugekommen ist. Eine überschriebene Zeile beantwortet das nie.
 */

export type SupplyPeriod<T> = {
  entry: T;
  /** Der jüngste Eintrag — das, was gerade gekauft wird. */
  isCurrent: boolean;
  /** „seit 17. Jul 2026" bzw. „2. Mai – 17. Jul 2026" */
  rangeLabel: string;
  /** „3 Wochen" — wie lange dieser Stand galt bzw. schon gilt. */
  durationLabel: string;
  days: number;
};

type Dated = { startedAt: string };

/**
 * @param entries Einträge EINER Kategorie, neueste zuerst.
 * @param dayKey Umrechnung auf den lokalen Kalendertag (Zeitzone steckt im Aufrufer).
 * @param today Lokaler Tagesschlüssel für den offenen Zeitraum des aktuellen Standes.
 */
export function supplyPeriods<T extends Dated>(
  entries: readonly T[],
  dayKey: (iso: string) => string,
  today: string,
): SupplyPeriod<T>[] {
  return entries.map((entry, i) => {
    const from = dayKey(entry.startedAt);
    // Der Nachfolger steht in der absteigenden Liste DAVOR.
    const successor = entries[i - 1];
    const until = successor ? dayKey(successor.startedAt) : today;
    const days = Math.max(0, daysBetween(from, until));

    return {
      entry,
      isCurrent: !successor,
      rangeLabel: rangeLabel(from, until, !successor, days),
      // Beim laufenden Stand am ersten Tag sagt die Dauer nichts, was nicht schon
      // im Zeitraum steht — dann bleibt sie leer und die Ansicht lässt sie weg.
      durationLabel: !successor && days < 2 ? "" : durationLabel(days),
      days,
    };
  });
}

function rangeLabel(from: string, until: string, isCurrent: boolean, days: number): string {
  if (isCurrent) {
    // "seit heute" liest sich am Tag des Wechsels richtig; ein Datum wirkt dort
    // seltsam förmlich für etwas, das gerade eben passiert ist.
    if (days === 0) return "seit heute";
    if (days === 1) return "seit gestern";
    return `seit ${calendarDateLabel(from)}`;
  }
  // Am selben Tag gewechselt: eine Spanne zu zeigen wäre nur verwirrend.
  if (from === until) return calendarDateLabel(from);
  return `${shortDate(from)} – ${calendarDateLabel(until)}`;
}

/** Ohne Jahr, weil es am Ende der Spanne ohnehin steht. */
function shortDate(date: string): string {
  return calendarDateLabel(date).replace(/ \d{4}$/, "");
}

/**
 * Grob, aber lesbar. Auf den Tag genau zu rechnen hilft hier niemandem — die Frage ist
 * „schon lange" oder „erst kurz", nicht „wie viele Tage genau".
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
