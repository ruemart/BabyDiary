import { useI18n } from "vue-i18n";
import { elapsedSince, type Elapsed } from "@babymonitor/shared";

/**
 * Verstrichene Zeit in Worte fassen — die Worte kommen aus den Sprachdateien.
 *
 * `elapsedSince` liefert bewusst nur Zahlen und eine Einheit; erst hier wird daraus
 * ein Satz. Damit steht keine einzige Formulierung im gemeinsamen Modul, das auch der
 * Server benutzt.
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
    /** Aus einem Zeitstempel direkt: „vor 2 Std 15 Min". */
    since: (iso: string, now?: Date) => format(elapsedSince(iso, now)),
    format,
  };
}

/** Eine Dauer in Minuten als „3 Std 20 Min" — ohne „vor". */
export function useDuration() {
  const { t } = useI18n();

  return (minutes: number): string => {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (!h) return t("duration.minutes", { n: m });
    return m ? t("duration.hoursMinutes", { h, m }) : t("duration.hours", { n: h });
  };
}
