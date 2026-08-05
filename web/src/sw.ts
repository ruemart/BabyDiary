/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { clientsClaim } from "workbox-core";
import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

/**
 * Eigener Service Worker statt des erzeugten.
 *
 * Der Grund ist einzig die Push-Behandlung: Ein automatisch erzeugter Worker kann
 * keinen `push`-Empfänger enthalten. Alles andere — Vorabspeichern, Aktualisierung,
 * Bildzwischenspeicher — bleibt inhaltlich, wie es war.
 */

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: { url: string; revision: string | null }[];
};

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Bilder sind unveränderlich (die Id steckt im Dateinamen), also dauerhaft behalten —
// dann ist die Galerie auch offline vollständig.
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/media/"),
  new CacheFirst({
    cacheName: "bm-media",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  }),
);

/* ── Benachrichtigungen ─────────────────────────────────────────────────────── */

type PushPayload = { title: string; body: string; tag?: string; url?: string };

self.addEventListener("push", (event) => {
  let payload: PushPayload = { title: "BabyMonitor", body: "" };
  try {
    if (event.data) payload = { ...payload, ...(event.data.json() as PushPayload) };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      // Gleiches `tag` ersetzt eine ältere Meldung, statt sie zu stapeln: Zwei
      // Erinnerungen an dieselbe Flasche untereinander wären nur Lärm.
      tag: payload.tag ?? "babymonitor",
      renotify: false,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Keine Vibration und kein `requireInteraction`: Das hier ist eine
      // Erinnerung, kein Alarm — und nachts liegt das Telefon neben zwei Menschen,
      // die jede Minute Schlaf brauchen.
      silent: false,
      data: { url: payload.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data as { url?: string })?.url ?? "/";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Ein bereits offenes Fenster nach vorn holen, statt ein zweites zu öffnen.
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
