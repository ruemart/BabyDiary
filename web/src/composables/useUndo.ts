import { useToast } from "sit-onyx";
import { useData } from "../stores/data.ts";
import { useI18n } from "vue-i18n";

/**
 * Bestätigung mit Rückgängig-Möglichkeit.
 *
 * Fehltaps sind bei dieser App nicht die Ausnahme, sondern der Normalfall: Die Knöpfe
 * sind groß, die Bedienung ist einhändig, und sie passiert im Halbschlaf. Ohne einen
 * sichtbaren Rückweg bleibt jeder Fehleintrag für immer in den Auswertungen stehen —
 * denn niemand geht dafür nachts in die Verlaufsliste.
 *
 * Der Toast ist als Ganzes anklickbar statt mit einem kleinen "Rückgängig"-Link:
 * Ein 20-Pixel-Ziel trifft man im Dunkeln nicht.
 */
export function useUndo() {
  const { t } = useI18n();

  const toast = useToast();
  const data = useData();

  return function confirmWithUndo(headline: string, entryId: string): void {
    toast.show({
      headline,
      description: t("undo.tapToUndo"),
      color: "success",
      clickable: true,
      // 4 s statt der üblichen 6: Wer drei Windeln hintereinander einträgt, stapelt
      // sonst drei Toasts übereinander, die den halben Bildschirm verdecken.
      duration: 4000,
      onClick: () => void data.remove(entryId),
    });
  };
}
