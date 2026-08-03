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

const onyx = createOnyx({
  i18n: { locale: "de-DE", messages: { "de-DE": onyxDeDE } },
  router,
});

createApp(App).use(createPinia()).use(onyx).use(router).mount("#app");
