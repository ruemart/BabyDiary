import { computed } from "vue";
import { localTimeLabel, type EntryType } from "@babydiary/shared";
import { useData } from "../stores/data.ts";
import { useElapsed } from "../i18n/format.ts";
import { diaperKey } from "../utils/diaperLabel.ts";
import type { LocalEntry } from "../db/local.ts";
import { useI18n } from "vue-i18n";

/**
 * When was the last one of this kind?
 *
 * The home screen answers that for the bottle and the nappy, and it is the question you
 * have again the moment you open the sheet — half the reason for opening it is "has
 * somebody already done this?". Repeating it inside the sheet saves closing it to go
 * and look, which is how an entry gets made twice.
 *
 * Deliberately WITHOUT naming the kind: the type is selected right above the line, and
 * "Letzte Flasche / Letztes Bad / Letzter Schlaf" would need the article to agree with
 * a gender the message files cannot know. "Zuletzt" is shorter and always right.
 */
export function useLastEntry(
  type: () => EntryType,
  now: () => Date,
  /** For a dose: which medicine. The last dose of ANOTHER medicine answers nothing. */
  medicineId: () => string | null = () => null,
) {
  const { t } = useI18n();
  const data = useData();
  const { since } = useElapsed();

  /** The same detail the home screen shows, for the kinds that have one. */
  function detailOf(entry: LocalEntry): string {
    const time = localTimeLabel(entry.startedAt, data.timezone);
    switch (entry.type) {
      case "feed":
        return t("today.feedDetail", { amount: entry.amountMl, time });
      case "diaper":
        return t("today.diaperDetail", { kind: t(diaperKey(entry.diaper)), time });
      default:
        return t("add.lastAt", { time });
    }
  }

  return computed(() => {
    const kind = type();
    const medicine = medicineId();
    // A dose with no medicine chosen yet has nothing to compare against.
    if (kind === "medicine" && !medicine) return null;

    const match = data.byTimeDesc.find(
      (e) => e.type === kind && (kind !== "medicine" || e.medicineId === medicine),
    );
    if (!match) return null;

    return { since: since(match.startedAt, now()), detail: detailOf(match) };
  });
}
