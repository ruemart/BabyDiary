import { computed } from "vue";
import { ageInDays, localDayKey } from "@babydiary/shared";
import type { LocalEntry } from "../db/local.ts";
import { isEvent } from "../utils/entryFields.ts";

/**
 * The numbers to browse: totals, averages, records.
 *
 * Unlike the charts this answers no question — it is there to look at. Which is why it
 * also holds things like the longest night slept through, which say nothing medically
 * but are fondly remembered later.
 */

export type Record_ = { labelKey: string; value: string; detail?: string };

export function useTotals(
  rawEntries: () => LocalEntry[],
  timezone: () => string,
  birthDate: () => string | null,
) {
  /**
   * Only what actually happened. A medicine set up under Settings is an entry, but not
   * one of these numbers — see `isEvent`.
   */
  const entries = () => rawEntries().filter(isEvent);

  const feeds = computed(() => entries().filter((e) => e.type === "feed"));
  const diapers = computed(() => entries().filter((e) => e.type === "diaper"));
  const sleeps = computed(() => entries().filter((e) => e.type === "sleep" && e.endedAt));

  /** Days with at least one entry — the basis of every average. */
  const activeDays = computed(() => {
    const tz = timezone();
    return new Set(entries().map((e) => localDayKey(e.startedAt, tz))).size;
  });

  const totals = computed(() => {
    const tz = timezone();
    const birth = birthDate();

    const totalMl = feeds.value.reduce((s, f) => s + (f.spatUp ? 0 : (f.amountMl ?? 0)), 0);
    const sleepMinutes = sleeps.value.reduce(
      (s, e) => s + (Date.parse(e.endedAt!) - Date.parse(e.startedAt)) / 60_000,
      0,
    );

    const days = Math.max(1, activeDays.value);

    return {
      feeds: feeds.value.length,
      totalMl,
      /** In litres, because "42 litres" is more tangible than "42,000 ml". */
      totalLiters: Math.round(totalMl / 100) / 10,
      diapers: diapers.value.length,
      soiled: diapers.value.filter((d) => d.diaper === "soiled" || d.diaper === "both").length,
      sleepHours: Math.round(sleepMinutes / 60),
      photos: entries().filter((e) => e.type === "photo").length,
      baths: entries().filter((e) => e.type === "bath").length,
      milestones: entries().filter((e) => e.type === "milestone").length,
      daysTracked: activeDays.value,
      ageDays: birth ? ageInDays(birth, new Date(), tz) : null,

      avgFeedsPerDay: Math.round((feeds.value.length / days) * 10) / 10,
      avgMlPerDay: Math.round(totalMl / days),
      avgDiapersPerDay: Math.round((diapers.value.length / days) * 10) / 10,
      avgMlPerFeed: feeds.value.length
        ? Math.round(totalMl / feeds.value.filter((f) => !f.spatUp).length)
        : 0,
    };
  });

  const records = computed<Record_[]>(() => {
    const tz = timezone();
    const out: Record_[] = [];

    const biggest = [...feeds.value]
      .filter((f) => !f.spatUp)
      .sort((a, b) => (b.amountMl ?? 0) - (a.amountMl ?? 0))[0];
    if (biggest) {
      out.push({
        labelKey: "record.biggestFeed",
        value: `${biggest.amountMl} ml`,
        detail: localDayKey(biggest.startedAt, tz).split("-").reverse().join("."),
      });
    }

    const longestSleep = [...sleeps.value].sort(
      (a, b) =>
        Date.parse(b.endedAt!) - Date.parse(b.startedAt) -
        (Date.parse(a.endedAt!) - Date.parse(a.startedAt)),
    )[0];
    if (longestSleep) {
      const minutes = Math.round(
        (Date.parse(longestSleep.endedAt!) - Date.parse(longestSleep.startedAt)) / 60_000,
      );
      out.push({
        labelKey: "record.longestSleep",
        value: `${Math.floor(minutes / 60)} Std ${minutes % 60} Min`,
        detail: localDayKey(longestSleep.startedAt, tz).split("-").reverse().join("."),
      });
    }

    /**
     * The longest gap between two feeds at night.
     * Medically irrelevant, but the number parents actually celebrate.
     */
    const sorted = [...feeds.value].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    let longestGap = 0;
    let gapDay = "";
    for (let i = 1; i < sorted.length; i++) {
      const gap = Date.parse(sorted[i]!.startedAt) - Date.parse(sorted[i - 1]!.startedAt);
      if (gap > longestGap) {
        longestGap = gap;
        gapDay = localDayKey(sorted[i - 1]!.startedAt, tz);
      }
    }
    if (longestGap > 0) {
      const minutes = Math.round(longestGap / 60_000);
      out.push({
        labelKey: "record.longestGap",
        value: `${Math.floor(minutes / 60)} Std ${minutes % 60} Min`,
        detail: `ohne Mahlzeit · ab ${gapDay.split("-").reverse().join(".")}`,
      });
    }

    const bestDay = new Map<string, number>();
    for (const f of feeds.value) {
      if (f.spatUp) continue;
      const day = localDayKey(f.startedAt, tz);
      bestDay.set(day, (bestDay.get(day) ?? 0) + (f.amountMl ?? 0));
    }
    const top = [...bestDay.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) {
      out.push({
        labelKey: "record.strongestDay",
        value: `${top[1]} ml`,
        detail: top[0].split("-").reverse().join("."),
      });
    }

    return out;
  });

  /** Who actually records more? Pure fun — and still fun. */
  const byPerson = computed(() => {
    const counts = new Map<string, number>();
    for (const e of entries()) counts.set(e.createdBy, (counts.get(e.createdBy) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  });

  return { totals, records, byPerson };
}
