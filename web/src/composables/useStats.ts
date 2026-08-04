import { computed } from "vue";
import { addDays, localDayKey, minutesIntoLocalDay } from "@babymonitor/shared";
import type { LocalEntry } from "../db/local.ts";

/**
 * Aggregationen für die Auswertungen.
 *
 * Jede Tagesgrenze und jede Uhrzeit läuft über die Helfer aus `shared/time` mit fester
 * Zeitzone — niemals über Epoch-Arithmetik. Sonst verschieben sich bei der
 * Zeitumstellung genau die Nachtmahlzeiten, deren Verlauf hier interessiert.
 */

export type DailyTotal = {
  day: string;
  label: string;
  totalMl: number;
  feeds: number;
  /** Gleitendes 7-Tage-Mittel — glättet den Tag-zu-Tag-Zufall heraus. */
  rollingMl: number | null;
};

export function useStats(entries: () => LocalEntry[], timezone: () => string, days = 30) {
  const feeds = computed(() => entries().filter((e) => e.type === "feed" && e.amountMl !== null));

  /** Lückenlose Tagesreihe: Tage ohne Eintrag müssen als 0 erscheinen, nicht fehlen. */
  const dailyTotals = computed<DailyTotal[]>(() => {
    const tz = timezone();
    const today = localDayKey(new Date(), tz);

    const totals = new Map<string, { ml: number; count: number }>();
    for (const feed of feeds.value) {
      const key = localDayKey(feed.startedAt, tz);
      const current = totals.get(key) ?? { ml: 0, count: 0 };
      // Vollständig ausgespuckte Mahlzeiten zählen als Mahlzeit, aber nicht als
      // Menge — sonst weist die Tagessumme eine Aufnahme aus, die nie im Kind
      // angekommen ist, und die ml/kg-Kennzahl wird systematisch zu hoch.
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

    // Gleitendes Mittel erst ab dem siebten Tag — davor wäre es ein Mittel über
    // Nullen und würde einen Anstieg vortäuschen, den es nicht gab.
    for (let i = 6; i < series.length; i++) {
      const window = series.slice(i - 6, i + 1);
      series[i]!.rollingMl = Math.round(window.reduce((s, d) => s + d.totalMl, 0) / 7);
    }

    return series;
  });

  /** Punktwolke: x = Tagesindex, y = Minuten seit lokaler Mitternacht, r aus der Menge. */
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

  /** Windeln je Tag und Stunde, für das Raster. */
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
      // "Voll" schlägt "feucht" schlägt "leer" — die auffälligste Beobachtung
      // der Stunde soll die Zelle bestimmen.
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

  /** Kennzahlen für die Kacheln über den Diagrammen. */
  const summary = computed(() => {
    /**
     * Der HEUTIGE Tag bleibt aus allen Mittelwerten draußen.
     *
     * Er ist per Definition unvollständig — um 8 Uhr morgens stehen erst zwei
     * Mahlzeiten drin. Rechnet man ihn mit, zieht er den Wochenschnitt nach unten und
     * die App meldet "11 % weniger als letzte Woche", während die Balken sichtbar
     * steigen. Eine Kennzahl, die dem Diagramm daneben widerspricht, ist schlimmer
     * als gar keine.
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
      /** Veränderung zur Vorwoche in Prozent — beantwortet "trinkt sie mehr oder weniger". */
      trendPercent:
        avgMl !== null && avgPrevious !== null && avgPrevious > 0
          ? Math.round(((avgMl - avgPrevious) / avgPrevious) * 100)
          : null,
      /**
       * Milliliter je Kilogramm Körpergewicht. Die Zahl, die tatsächlich sagt, ob die
       * Menge mit dem Wachstum mithält — absolute Milliliter steigen ja ohnehin.
       */
      mlPerKg:
        avgMl !== null && latestWeight
          ? Math.round((avgMl / (latestWeight / 1000)) * 10) / 10
          : null,
    };
  });

  return { dailyTotals, rhythm, diaperGrid, summary };
}

function daysApart(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  return Math.round(
    (Date.UTC(ty, tm - 1, td, 12) - Date.UTC(fy, fm - 1, fd, 12)) / 86_400_000,
  );
}
