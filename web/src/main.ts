import { createApp } from "vue";
import { createPinia } from "pinia";
import { createOnyx } from "sit-onyx";
import onyxDeDE from "sit-onyx/locales/de-DE.json";

import "sit-onyx/style.css";
import "sit-onyx/global.css";
import "@fontsource-variable/source-sans-3/index.css";
import "@fontsource-variable/bricolage-grotesque/index.css";
// Nach Onyx laden: unsere Datei ersetzt dessen Primitivrampen.
import "./styles/theme.css";

import App from "./App.vue";
import { router } from "./router.ts";
import { startAppearanceWatcher } from "./composables/useAppearance.ts";

startAppearanceWatcher();

/**
 * Auf eine neue Fassung reagieren, statt sie erst beim nächsten Kaltstart zu sehen.
 *
 * Der Service Worker übernimmt zwar sofort, aber die laufende Seite behält ihren
 * alten Modulbaum — inklusive der Verweise auf Dateien, die es nicht mehr gibt.
 * Deshalb hier einmal aktiv nachsehen und beim Wechsel neu laden.
 */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Nur neu laden, wenn schon einmal ein Service Worker aktiv war — sonst würde
    // die allererste Installation die Seite unnötig neu starten.
    if (sessionStorage.getItem("bm.swReady")) location.reload();
  });
  void navigator.serviceWorker.ready.then(() => sessionStorage.setItem("bm.swReady", "1"));

  // Beim Zurückholen der App nach einer neuen Fassung schauen.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void navigator.serviceWorker.getRegistration().then((r) => r?.update());
  });
}

const onyx = createOnyx({
  i18n: { locale: "de-DE", messages: { "de-DE": onyxDeDE } },
  router,
});

createApp(App).use(createPinia()).use(onyx).use(router).mount("#app");
