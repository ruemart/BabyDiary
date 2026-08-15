import { computed } from "vue";
import {
  addDays,
  daysBetween,
  localDayKey,
  minutesIntoLocalDay,
  startOfWeek,
} from "@babydiary/shared";
import type { LocalEntry } from "../db/local.ts";

/**
 * Aggregations for the charts.
 *
 * Every day boundary and every clock time goes through the helpers in `shared/time` with
 * a fixed time zone — never through epoch arithmetic. Otherwise the clock change shifts
 * exactly the night feeds whose pattern is the interesting part.
 */

export type DailyTotal = {
  day: string;
  label: string;
  totalMl: number;
  feeds: number;
  /** A rolling 7-day average — smooths out the day-to-day randomness. */
  rollingMl: number | null;
};

/** How one day went for one medicine. */
export type MedicineCell = {
  day: string;
  given: number;
  /** `none` = the medicine did not exist yet, or nothing was due and nothing given. */
  state: "none" | "missed" | "partial" | "complete";
};

export type MedicineRow = {
  id: string;
  name: string;
  /** Null = as needed. Such a medicine can never have a missed day. */
  timesPerDay: number | null;
  cells: MedicineCell[];
  /** Days with at least one dose, out of the days the medicine has existed. */
  daysGiven: number;
  daysPossible: number;
  /** Complete days in a row, counted back from today. Null while nothing is due. */
  streak: number | null;
  givenToday: number;
  /** Still on the list under Settings. */
  active: boolean;
};

export type BathCell = { day: string; count: number; isFuture: boolean };

export type BathCalendar = {
  /** One column per week, the Monday first. */
  weeks: { start: string; label: string }[];
  /** grid[weekday][week] — the table is read by weekday, so that is the outer axis. */
  grid: BathCell[][];
  /** The typical gap in days. Null until there have been two. */
  averageGapDays: number | null;
  daysSinceLast: number | null;
  total: number;
};

