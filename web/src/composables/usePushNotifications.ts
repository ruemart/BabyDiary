import { ref } from "vue";

/**
 * Benachrichtigungen für dieses Gerät.
 *
 * Die Einstellungen hängen bewusst AM GERÄT: Wer nachts ohnehin wach ist, will die
 * Erinnerung auch nachts; wer daneben schläft, ganz sicher nicht. Eine gemeinsame
 * Einstellung würde zwangsläufig einen von beiden falsch bedienen.
 *
 * Auf dem iPhone und iPad funktioniert Web Push NUR, wenn die App auf dem
 * Home-Bildschirm liegt — in Safari selbst nicht. Das steht auch so in der
 * Oberfläche, sonst tippt man dort vergeblich auf einen Knopf.
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
  // Standardmäßig nachts still: Für ein Neugeborenes ist das Kind der Wecker, und
  // ein Summen um drei Uhr weckt vor allem den, der gerade schlafen darf.
  quietFromHour: 22,
  quietToHour: 6,
};

export function usePushNotifications() {
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

  /** Läuft die App als installierte Anwendung statt im Browser-Tab? */
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
      // Auf iOS fehlt PushManager, solange die App im Browser läuft — das ist kein
      // fehlender Browser-Support, sondern eine Installationsfrage.
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
      if (!key) return "Auf dem Server sind keine Schlüssel hinterlegt.";

      // Die Abfrage MUSS aus einer direkten Nutzeraktion kommen — sonst lehnen
      // iOS und Safari sie ohne Rückfrage ab.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        state.value = permission === "denied" ? "denied" : "off";
        return permission === "denied"
          ? "Benachrichtigungen wurden im Browser abgelehnt. Das lässt sich nur in den Browser-Einstellungen wieder ändern."
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
        body: JSON.stringify({ ...subscription.toJSON(), ...settings.value }),
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

  /** Einstellungen ändern und, falls angemeldet, gleich zum Server durchreichen. */
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
      body: JSON.stringify({ ...subscription.toJSON(), ...next }),
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
 * Der VAPID-Schlüssel kommt als base64url, `applicationServerKey` will rohe Bytes.
 * Ohne diese Umwandlung lehnt der Browser die Anmeldung wortkarg ab.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
