import { computed } from "vue";
import { localDayKey, localTimeLabel } from "@babydiary/shared";
import type { LocalEntry } from "../db/local.ts";

/**
 * Has vitamin D already been given today?
 *
 * The daily prophylaxis is the kind of task that gets forgotten precisely because it is
 * so small: no occasion of its own, no feedback, and by the evening nobody is sure any
 * more whether it happened. That is the question this line answers.
 *
 * The tone stays matter-of-fact. A forgotten day is not an emergency — the app reminds,
 * it does not nag. Only in the evening does the note get clearer, because by then the
 * day really is running out.
 */

export type VitaminDStatus = {
  given: boolean;
  /** Time it was given, if it happened. */
  atLabel: string | null;
  /** Id of the feed it hangs off — for taking it back. */
  entryId: string | null;
  /** Id of today's last feed — it can be set on that one retrospectively. */
  latestFeedId: string | null;
  /** Ab dem Abend deutlicher formuliert. */
  urgent: boolean;
};

/**
 * The feed that carries the vitamin D on A PARTICULAR DAY.
 *
 * Deliberately asked by day and not by "today": when adding a past entry the date of the
 * entry counts. Someone adding yesterday's bottle must be able to tick YESTERDAY — even
 * when one is already ticked for today.
 */
export function vitaminHolderOn(
  entries: LocalEntry[],
  timezone: string,
  dayKey: string,
): LocalEntry | undefined {
  return entries.find(
    (e) => e.type === "feed" && e.vitaminD && localDayKey(e.startedAt, timezone) === dayKey,
  );
}

export function useVitaminD(
  entries: () => LocalEntry[],
  timezone: () => string,
  now: () => Date,
) {
  return computed<VitaminDStatus>(() => {
    const tz = timezone();
    const today = localDayKey(now(), tz);

    const todaysFeeds = entries()
      .filter((e) => e.type === "feed" && localDayKey(e.startedAt, tz) === today)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    const given = vitaminHolderOn(todaysFeeds, tz, today);

    return {
      given: !!given,
      atLabel: given ? localTimeLabel(given.startedAt, tz) : null,
      entryId: given?.id ?? null,
      latestFeedId: todaysFeeds[0]?.id ?? null,
      // From 6 pm on, "still outstanding" becomes a clearer note.
      urgent: !given && now().getHours() >= 18,
    };
  });
}