export function useStats(entries: () => LocalEntry[], timezone: () => string, days = 30) {
  const feeds = computed(() => entries().filter((e) => e.type === "feed" && e.amountMl !== null));

  /** A gapless series of days: days without entries must appear as 0, not be missing. */
  const dailyTotals = computed<DailyTotal[]>(() => {
    const tz = timezone();
    const today = localDayKey(new Date(), tz);

    const totals = new Map<string, { ml: number; count: number }>();
    for (const feed of feeds.value) {
      const key = localDayKey(feed.startedAt, tz);
      const current = totals.get(key) ?? { ml: 0, count: 0 };
      // Feeds brought back up count as a feed but not as an amount — otherwise the
      // daily total reports an intake that never made it into the child, and the ml/kg
      // figure comes out systematically too high.
      if (!feed.spatUp) current.ml += feed.amountMl ?? 0;
      current.count += 1;
      totals.set(key, current);
    }

    const series: DailyTotal[] = [];
    for (let offset = days - 1; offset >= 0; offset--) {
      const day = addDays(today, -offset);
      const entry = totals.get(day);
      series.push({
        day,
        label: day.slice(8) + "." + day.slice(5, 7) + ".",
        totalMl: entry?.ml ?? 0,
        feeds: entry?.count ?? 0,
        rollingMl: null,
      });
    }

    // The rolling average only from the seventh day — before that it would be an
    // average over zeros and would fake a rise that never happened.
    for (let i = 6; i < series.length; i++) {
      const window = series.slice(i - 6, i + 1);
      series[i]!.rollingMl = Math.round(window.reduce((s, d) => s + d.totalMl, 0) / 7);
    }

    return series;
  });

  /** Scatter: x = day index, y = minutes since local midnight, r from the amount. */
  const rhythm = computed(() => {
    const tz = timezone();
    const today = localDayKey(new Date(), tz);
    const first = addDays(today, -(days - 1));

    return feeds.value
      .filter((feed) => localDayKey(feed.startedAt, tz) >= first)
      .map((feed) => {
        const day = localDayKey(feed.startedAt, tz);
        return {
          x: daysApart(first, day),
          y: minutesIntoLocalDay(feed.startedAt, tz),
          ml: feed.amountMl ?? 0,
          spatUp: feed.spatUp === true,
          day,
        };
      });
  });

  /** Nappies per day and hour, for the grid. */
  const diaperGrid = computed(() => {
    const tz = timezone();
    const today = localDayKey(new Date(), tz);
    const cells = new Map<string, { kind: string; count: number }>();

    for (const entry of entries()) {
      if (entry.type !== "diaper") continue;
      const day = localDayKey(entry.startedAt, tz);
      const hour = Math.floor(minutesIntoLocalDay(entry.startedAt, tz) / 60);
      const key = `${day}|${hour}`;
      const existing = cells.get(key);
      // "Soiled" beats "wet" beats "empty" — the most notable observation of the hour
      // should decide the cell.
      const rank = { empty: 1, wet: 2, soiled: 3, both: 3 } as Record<string, number>;
      const incoming = entry.diaper ?? "empty";
      if (!existing || (rank[incoming] ?? 0) > (rank[existing.kind] ?? 0)) {
        cells.set(key, { kind: incoming, count: (existing?.count ?? 0) + 1 });
      } else {
        existing.count += 1;
      }
    }

    const rows = [];
    for (let offset = 13; offset >= 0; offset--) {
      const day = addDays(today, -offset);
      rows.push({
        day,
        label: day.slice(8) + "." + day.slice(5, 7) + ".",
        hours: Array.from({ length: 24 }, (_, hour) => cells.get(`${day}|${hour}`) ?? null),
      });
    }
    return rows;
  });

  /**
   * Medicine, one row per medicine and one cell per day: was what was due given?
   *
   * The question a medicine chart has to answer is not "how much" — the dose is the same
   * every day and a bar chart of it would be a rectangle. It is whether it was kept up,
   * and where the gaps are. Hence a grid of days: a missed day is a hole you see without
   * reading a number, and three medicines underneath each other show at a glance which
   * one is the one that gets forgotten.
   *
   * Days BEFORE the medicine existed are not missed days. Without that distinction the
   * newest medicine would show up as a month of failure on the day it is set up, which
   * is both wrong and discouraging.
   */
  const medicineDays = computed<MedicineRow[]>(() => {
    const tz = timezone();
    const today = localDayKey(new Date(), tz);
    const first = addDays(today, -(days - 1));

    const plans = entries().filter((e) => e.type === "medicineplan");

    /** Doses per medicine and day, in the window. */
    const counts = new Map<string, Map<string, number>>();
    /** Medicines that only appear on doses — their plan has been deleted since. */
    const orphanNames = new Map<string, string>();

    for (const entry of entries()) {
      if (entry.type !== "medicine" || !entry.medicineId) continue;
      const day = localDayKey(entry.startedAt, tz);
      if (day < first || day > today) continue;
      const perDay = counts.get(entry.medicineId) ?? new Map<string, number>();
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
      counts.set(entry.medicineId, perDay);
      if (!plans.some((plan) => plan.id === entry.medicineId)) {
        orphanNames.set(entry.medicineId, entry.label ?? "");
      }
    }

    const rows: { id: string; name: string; timesPerDay: number | null; start: string; active: boolean }[] =
      plans.map((plan) => ({
        id: plan.id,
        name: plan.label ?? "",
        timesPerDay: plan.medicineTimesPerDay,
        // A medicine begins when it was set up — or earlier, if doses were entered for a
        // time before that. Recording the past is allowed; being marked down for it is not.
        start: earliestDay(localDayKey(plan.startedAt, tz), counts.get(plan.id)),
        active: true,
      }));

    for (const [id, name] of orphanNames) {
      // A finished course of treatment: the plan is gone, the doses given are not. It
      // has no target any more — nothing is due, so nothing can be missed.
      rows.push({
        id,
        name,
        timesPerDay: null,
        start: earliestDay(today, counts.get(id)),
        active: false,
      });
    }

    return rows.map((row) => {
      const perDay = counts.get(row.id) ?? new Map<string, number>();
      const cells: MedicineCell[] = [];

      for (let offset = days - 1; offset >= 0; offset--) {
        const day = addDays(today, -offset);
        const given = perDay.get(day) ?? 0;
        cells.push({
          day,
          given,
          state: cellState(day, given, row.start, row.timesPerDay, today),
        });
      }

      /**
       * The denominator leaves out an unfinished today, for the same reason the cell
       * does: "given on 13 of 14 days" would count a day that is still ahead of us as
       * one we failed. As soon as something is given today, today counts on both sides.
       */
      const daysPossible = cells.filter(
        (cell) => cell.day >= row.start && !(cell.day === today && cell.given === 0),
      ).length;

      return {
        id: row.id,
        name: row.name,
        timesPerDay: row.timesPerDay,
        cells,
        daysGiven: cells.filter((cell) => cell.given > 0).length,
        daysPossible,
        streak: row.timesPerDay === null ? null : completeStreak(cells),
        givenToday: perDay.get(today) ?? 0,
        active: row.active,
      };
    });
  });

  /**
   * Baths, as a calendar of weekdays over the weeks.
   *
   * Deliberately NOT the nappy grid. That one runs over 24 hours because nappies happen
   * many times a day; a bath happens about once a week, and an hour axis would be a
   * screen of empty cells with two marks in it. What is actually worth knowing is the
   * rhythm in days — and whether it has quietly become a fortnight.
   */
  const bathDays = computed<BathCalendar>(() => {
    const tz = timezone();
    const today = localDayKey(new Date(), tz);
    const thisWeek = startOfWeek(today);

    const perDay = new Map<string, number>();
    const bathDayKeys: string[] = [];
    for (const entry of entries()) {
      if (entry.type !== "bath") continue;
      const day = localDayKey(entry.startedAt, tz);
      if (!perDay.has(day)) bathDayKeys.push(day);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    bathDayKeys.sort();

    const weeks: { start: string; label: string }[] = [];
    for (let offset = BATH_WEEKS - 1; offset >= 0; offset--) {
      const start = addDays(thisWeek, -offset * 7);
      /**
       * The date of the Monday, not the ISO week number: "3.8." can be placed in a life,
       * "week 32" has to be looked up. Same reasoning as the history's week picker.
       *
       * Short and numeric, though — "3. August" as a column heading is three times as
       * wide as the column it heads, and ten of those push the current week, the one
       * actually being asked about, off the right-hand edge. It is the same compact form
       * the daily chart and the nappy grid label their axes with.
       */
      weeks.push({ start, label: `${Number(start.slice(8))}.${Number(start.slice(5, 7))}.` });
    }

    const grid: BathCell[][] = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      grid.push(
        weeks.map((week) => {
          const day = addDays(week.start, weekday);
          return { day, count: perDay.get(day) ?? 0, isFuture: day > today };
        }),
      );
    }

    /**
     * The average gap over the whole history, not just the ten weeks on screen — the
     * number below the grid answers "how often do we bathe her", and that question does
     * not stop at the left edge of the picture.
     */
    let averageGapDays: number | null = null;
    if (bathDayKeys.length >= 2) {
      const span = daysBetween(bathDayKeys[0]!, bathDayKeys[bathDayKeys.length - 1]!);
      averageGapDays = Math.round((span / (bathDayKeys.length - 1)) * 10) / 10;
    }

    return {
      weeks,
      grid,
      averageGapDays,
      daysSinceLast: bathDayKeys.length
        ? daysBetween(bathDayKeys[bathDayKeys.length - 1]!, today)
        : null,
      total: bathDayKeys.reduce((sum, day) => sum + (perDay.get(day) ?? 0), 0),
    };
  });

  /** Key figures for the tiles above the charts. */
  const summary = computed(() => {
    /**
     * TODAY stays out of every average.
     *
     * It is incomplete by definition — at eight in the morning there are two feeds in it.
     * Counting it drags the weekly average down and the app reports "11 % less than last
     * week" while the bars visibly rise. A figure that contradicts the chart next to it
     * is worse than no figure at all.
     */
    const complete = dailyTotals.value.slice(0, -1);
    const recent = complete.slice(-7).filter((d) => d.feeds > 0);
    const previous = complete.slice(-14, -7).filter((d) => d.feeds > 0);

    const avg = (list: DailyTotal[]) =>
      list.length ? Math.round(list.reduce((s, d) => s + d.totalMl, 0) / list.length) : null;

    const avgMl = avg(recent);
    const avgPrevious = avg(previous);
    const avgFeeds = recent.length
      ? Math.round((recent.reduce((s, d) => s + d.feeds, 0) / recent.length) * 10) / 10
      : null;

    const latestWeight = entries()
      .filter((e) => e.type === "growth" && e.weightG !== null)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]?.weightG;

    return {
      avgMl,
      avgFeeds,
      /** Change against last week in percent — answers "is she drinking more or less". */
      trendPercent:
        avgMl !== null && avgPrevious !== null && avgPrevious > 0
          ? Math.round(((avgMl - avgPrevious) / avgPrevious) * 100)
          : null,
      /**
       * Millilitres per kilogram of body weight. The number that actually says whether
       * intake keeps up with growth — absolute millilitres rise anyway.
       */
      mlPerKg:
        avgMl !== null && latestWeight
          ? Math.round((avgMl / (latestWeight / 1000)) * 10) / 10
          : null,
    };
  });

  return { dailyTotals, rhythm, diaperGrid, medicineDays, bathDays, summary };
}

