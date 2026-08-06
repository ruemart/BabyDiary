import { ref } from "vue";
import { useToast } from "sit-onyx";

/**
 * Whether routine confirmations are shown after an entry.
 *
 * Every tap answers with a short message — "nappy wet recorded", tap to undo. That is
 * right while the app is new and wrong once it is not: recording three nappies in a row
 * stacks three of them over the lower half of the screen, exactly where the buttons are.
 *
 * Switching them off is safe because the screen already answers without them: the status
 * card at the top jumps to "just now" the moment an entry lands. It is the honest
 * feedback channel — it shows the state, not an announcement about it.
 *
 * What this does NOT switch off is anything that reports a FAILURE — a photo that did not
 * upload, push notifications that could not be enabled. Those are not noise, and an app
 * that silently swallows them is broken rather than quiet. Nor does it touch the
 * acknowledgements on the settings screen itself, which follow a deliberate button press
 * on a screen nobody visits at night.
 *
 * Kept on the device rather than synced: whether the messages annoy someone is a property
 * of the person holding the phone, and the two parents may well disagree.
 */

const STORAGE_KEY = "bm.confirmations";

export const confirmations = ref<boolean>(localStorage.getItem(STORAGE_KEY) !== "off");

export function setConfirmations(on: boolean): void {
  confirmations.value = on;
  localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
}

/**
 * `toast.show` for routine confirmations — does nothing while they are switched off.
 *
 * Deliberately a separate call rather than a filter inside the toast system: which
 * messages are routine is a decision per call site, and reading it off the colour would
 * quietly silence the next warning that happens to be green.
 */
export function useConfirmToast() {
  const toast = useToast();
  return function confirm(options: Parameters<ReturnType<typeof useToast>["show"]>[0]): void {
    if (!confirmations.value) return;
    toast.show(options);
  };
}
