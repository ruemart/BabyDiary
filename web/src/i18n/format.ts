import { useI18n } from "vue-i18n";
import { elapsedSince, type Elapsed } from "@milo/shared";

/**
 * Put elapsed time into words — the words come from the language files.
 *
 * `elapsedSince` deliberately returns only numbers and a unit; only here does that
 * become a sentence. That way not a single phrasing sits in the shared module the server
 * also uses.
 */
export function useElapsed() {
  const { t } = useI18n();

  function format(elapsed: Elapsed): string {
    switch (elapsed.unit) {
      case "now":
        return t("time.now");
      case "minutes":
        return t("time.minutes", { n: elapsed.minutes });
      case "hours":
        return t("time.hours", { n: elapsed.hours });
      case "hoursMinutes":
        return t("time.hoursMinutes", { h: elapsed.hours, m: elapsed.minutes });
      case "days":
        return t("time.days", { n: elapsed.days }, elapsed.days);
    }
  }

  return {
    /** Straight from a timestamp: "2 h 15 min ago". */
    since: (iso: string, now?: Date) => format(elapsedSince(iso, now)),
    format,
  };
}

/** A duration in minutes as "3 h 20 min" — without "ago". */
export function useDuration() {
  const { t } = useI18n();

  return (minutes: number): string => {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (!h) return t("duration.minutes", { n: m });
    return m ? t("duration.hoursMinutes", { h, m }) : t("duration.hours", { n: h });
  };
}