/** Ten weeks: long enough for a rhythm to show, short enough to stay one screen wide. */
const BATH_WEEKS = 10;

/** The earlier of "set up on" and "first dose recorded for". */
function earliestDay(planDay: string, perDay: Map<string, number> | undefined): string {
  let earliest = planDay;
  for (const day of perDay?.keys() ?? []) if (day < earliest) earliest = day;
  return earliest;
}

function cellState(
  day: string,
  given: number,
  start: string,
  timesPerDay: number | null,
  today: string,
): MedicineCell["state"] {
  if (day < start) return "none";
  /**
   * Today is not a missed day. It is an unfinished one.
   *
   * At twenty past midnight the chart would otherwise open on a fresh gap at its right
   * edge, every night — the same reason today stays out of the averages above. Once
   * something has been given the day is scored normally, so the cell still fills in
   * during the day.
   */
  if (given === 0) return timesPerDay === null || day === today ? "none" : "missed";
  if (timesPerDay === null || given >= timesPerDay) return "complete";
  return "partial";
}

/**
 * Complete days in a row, counted back from today.
 *
 * Today only counts once it is complete, and an incomplete today does not break the run:
 * at nine in the morning nothing has been missed yet, and a streak that resets itself
 * every midnight would be a counter of the time of day.
 */
function completeStreak(cells: MedicineCell[]): number {
  let streak = 0;
  for (let i = cells.length - 1; i >= 0; i--) {
    const cell = cells[i]!;
    if (cell.state === "complete") streak++;
    else if (i === cells.length - 1) continue;
    else break;
  }
  return streak;
}

function daysApart(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  return Math.round(
    (Date.UTC(ty, tm - 1, td, 12) - Date.UTC(fy, fm - 1, fd, 12)) / 86_400_000,
  );
}
