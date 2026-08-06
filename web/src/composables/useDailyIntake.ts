import { computed } from "vue";
import { localDayKey } from "@milo/shared";
import type { LocalEntry } from "../db/local.ts";
import { useI18n } from "vue-i18n";


/**
 * Context for today's intake — deliberately NOT a daily target.
 *
 * The request was for reassurance like "drunk enough today", and that is here. What is
 * NOT here is a progress bar towards a target amount, for a substantive reason:
 *
 * Infant feeding guidance (the German BZgA's kindergesundheit-info.de, Gesund ins Leben)
 * explicitly presents the amounts as a rough orientation and stresses that the child
 * decides how much it drinks — hunger and fullness cues count for more than any number.
 * A bar filling towards a goal would suggest the exact opposite and push parents to feed
 * against their child's signals.
 *
 * So: the number is there, the guide value stands next to it, and when the two fit
 * together there is a friendly confirmation. A shortfall is NEVER presented as a
 * deficiency — the day is not over, and at nine in the morning every daily amount is
 * necessarily "too little".
 */

export type IntakeStatus = {
  /** What has arrived today so far (what came back up does not count). */
  todayMl: number;
  /** A rough guide for a whole day, if a weight is known. */
  orientationMl: number | null;
  /** This child's usual daily amount, from the last complete days. */
  usualMl: number | null;
  /** Friendly confirmation — or null when there is (yet) nothing to confirm. */
  praise: string | null;
};

export function useDailyIntake(
  entries: () => LocalEntry[],
  timezone: () => string,
) {
  const { t } = useI18n();

  return computed<IntakeStatus>(() => {
    const tz = timezone();
    const today = localDayKey(new Date(), tz);

    const feeds = entries().filter((e) => e.type === "feed" && !e.spatUp);

    const todayMl = feeds
      .filter((f) => localDayKey(f.startedAt, tz) === today)
      .reduce((s, f) => s + (f.amountMl ?? 0), 0);

    /**
     * German rule of thumb: the total milk over 24 hours is about one sixth of body
     * weight. Applies before solids; afterwards the milk share drops. Which is why the
     * interface says "about" explicitly.
     */
    const latestWeight = entries()
      .filter((e) => e.type === "growth" && e.weightG !== null)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]?.weightG;
    const orientationMl = latestWeight ? Math.round(latestWeight / 6 / 10) * 10 : null;

    // Her own average over the last complete days — more meaningful than any
    // population figure, because it belongs to this child.
    const byDay = new Map<string, number>();
    for (const f of feeds) {
      const day = localDayKey(f.startedAt, tz);
      if (day === today) continue;
      byDay.set(day, (byDay.get(day) ?? 0) + (f.amountMl ?? 0));
    }
    const lastDays = [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-7)
      .map(([, ml]) => ml);
    const usualMl = lastDays.length >= 3
      ? Math.round(lastDays.reduce((s, v) => s + v, 0) / lastDays.length)
      : null;

    // Confirm as soon as either reference value is reached. Never the opposite.
    let praise: string | null = null;
    if (usualMl !== null && todayMl >= usualMl) {
      praise = t("intake.praiseUsual");
    } else if (orientationMl !== null && todayMl >= orientationMl) {
      praise = t("intake.praiseGood");
    }

    return { todayMl, orientationMl, usualMl, praise };
  });
}

