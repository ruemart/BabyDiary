import { useConfirmToast } from "./useConfirmations.ts";
import { useData } from "../stores/data.ts";
import { useI18n } from "vue-i18n";

/**
 * Confirmation with a way to undo.
 *
 * Mis-taps are not the exception in this app but the normal case: the buttons are large,
 * it is operated one-handed, and it happens half asleep. Without a visible way back,
 * every wrong entry stays in the charts forever — because nobody goes into the history
 * list for that at night.
 *
 * The toast is clickable as a whole rather than carrying a small "undo" link: a
 * 20-pixel target is not hit in the dark.
 *
 * Silent when confirmations are switched off — see useConfirmations. Undoing then means
 * deleting the entry in the history, two taps away in the bottom bar. Slower, but the
 * person who switched the messages off has said they would rather have the screen.
 */
export function useUndo() {
  const { t } = useI18n();

  const confirm = useConfirmToast();
  const data = useData();

  /**
   * @param note Ersetzt den Standardhinweis, wenn es etwas Wichtigeres zu sagen gibt —
   *   etwa dass das andere Gerät gerade dasselbe eingetragen hat. Rückgängig geht es
   *   weiterhin durch Antippen; der Hinweis darauf tritt dann nur zurück.
   */
  return function confirmWithUndo(headline: string, entryId: string, note?: string): void {
    confirm({
      headline,
      description: note ?? t("undo.tapToUndo"),
      color: "success",
      clickable: true,
      // 4 s instead of the usual 6: recording three nappies in a row would otherwise
      // stack three toasts on top of each other, covering half the screen.
      duration: 4000,
      onClick: () => void data.remove(entryId),
    });
  };
}
