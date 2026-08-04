import { computed } from "vue";
import {
  addDays,
  addMonths,
  calendarDateLabel,
  daysBetween,
  lifeWeek,
  lifeWeekStart,
  type Child,
} from "@babymonitor/shared";
import { CHECKUPS, type Checkup } from "../data/checkups.ts";
import { MILESTONES } from "../data/milestones.ts";
import { LEAPS, type Leap } from "../data/leaps.ts";
import { VACCINATIONS } from "../data/vaccinations.ts";

/**
 * Rechnet alle Zeitstrahl-Elemente auf eine gemeinsame Achse: die Lebenswoche ab Geburt.
 *
 * Der Knackpunkt sind die Entwicklungssprünge. Die zählen ab dem ERRECHNETEN TERMIN,
 * alles andere (U-Untersuchungen, Impfungen, Fotos) ab der GEBURT. Bei einem Frühchen
 * liegen dazwischen mehrere Wochen. Beides ungeprüft auf dieselbe Achse zu legen ist
 * der Fehler, den man dieser Art App am häufigsten ansieht — hier passiert die
 * Umrechnung an genau einer Stelle: `leapOffsetWeeks`.
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
  /** Datum bzw. Zeitraum als Klartext für die Detailkarte. */
  when: string;
};

export type UpcomingItem = TimelinePin & { daysAway: number };

/**
 * Ein eigener Zeitraum: Krankheit oder Abwesenheit.
 *
 * Getrennt von den Sprung-Bändern, weil es etwas grundsätzlich anderes ist: Sprünge
 * sind eine Erwartung aus einem Modell, das hier tatsächlich Erlebte gehört auf eine
 * eigene Spur. Beides in einen Streifen zu werfen würde suggerieren, sie wären
 * vergleichbar.
 */
export type PeriodBand = {
  id: string;
  fromWeek: number;
  toWeek: number;
  label: string;
  kind: "illness" | "absence";
  /** Läuft noch — kein Ende eingetragen. */
  ongoing: boolean;
};

/** Rechnet Krankheiten und Abwesenheiten auf die Wochenachse. */
export function periodBands(
  entries: { id: string; type: string; startedAt: string; endedAt: string | null; label: string | null }[],
  birthDate: string,
  timezone: string,
  currentWeek: number,
): PeriodBand[] {
  return entries
    .filter((e) => e.type === "illness" || e.type === "absence")
    .map((e) => {
      const fromWeek = lifeWeek(birthDate, e.startedAt, timezone);
      const ongoing = !e.endedAt;
      return {
        id: e.id,
        fromWeek,
        // Ohne Ende bis heute zeichnen — ein Balken ohne Ausdehnung wäre unsichtbar.
        toWeek: ongoing ? Math.max(fromWeek, currentWeek) : lifeWeek(birthDate, e.endedAt!, timezone),
        label: e.label ?? (e.type === "illness" ? "Krank" : "Unterwegs"),
        kind: e.type as "illness" | "absence",
        ongoing,
      };
    })
    .sort((a, b) => a.fromWeek - b.fromWeek);
}

export function useTimeline(child: () => Child | null, weeksTotal = 80) {
  /**
   * Verschiebung zwischen Sprungzählung (ab ET) und Wochenachse (ab Geburt).
   * Positiv, wenn das Kind vor dem Termin geboren wurde.
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

  /** Wandelt ein Untersuchungsfenster in Lebenswochen um. */
  function checkupWeeks(c: Child, checkup: Checkup): { from: number; to: number; dates: string } {
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

    for (const checkup of CHECKUPS) {
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

    for (const vaccination of VACCINATIONS) {
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
          when: `${dose.dose}${dose.optional ? " (je nach Impfstoff)" : ""} · ab ${calendarDateLabel(date)}`,
        });
      }
    }

    // Meilensteine erscheinen in ihrem Erwartungsfenster — dieselbe Liste, die
    // unter "Meilensteine" zum Abhaken steht. Es gibt bewusst nur eine.
    for (const milestone of MILESTONES) {
      if (milestone.fromWeek > weeksTotal) continue;
      result.push({
        id: `milestone-${milestone.key}`,
        week: milestone.fromWeek,
        kind: "milestone",
        label: milestone.label,
        detail: milestone.hint ?? "",
        when: `üblich in Woche ${milestone.fromWeek}–${milestone.toWeek}${milestone.source === "who" ? " (WHO)" : ""}`,
      });
    }

    return result.sort((a, b) => a.week - b.week);
  });

  /** Die nächsten anstehenden Termine — der "Ausblick" auf einen Blick. */
  function upcoming(currentWeek: number, count = 3): UpcomingItem[] {
    const c = child();
    if (!c) return [];
    return pins.value
      .filter((pin) => pin.week >= currentWeek)
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

  /** Der Sprung, in dessen Fenster die aktuelle Woche liegt (falls einer läuft). */
  function activeLeap(currentWeek: number): Leap | null {
    const band = bands.value.find((b) => currentWeek >= b.fromWeek && currentWeek <= b.toWeek);
    return band?.leap ?? null;
  }

  return { bands, pins, upcoming, activeLeap, leapOffsetWeeks };
}
