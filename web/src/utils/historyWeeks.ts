import { addDays, daysBetween, localDayKey, startOfWeek } from "@babymonitor/shared";
import type { LocalEntry } from "../db/local.ts";

/**
 * Der Verlauf, in Wochen zerlegt.
 *
 * Eine endlose Liste beantwortet die Frage „was war letzten Mittwoch" nur durch Scrollen,
 * und je länger die App benutzt wird, desto schlechter. Eine Woche mit sieben Tagen ist
 * die Einheit, in der man ohnehin denkt — und die Tagesleiste zeigt die Zahlen des ganzen
 * Wochenverlaufs auf einen Blick, ohne dass man einen einzigen Tag öffnen müsste.
 */

export type DaySummary = {
  /** "YYYY-MM-DD" in lokaler Zeit. */
  key: string;
  /** 0 = Montag … 6 = Sonntag. */
  weekday: number;
  /** Kalendertag als Zahl, für die Tagesleiste. */
  dayOfMonth: number;
  entries: LocalEntry[];
  /** Getrunkene Menge — Ausgespucktes zählt nicht mit. */
  totalMl: number;
  feeds: number;
  diapers: number;
  /** Nur abgeschlossene Schlafphasen; eine laufende hat noch keine Dauer. */
  sleepMinutes: number;
  /** Liegt in der Zukunft — dort ist nichts einzutragen. */
  isFuture: boolean;
};

export type HistoryWeek = {
  /** Montag der Woche. */
  start: string;
  days: DaySummary[];
};

const WEEK_LENGTH = 7;

/**
 * Baut die sieben Tage einer Woche, auch die leeren.
 *
 * Leere Tage bleiben bewusst in der Leiste: Eine Lücke ist eine Aussage — an dem Tag
 * wurde nichts eingetragen. Würde man sie weglassen, verschöben sich die Wochentage
 * und die Leiste wäre nicht mehr vergleichbar.
 */
export function buildWeek(
  entries: readonly LocalEntry[],
  timezone: string,
  weekStart: string,
  today: string,
): HistoryWeek {
  const byDay = new Map<string, LocalEntry[]>();
  for (const entry of entries) {
    const key = localDayKey(entry.startedAt, timezone);
    const list = byDay.get(key);
    if (list) list.push(entry);
    else byDay.set(key, [entry]);
  }

  const days: DaySummary[] = [];
  for (let i = 0; i < WEEK_LENGTH; i++) {
    const key = addDays(weekStart, i);
    const dayEntries = byDay.get(key) ?? [];
    days.push({
      key,
      weekday: i,
      dayOfMonth: Number(key.slice(8)),
      entries: dayEntries,
      totalMl: dayEntries.reduce((sum, e) => sum + (e.spatUp ? 0 : (e.amountMl ?? 0)), 0),
      feeds: dayEntries.filter((e) => e.type === "feed").length,
      diapers: dayEntries.filter((e) => e.type === "diaper").length,
      sleepMinutes: dayEntries.reduce((sum, e) => sum + sleepDuration(e), 0),
      isFuture: daysBetween(today, key) > 0,
    });
  }

  return { start: weekStart, days };
}

function sleepDuration(entry: LocalEntry): number {
  if (entry.type !== "sleep" || !entry.endedAt) return 0;
  const minutes = (Date.parse(entry.endedAt) - Date.parse(entry.startedAt)) / 60_000;
  return minutes > 0 ? Math.round(minutes) : 0;
}

/**
 * Alle Wochen mit Einträgen, neueste zuerst — die laufende Woche immer dabei.
 *
 * Lückenlos von der ältesten bis zur laufenden Woche, auch wenn dazwischen nichts
 * eingetragen wurde. Eine Auswahl, in der Wochen fehlen, lässt einen an der eigenen
 * Erinnerung zweifeln statt an der Eingabe.
 */
export function availableWeeks(
  entries: readonly LocalEntry[],
  timezone: string,
  today: string,
): string[] {
  const current = startOfWeek(today);
  let oldest = current;
  for (const entry of entries) {
    const week = startOfWeek(localDayKey(entry.startedAt, timezone));
    if (week < oldest) oldest = week;
  }

  const weeks: string[] = [];
  for (let w = current; w >= oldest; w = addDays(w, -WEEK_LENGTH)) weeks.push(w);
  return weeks;
}

/**
 * Der Tag, auf dem man beim Wochenwechsel landen soll.
 *
 * Derselbe Wochentag wie vorher: Wer von Mittwoch aus eine Woche zurückgeht, will meist
 * den Mittwoch davor — das macht Wochen vergleichbar. In der laufenden Woche wird auf
 * heute geklemmt, weil ein Tag in der Zukunft nichts anzuzeigen hätte.
 */
export function dayAfterWeekChange(weekStart: string, weekday: number, today: string): string {
  const wanted = addDays(weekStart, weekday);
  return daysBetween(today, wanted) > 0 ? today : wanted;
}
