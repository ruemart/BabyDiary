import { useI18n } from "vue-i18n";
import {
  elapsedSince,
  getDisplayLocale,
  type Elapsed,
  type MedicineUnit,
} from "@babydiary/shared";

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

/**
 * A dose as "2 drops", "half a pill", "5 ml" — or nothing at all.
 *
 * Nothing at all is a real case and not an error: a medicine may be set up without a
 * dose, and the entries that came over from the old vitamin D and drops flags have none
 * because those flags never recorded one. Everywhere a dose is shown it is therefore
 * optional, and the caller drops the line rather than printing "null drops".
 *
 * The number goes through Intl, so a half pill reads "0,5" in German and "0.5" in
 * English without a replace() anywhere.
 */
export function useDose() {
  const { t } = useI18n();

  return (amount: number | null, unit: MedicineUnit | null): string | null => {
    if (amount === null || unit === null) return null;
    const n = new Intl.NumberFormat(getDisplayLocale(), { maximumFractionDigits: 2 }).format(
      amount,
    );
    // Only exactly one is singular. Handing 0.5 to the plural rules would be asking a
    // question they were never written to answer — half a pill is "0,5 pills".
    return t(`medicine.unit.${unit}`, { n }, amount === 1 ? 1 : 2);
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
