import { createApp } from "vue";
import { createPinia } from "pinia";
import { createOnyx } from "sit-onyx";
import onyxDeDE from "sit-onyx/locales/de-DE.json";
import onyxEnUS from "sit-onyx/locales/en-US.json";

import "sit-onyx/style.css";
import "sit-onyx/global.css";
import "@fontsource-variable/source-sans-3/index.css";
import "@fontsource-variable/bricolage-grotesque/index.css";
// Nach Onyx laden: unsere Datei ersetzt dessen Primitivrampen.
import "./styles/theme.css";

import App from "./App.vue";
import { router } from "./router.ts";
import { i18n, currentLocale } from "./i18n/index.ts";
import { startAppearanceWatcher } from "./composables/useAppearance.ts";

startAppearanceWatcher();

/**
 * React to a new version instead of only seeing it on the next cold start.
 *
 * The service worker does take over immediately, but the running page keeps its old
 * module graph — including references to files that no longer exist. So look actively
 * once here and reload on the change.
 */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Only reload when a service worker was already active — otherwise the very first
    // installation would restart the page for no reason.
    if (sessionStorage.getItem("bm.swReady")) location.reload();
  });
  void navigator.serviceWorker.ready.then(() => sessionStorage.setItem("bm.swReady", "1"));

  // Check for a new version when the app comes back.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void navigator.serviceWorker.getRegistration().then((r) => r?.update());
  });
}

/**
 * Onyx gets the same language as the app.
 *
 * Otherwise foreign controls would sit in the middle of our own interface — a German
 * "Schließen" next to an English "Close" is immediately jarring.
 */
const ONYX_LOCALES = { en: "en-US", de: "de-DE" } as const;

const onyx = createOnyx({
  i18n: {
    locale: ONYX_LOCALES[currentLocale()],
    messages: { "en-US": onyxEnUS, "de-DE": onyxDeDE },
  },
  router,
});

createApp(App).use(createPinia()).use(i18n).use(onyx).use(router).mount("#app");
