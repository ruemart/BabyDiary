import { computed } from "vue";
import {
  addDays,
  addMonths,
  calendarDateLabel,
  daysBetween,
  lifeWeek,
  lifeWeekStart,
  localDayKey,
  type Child,
} from "@milo/shared";
import { MILESTONES } from "../data/milestones.ts";
import { LEAPS, type Leap } from "../data/leaps.ts";
import { regionByCode, type RegionCheckup } from "../data/regions/index.ts";
import { useI18n } from "vue-i18n";

/**
 * Maps every timeline element onto one shared axis: the week of life since birth.
 *
 * The catch is the developmental leaps. Those count from the DUE DATE, everything else
 * (check-ups, vaccinations, photos) from BIRTH. For a premature baby there are several
 * weeks between the two. Putting both on the same axis unchecked is the mistake you see
 * most often in apps like this — here the conversion happens in exactly one place:
 * `leapOffsetWeeks`.
 */

export type TimelineBand = {
  id: string;
  fromWeek: number;
  toWeek: number;
  leap: Leap;
};

export type TimelinePin = {
  id: string;
  week: number;
  kind: "checkup" | "vaccination" | "milestone";
  label: string;
  detail: string;
  /** Date or period in plain words for the detail card. */
  when: string;
  /**
   * When it actually happened — set only for milestones that have been ticked off.
   *
   * Only milestones have this because only they are ticked off in the app. Check-ups and
   * vaccinations happen at the practice; the app does not know whether you went.
   */
  doneOn?: string;
};

export type UpcomingItem = TimelinePin & { daysAway: number };

/**
 * A period of your own: illness or being away.
 *
 * Kept apart from the leap bands because it is something fundamentally different: leaps
 * are an expectation from a model, what actually happened belongs on its own track.
 * Throwing both into one strip would suggest they are comparable.
 */
export type PeriodBand = {
  id: string;
  fromWeek: number;
  toWeek: number;
  label: string;
  kind: "illness" | "absence";
  /** Still running — no end recorded. */
  ongoing: boolean;
};

/** Maps illnesses and away periods onto the week axis. */
export function periodBands(
  entries: { id: string; type: string; startedAt: string; endedAt: string | null; label: string | null }[],
  birthDate: string,
  timezone: string,
  currentWeek: number,
  labels: { ill: string; away: string },
): PeriodBand[] {
  // The two fallback labels come from outside: this function runs outside a setup
  // context and must therefore not call useI18n() itself.
  return entries
    .filter((e) => e.type === "illness" || e.type === "absence")
    .map((e) => {
      const fromWeek = lifeWeek(birthDate, e.startedAt, timezone);
      const ongoing = !e.endedAt;
      return {
        id: e.id,
        fromWeek,
        // Without an end, draw up to today — a bar with no extent would be invisible.
        toWeek: ongoing ? Math.max(fromWeek, currentWeek) : lifeWeek(birthDate, e.endedAt!, timezone),
        label: e.label ?? (e.type === "illness" ? labels.ill : labels.away),
        kind: e.type as "illness" | "absence",
        ongoing,
      };
    })
    .sort((a, b) => a.fromWeek - b.fromWeek);
}

/**
 * @param achievedMilestones When a milestone was reached, by key. Passed in rather than
 *   read from the store here, so this composable stays a pure mapping onto the week axis
 *   and can be tested without a store.
 */
