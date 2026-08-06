import { computed } from "vue";
import type { EntryType } from "@milo/shared";
import { useElapsed } from "../i18n/format.ts";
import type { LocalEntry } from "../db/local.ts";
import { useI18n } from "vue-i18n";

/**
 * Everything currently running — sleep, illness, being away.
 *
 * The thinking behind it: a period is started when it begins. Asking for the end while
 * the child is falling asleep is exactly the kind of prompt that prevents an entry. So:
 * start with one tap, end later with one tap — and the same way for ALL kinds of period,
 * not as a special case for sleep.
 *
 * Several at once are explicitly possible: a child can fall ill on holiday and sleep
 * while doing so.
 */

export type OpenPeriod = {
  id: string;
  type: EntryType;
  /** What it says, e.g. "Sleep", "Cold", "Holiday · Sylt". */
  title: string;
  /** "seit 2 Std 10 Min" */
  since: string;
  /** For the colour coding. */
  kind: "sleep" | "illness" | "absence";
};

const PERIOD_TYPES = new Set<EntryType>(["sleep", "illness", "absence"]);

export function useOpenPeriods(entries: () => LocalEntry[], now: () => Date) {
  const { t } = useI18n();
  const { since } = useElapsed();

  return computed<OpenPeriod[]>(() =>
    entries()
      .filter((e) => PERIOD_TYPES.has(e.type) && e.endedAt === null)
      // Most recently started first — that is usually the one you want to end.
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((e) => ({
        id: e.id,
        type: e.type,
        title:
          e.type === "sleep"
            ? t("period.sleep")
            : [e.label, e.placeName].filter(Boolean).join(" · ") || t("period.generic"),
        since: since(e.startedAt, now()),
        kind: e.type as OpenPeriod["kind"],
      })),
  );
}
