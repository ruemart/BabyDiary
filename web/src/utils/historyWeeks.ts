import { addDays, daysBetween, localDayKey, startOfWeek } from "@babydiary/shared";
import type { LocalEntry } from "../db/local.ts";

/**
 * The history, broken into weeks.
 *
 * An endless list answers "what happened last Wednesday" only by scrolling, and the
 * longer the app is used the worse it gets. A week of seven days is the unit people
 * think in anyway — and the day strip shows the numbers of the whole week at a glance,
 * without having to open a single day.
 *
 * Within a day it runs UPWARDS, from morning to evening. In a list of all days the
 * newest must be on top; a completed day, by contrast, has no "newest" — it has a
 * beginning. That way every day starts in the same place — at the top — and can be
 * compared with the next, instead of the morning sitting somewhere different depending
 * on how many entries there are.
 */

export type DaySummary = {
  /** "YYYY-MM-DD" in local time. */
  key: string;
  /** 0 = Montag … 6 = Sonntag. */
  weekday: number;
  /** Day of the month as a number, for the day strip. */
  dayOfMonth: number;
  /** Chronologically ascending — the day is read from morning to evening. */
  entries: LocalEntry[];
  /** The amount drunk — what came back up does not count. */
  totalMl: number;
  feeds: number;
  diapers: number;
  /** Completed sleeps only; one still running has no duration yet. */
  sleepMinutes: number;
  /** Lies in the future — nothing to record there. */
  isFuture: boolean;
};

export type HistoryWeek = {
  /** The Monday of the week. */
  start: string;
  days: DaySummary[];
};

const WEEK_LENGTH = 7;

/**
 * Builds the seven days of a week, including the empty ones.
 *
 * Empty days deliberately stay in the strip: a gap is a statement — nothing was recorded
 * that day. Leaving them out would shift the weekdays around and the strip would no
 * longer be comparable.
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
    // Ascending, regardless of how the caller sorted them.
    const dayEntries = (byDay.get(key) ?? []).sort((a, b) =>
      a.startedAt.localeCompare(b.startedAt),
    );
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
 * Every week with entries, newest first — the current week always included.
 *
 * Gapless from the oldest to the current week, even when nothing was recorded in
 * between. A picker with weeks missing makes you doubt your own memory rather than the
 * data entry.
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
 * The day to land on when the week changes.
 *
 * The same weekday as before: going back a week from Wednesday usually means the
 * Wednesday before — which makes weeks comparable. In the current week it is clamped to
 * today, because a day in the future would have nothing to show.
 */
export function dayAfterWeekChange(weekStart: string, weekday: number, today: string): string {
  const wanted = addDays(weekStart, weekday);
  return daysBetween(today, wanted) > 0 ? today : wanted;
}