export function useTimeline(
  child: () => Child | null,
  achievedMilestones: () => Map<string, string> = () => new Map(),
  weeksTotal = 80,
) {
  const { t } = useI18n();

  /**
   * Appointments come from the household's country configuration.
   *
   * An unknown value — for instance because another device runs a newer version with a
   * country this one does not know yet — falls back to "no appointments". Better to show
   * nothing than the appointments of the wrong country.
   */
  const region = () => regionByCode(child()?.region);

  /**
   * The shift between leap counting (from the due date) and the week axis (from birth).
   * Positive when the child was born before the due date.
   */
  const leapOffsetWeeks = computed(() => {
    const c = child();
    if (!c?.dueDate) return 0;
    return daysBetween(c.birthDate, c.dueDate) / 7;
  });

  const bands = computed<TimelineBand[]>(() => {
    const offset = leapOffsetWeeks.value;
    return LEAPS.map((leap) => ({
      id: `leap-${leap.number}`,
      fromWeek: leap.fussyFrom + offset,
      toWeek: leap.fussyTo + offset,
      leap,
    })).filter((b) => b.toWeek >= 0 && b.fromWeek <= weeksTotal);
  });

  /** Converts a check-up window into weeks of life. */
  function checkupWeeks(c: Child, checkup: RegionCheckup): { from: number; to: number; dates: string } {
    const startDate =
      checkup.unit === "day"
        ? addDays(c.birthDate, checkup.from)
        : checkup.unit === "week"
          ? addDays(c.birthDate, checkup.from * 7)
          : addMonths(c.birthDate, checkup.from);

    const endDate =
      checkup.unit === "day"
        ? addDays(c.birthDate, checkup.to)
        : checkup.unit === "week"
          ? addDays(c.birthDate, checkup.to * 7 + 6)
          : addMonths(c.birthDate, checkup.to + 1);

    return {
      from: daysBetween(c.birthDate, startDate) / 7,
      to: daysBetween(c.birthDate, endDate) / 7,
      dates:
        startDate === endDate
          ? calendarDateLabel(startDate)
          : `${calendarDateLabel(startDate)} – ${calendarDateLabel(endDate)}`,
    };
  }

  const pins = computed<TimelinePin[]>(() => {
    const c = child();
    if (!c) return [];

    const result: TimelinePin[] = [];

    for (const checkup of region().checkups) {
      const { from, dates } = checkupWeeks(c, checkup);
      if (from > weeksTotal) continue;
      result.push({
        id: `checkup-${checkup.id}`,
        week: from,
        kind: "checkup",
        label: checkup.id,
        detail: checkup.what,
        when: `${checkup.windowLabel} · ${dates}`,
      });
    }

    for (const vaccination of region().vaccinations) {
      for (const dose of vaccination.doses) {
        const date = addMonths(c.birthDate, dose.month);
        const week = daysBetween(c.birthDate, date) / 7;
        if (week > weeksTotal) continue;
        result.push({
          id: `vac-${vaccination.id}-${dose.dose}`,
          week,
          kind: "vaccination",
          label: vaccination.name,
          detail: vaccination.note ?? "",
          when:
            `${dose.dose}${dose.optional ? ` (${t("vaccine.dependsOnBrand")})` : ""}` +
            ` · ${t("vaccine.from", { date: calendarDateLabel(date) })}`,
        });
      }
    }

    // Milestones appear in their expected window — the same list that sits under
    // "Milestones" for ticking off. There is deliberately only one.
    //
    // Once one has been ticked off it moves to the week it ACTUALLY happened in. Before
    // that the ribbon is an expectation, afterwards it is a record, and a record that
    // still points at the expected week would be telling the wrong story: someone who
    // taps week 5 and finds "first smile" there wants to know it happened in week 5.
    const achieved = achievedMilestones();
    for (const milestone of MILESTONES) {
      const doneOn = achieved.get(milestone.key);
      const week = doneOn ? lifeWeek(c.birthDate, doneOn, c.timezone) : milestone.fromWeek;
      if (week > weeksTotal) continue;
      result.push({
        id: `milestone-${milestone.key}`,
        week,
        kind: "milestone",
        label: t(`milestone.${milestone.key}`),
        detail: milestone.hint ? t(`milestone.${milestone.key}.hint`) : "",
        when: doneOn
          // Via the local day: calendarDateLabel wants a calendar day, and a timestamp
            // just before midnight would otherwise land on the wrong date.
            ? t("milestone.doneOn", { date: calendarDateLabel(localDayKey(doneOn, c.timezone)) })
          : t("milestone.usualWeeks", { from: milestone.fromWeek, to: milestone.toWeek }) +
            (milestone.source === "who" ? t("milestone.who") : ""),
        ...(doneOn ? { doneOn } : {}),
      });
    }

    return result.sort((a, b) => a.week - b.week);
  });

  /** The next appointments due — the "what is coming" at a glance. */
  function upcoming(currentWeek: number, count = 3): UpcomingItem[] {
    const c = child();
    if (!c) return [];
    return pins.value
      // Anything already ticked off is not coming up — it happened.
      .filter((pin) => !pin.doneOn && pin.week >= currentWeek)
      .slice(0, count)
      .map((pin) => ({
        ...pin,
        daysAway: Math.max(
          0,
          daysBetween(
            lifeWeekStart(c.birthDate, currentWeek),
            lifeWeekStart(c.birthDate, Math.round(pin.week)),
          ),
        ),
      }));
  }

  /** The leap whose window contains the current week (if one is running). */
  function activeLeap(currentWeek: number): Leap | null {
    const band = bands.value.find((b) => currentWeek >= b.fromWeek && currentWeek <= b.toWeek);
    return band?.leap ?? null;
  }

  return { bands, pins, upcoming, activeLeap, leapOffsetWeeks };
}
