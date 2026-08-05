import { computed } from "vue";
import { localDayKey } from "@babymonitor/shared";
import type { LocalEntry } from "../db/local.ts";
import { useI18n } from "vue-i18n";


/**
 * Hinweise auf Auffälligkeiten.
 *
 * DREI REGELN, an die sich das hier hält:
 *
 * 1. Beobachten, nicht beurteilen. Die App stellt fest, was in den Daten steht
 *    ("seit 9 Stunden keine nasse Windel"), und zieht keine Schlüsse daraus.
 *    Eine Diagnose kann sie nicht stellen, also tut sie auch nicht so.
 *
 * 2. Wo möglich am EIGENEN Verlauf messen. "Sonst alle 3 Stunden" sagt mehr als
 *    ein Bevölkerungsmittelwert, und es erzeugt weniger Fehlalarme bei einem
 *    gesunden Kind, das schlicht anders tickt.
 *
 * 3. Ruhig bleiben. Keine roten Balken, kein Alarmton, keine Zähler über verpasste
 *    Dinge. Eltern eines Neugeborenen sind ohnehin wachsam genug; eine App, die
 *    Angst macht, wird zu Recht gelöscht.
 *
 * Die Richtwerte stammen aus verbreiteter Elternliteratur und ersetzen keine
 * ärztliche Beurteilung. Das steht auch so in der Oberfläche.
 */

export type Alert = {
  id: string;
  /** `watch` = beobachten, `info` = Einordnung ohne Handlungsbedarf. */
  level: "watch" | "info";
  title: string;
  detail: string;
};

const HOUR = 60 * 60 * 1000;

export function useAlerts(
  entries: () => LocalEntry[],
  timezone: () => string,
  ageDays: () => number,
) {
  const { t } = useI18n();

  const now = () => Date.now();

  const feeds = computed(() =>
    entries()
      .filter((e) => e.type === "feed")
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
  );

  const diapers = computed(() =>
    entries()
      .filter((e) => e.type === "diaper")
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
  );

  /** Typischer Abstand zwischen zwei Ereignissen, aus den letzten 20 gemessen. */
  function medianGapHours(list: LocalEntry[]): number | null {
    const recent = list.slice(0, 20);
    if (recent.length < 5) return null;
    const gaps: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      const gap = Date.parse(recent[i - 1]!.startedAt) - Date.parse(recent[i]!.startedAt);
      if (gap > 0) gaps.push(gap / HOUR);
    }
    if (gaps.length === 0) return null;
    gaps.sort((a, b) => a - b);
    return gaps[Math.floor(gaps.length / 2)]!;
  }

  /** Tagessummen der letzten Tage, heute ausgenommen (unvollständig). */
  function dailyMl(): number[] {
    const tz = timezone();
    const today = localDayKey(new Date(), tz);
    const totals = new Map<string, number>();
    for (const feed of feeds.value) {
      if (feed.spatUp) continue;
      const day = localDayKey(feed.startedAt, tz);
      if (day === today) continue;
      totals.set(day, (totals.get(day) ?? 0) + (feed.amountMl ?? 0));
    }
    return [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, ml]) => ml);
  }

  const alerts = computed<Alert[]>(() => {
    const result: Alert[] = [];
    const nowMs = now();

    /* ── Windeln: der wichtigste Beobachtungspunkt ─────────────────────────── */

    const lastWet = diapers.value.find((d) => d.diaper === "wet" || d.diaper === "soiled");
    if (lastWet) {
      const hours = (nowMs - Date.parse(lastWet.startedAt)) / HOUR;
      const typical = medianGapHours(diapers.value);

      // Richtwert: Nach den ersten Lebenstagen gilt eine Pause von mehr als sechs
      // Stunden ohne nasse Windel als Beobachtungsgrund.
      const referenceHours = 6;
      // Eigener Verlauf: dreifacher üblicher Abstand — was für DIESES Kind auffällt.
      const ownHours = typical ? typical * 3 : Infinity;

      if (hours >= Math.min(referenceHours, ownHours) && ageDays() > 5) {
        result.push({
          id: "no-wet-diaper",
          level: "watch",
          title: t("alerts.noWetDiaper.title", { hours: Math.floor(hours) }),
          detail: typical
            ? t("alerts.noWetDiaper.detailTypical", { hours: typical.toFixed(1) })
            : t("alerts.noWetDiaper.detail"),
        });
      }
    }

    const tz = timezone();
    const today = localDayKey(new Date(), tz);
    const wetToday = diapers.value.filter(
      (d) => localDayKey(d.startedAt, tz) === today && d.diaper !== "empty",
    ).length;
    // Erst am Abend sinnvoll — morgens um neun sind zwei Windeln kein Befund.
    const hourOfDay = new Date().getHours();
    if (ageDays() > 5 && hourOfDay >= 20 && wetToday < 5) {
      result.push({
        id: "few-wet-today",
        level: "watch",
        title: t("alerts.fewWetToday.title", { n: wetToday }, wetToday),
        detail: t("alerts.fewWetToday.detail"),
      });
    }

    /* ── Trinken ───────────────────────────────────────────────────────────── */

    const lastFeed = feeds.value[0];
    if (lastFeed) {
      const hours = (nowMs - Date.parse(lastFeed.startedAt)) / HOUR;
      const typical = medianGapHours(feeds.value);
      if (typical && hours > typical * 2.5 && hours > 5) {
        result.push({
          id: "long-since-feed",
          level: "watch",
          title: t("alerts.longSinceFeed.title", { hours: Math.floor(hours) }),
          detail: t("alerts.longSinceFeed.detail", { typical: typical.toFixed(1) }),
        });
      }
    }

    const series = dailyMl();
    if (series.length >= 8) {
      const yesterday = series[series.length - 1]!;
      const baseline = series.slice(-8, -1);
      const average = baseline.reduce((s, v) => s + v, 0) / baseline.length;
      if (average > 0) {
        const change = (yesterday - average) / average;
        if (change < -0.25) {
          result.push({
            id: "intake-down",
            level: "watch",
            title: t("alerts.intakeDown.title", { percent: Math.round(Math.abs(change) * 100) }),
            detail: t("alerts.intakeDown.detail", { amount: yesterday, average: Math.round(average) }),
          });
        } else if (change > 0.3) {
          result.push({
            id: "intake-up",
            level: "info",
            title: t("alerts.intakeUp.title", { percent: Math.round(change * 100) }),
            detail: t("alerts.intakeUp.detail", { amount: yesterday, average: Math.round(average) }),
          });
        }
      }
    }

    return result;
  });

  return { alerts };
}

