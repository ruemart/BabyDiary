import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { currentLocale } from "../i18n/index.ts";

/**
 * Notifications for this device.
 *
 * The settings deliberately hang off THE DEVICE: someone awake at night anyway wants the
 * reminder at night; someone sleeping next to them certainly does not. A shared setting
 * would inevitably serve one of the two badly.
 *
 * On iPhone and iPad web push only works when the app sits on the home screen — not in
 * Safari itself. The interface says so, otherwise you tap a button there in vain.
 */

export type PushState =
  | "unsupported"      // Browser kann kein Push
  | "needs-install"    // iOS: erst zum Home-Bildschirm hinzufügen
  | "server-disabled"  // Auf dem Server sind keine Schlüssel hinterlegt
  | "denied"           // Vom Nutzer im Browser abgelehnt
  | "off"
  | "on";

export type PushSettings = {
  leadMinutes: number;
  /** null bedeutet: rund um die Uhr benachrichtigen. */
  quietFromHour: number | null;
  quietToHour: number | null;
};

const SETTINGS_KEY = "bm.push.settings";

export const DEFAULT_SETTINGS: PushSettings = {
  leadMinutes: 10,
  // Quiet at night by default: for a newborn the child is the alarm clock, and a buzz
  // at three in the morning mainly wakes the one who is allowed to sleep.
  quietFromHour: 22,
  quietToHour: 6,
};

export function usePushNotifications() {
  const { t } = useI18n();

  const state = ref<PushState>("off");
  const busy = ref(false);
  const settings = ref<PushSettings>(readSettings());

  function readSettings(): PushSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  /** Is the app running as an installed application rather than in a browser tab? */
  function isStandalone(): boolean {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true
    );
  }

  function isIos(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }

  async function serverKey(): Promise<string | null> {
    try {
      const res = await fetch("/api/push/key", {
        credentials: "same-origin",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      return (await res.json()).publicKey ?? null;
    } catch {
      return null;
    }
  }

  async function refresh(): Promise<void> {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      // On iOS PushManager is missing while the app runs in the browser — that is not
      // missing browser support but a question of installation.
      state.value = isIos() && !isStandalone() ? "needs-install" : "unsupported";
      return;
    }
    if (!(await serverKey())) {
      state.value = "server-disabled";
      return;
    }
    if (Notification.permission === "denied") {
      state.value = "denied";
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    state.value = existing ? "on" : "off";
  }

  async function enable(): Promise<string | null> {
    busy.value = true;
    try {
      const key = await serverKey();
      if (!key) return t("push.noKeys");

      // The prompt MUST come from a direct user action — otherwise iOS and Safari
      // refuse it without asking.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        state.value = permission === "denied" ? "denied" : "off";
        return permission === "denied"
          ? t("push.denied")
          : null;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        // Send the locale: the server writes the message and has to know which
        // language this device wants to read it in.
        body: JSON.stringify({ ...subscription.toJSON(), ...settings.value, locale: currentLocale() }),
      });
      if (!res.ok) return "Die Anmeldung konnte nicht gespeichert werden.";

      state.value = "on";
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Unbekannter Fehler.";
    } finally {
      busy.value = false;
    }
  }

  async function disable(): Promise<void> {
    busy.value = true;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => {});
        await subscription.unsubscribe();
      }
      state.value = "off";
    } finally {
      busy.value = false;
    }
  }

  /** Change settings and, if subscribed, pass them straight on to the server. */
  async function saveSettings(next: PushSettings): Promise<void> {
    settings.value = next;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    if (state.value !== "on") return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ ...subscription.toJSON(), ...next, locale: currentLocale() }),
    }).catch(() => {});
  }

  async function sendTest(): Promise<boolean> {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return false;
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => null);
    return !!res?.ok;
  }

  return { state, busy, settings, refresh, enable, disable, saveSettings, sendTest };
}

/**
 * The VAPID key arrives as base64url, `applicationServerKey` wants raw bytes. Without
 * this conversion the browser refuses the subscription tersely.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
