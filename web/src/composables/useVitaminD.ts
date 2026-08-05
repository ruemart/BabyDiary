import { computed } from "vue";
import { localDayKey, localTimeLabel } from "@babymonitor/shared";
import type { LocalEntry } from "../db/local.ts";

/**
 * Wurde heute schon Vitamin D gegeben?
 *
 * Die tägliche Prophylaxe ist die Art Aufgabe, die genau deshalb vergessen wird, weil
 * sie so klein ist: kein eigener Anlass, keine Rückmeldung, und am Abend weiß niemand
 * mehr sicher, ob es nun passiert ist. Genau diese Frage beantwortet die Zeile.
 *
 * Der Ton bleibt sachlich. Ein vergessener Tag ist kein Notfall — die App erinnert,
 * sie mahnt nicht. Erst am Abend wird der Hinweis deutlicher, weil dann der Tag
 * tatsächlich knapp wird.
 */

export type VitaminDStatus = {
  given: boolean;
  /** Uhrzeit der Gabe, falls sie stattgefunden hat. */
  atLabel: string | null;
  /** Id der Mahlzeit, an der es hängt — zum Aufheben. */
  entryId: string | null;
  /** Id der letzten heutigen Mahlzeit — daran lässt es sich nachträglich setzen. */
  latestFeedId: string | null;
  /** Ab dem Abend deutlicher formuliert. */
  urgent: boolean;
};

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

    const given = todaysFeeds.find((e) => e.vitaminD);

    return {
      given: !!given,
      atLabel: given ? localTimeLabel(given.startedAt, tz) : null,
      entryId: given?.id ?? null,
      latestFeedId: todaysFeeds[0]?.id ?? null,
      // Ab 18 Uhr wird aus "steht noch aus" ein deutlicherer Hinweis.
      urgent: !given && now().getHours() >= 18,
    };
  });
}
