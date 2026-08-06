/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { clientsClaim } from "workbox-core";
import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

/**
 * Our own service worker instead of the generated one.
 *
 * The only reason is push handling: an automatically generated worker cannot contain a
 * `push` listener. Everything else — precaching, updating, the image cache — stays as it
 * was in substance.
 */

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: { url: string; revision: string | null }[];
};

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Images are immutable (the id is in the file name), so keep them permanently — that
// way the gallery is complete offline too.
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
  let payload: PushPayload = { title: "Milo", body: "" };
  try {
    if (event.data) payload = { ...payload, ...(event.data.json() as PushPayload) };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      // The same `tag` replaces an older message instead of stacking it: two reminders
      // about the same bottle underneath each other would just be noise.
      tag: payload.tag ?? "milo",
      renotify: false,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // No vibration and no `requireInteraction`: this is a reminder, not an alarm —
      // and at night the phone lies next to two people who need every minute of sleep.
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
      // Bring an already open window to the front instead of opening a second one.
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
