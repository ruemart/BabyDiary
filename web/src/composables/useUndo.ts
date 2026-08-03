import { useToast } from "sit-onyx";
import { useData } from "../stores/data.ts";

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
  const toast = useToast();
  const data = useData();

  return function confirmWithUndo(headline: string, entryId: string): void {
    toast.show({
      headline,
      description: "Tippen zum Rückgängigmachen",
      color: "success",
      clickable: true,
      duration: 6000,
      onClick: () => void data.remove(entryId),
    });
  };
}
