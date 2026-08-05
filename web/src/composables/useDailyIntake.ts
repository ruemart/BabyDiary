import { computed } from "vue";
import { localDayKey } from "@babymonitor/shared";
import type { LocalEntry } from "../db/local.ts";
import { useI18n } from "vue-i18n";


/**
 * Einordnung der heutigen Trinkmenge — bewusst KEIN Tagesziel.
 *
 * Der Wunsch war eine Bestätigung wie "heute genug getrunken", und die gibt es hier
 * auch. Was es NICHT gibt, ist ein Fortschrittsbalken auf eine Sollmenge, und das aus
 * einem sachlichen Grund:
 *
 * Die Ernährungsempfehlungen für Säuglinge (kindergesundheit-info.de des BZgA,
 * Gesund ins Leben) nennen die Mengenangaben ausdrücklich als grobe Orientierung und
 * betonen, dass das Kind selbst bestimmt, wie viel es trinkt — Hunger- und
 * Sättigungszeichen zählen mehr als jede Zahl. Ein Balken, der sich zu einem Ziel
 * füllt, würde genau das Gegenteil nahelegen und Eltern dazu bringen, gegen die
 * Signale ihres Kindes zu füttern.
 *
 * Deshalb: Die Zahl steht da, der Richtwert steht daneben, und wenn beides zusammen
 * passt, gibt es eine freundliche Bestätigung. Ein Rückstand wird NIE als Mangel
 * dargestellt — der Tag ist ja noch nicht vorbei, und morgens um neun ist jede
 * Tagesmenge zwangsläufig "zu wenig".
 */

export type IntakeStatus = {
  /** Was heute bisher angekommen ist (Ausgespucktes zählt nicht). */
  todayMl: number;
  /** Grober Richtwert für einen ganzen Tag, falls ein Gewicht bekannt ist. */
  orientationMl: number | null;
  /** Übliche Tagesmenge dieses Kindes, aus den letzten vollständigen Tagen. */
  usualMl: number | null;
  /** Freundliche Bestätigung — oder null, wenn es (noch) nichts zu bestätigen gibt. */
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
     * Deutsche Faustregel: Die Gesamtmilchmenge in 24 Stunden entspricht etwa einem
     * Sechstel des Körpergewichts. Gilt für die Zeit vor der Beikost; danach sinkt
     * der Milchanteil. Steht deshalb ausdrücklich als "etwa" in der Oberfläche.
     */
    const latestWeight = entries()
      .filter((e) => e.type === "growth" && e.weightG !== null)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]?.weightG;
    const orientationMl = latestWeight ? Math.round(latestWeight / 6 / 10) * 10 : null;

    // Der eigene Schnitt der letzten vollständigen Tage — aussagekräftiger als jeder
    // Bevölkerungswert, weil er zu genau diesem Kind gehört.
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

    // Bestätigen, sobald einer der beiden Bezugswerte erreicht ist. Nie das Gegenteil.
    let praise: string | null = null;
    if (usualMl !== null && todayMl >= usualMl) {
      praise = t("intake.praiseUsual");
    } else if (orientationMl !== null && todayMl >= orientationMl) {
      praise = t("intake.praiseGood");
    }

    return { todayMl, orientationMl, usualMl, praise };
  });
}

