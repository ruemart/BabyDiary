import { computed } from "vue";
import { localDayKey } from "@milo/shared";
import type { LocalEntry } from "../db/local.ts";
import { useI18n } from "vue-i18n";


/**
 * Notes about things worth watching.
 *
 * THREE RULES this sticks to:
 *
 * 1. Observe, do not judge. The app states what the data says ("no wet nappy for
 *    9 hours") and draws no conclusions from it. It cannot make a diagnosis, so it does
 *    not pretend to.
 *
 * 2. Where possible, measure against the child's OWN history. "Usually every 3 hours"
 *    says more than a population average, and it produces fewer false alarms for a
 *    healthy child who simply runs differently.
 *
 * 3. Stay calm. No red bars, no alarm sound, no counters of missed things. The parents
 *    of a newborn are alert enough already; an app that frightens them gets deleted,
 *    rightly.
 *
 * The reference values come from common parenting literature and do not replace medical
 * assessment. The interface says so too.
 */

export type Alert = {
  id: string;
  /** `watch` = worth observing, `info` = context with nothing to do about it. */
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

  /** The typical gap between two events, measured from the last 20. */
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

  /** Daily totals of recent days, today excluded (incomplete). */
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

    /* ── Nappies: the most important thing to watch ────────────────────────── */

    const lastWet = diapers.value.find((d) => d.diaper === "wet" || d.diaper === "soiled");
    if (lastWet) {
      const hours = (nowMs - Date.parse(lastWet.startedAt)) / HOUR;
      const typical = medianGapHours(diapers.value);

      // Guide value: after the first days of life, a gap of more than six hours without
      // a wet nappy is considered worth watching.
      const referenceHours = 6;
      // Her own history: three times the usual gap — what is unusual for THIS child.
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
    // Only meaningful in the evening — at nine in the morning two nappies mean nothing.
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

