import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

/**
 * A marker: loading a view failed.
 *
 * Set by `view()` and evaluated by `router.onError`. The detour through a variable
 * rather than the error text is the actual point of this file — see the explanation at
 * `router.onError`.
 */
let viewFailedToLoad = false;

/**
 * Load a view on demand and record a failure.
 *
 * A second attempt here would be useless: once a module has failed, the document
 * remembers exactly that and returns the same rejection on the next `import()` without
 * even asking again. Measured in a test run — the second call triggered not a single
 * request. What helps here is only a new document, i.e. the hard reload below.
 */
function view(load: () => Promise<unknown>) {
  return async () => {
    try {
      return await load();
    } catch (error) {
      viewFailedToLoad = true;
      throw error;
    }
  };
}

const routes: RouteRecordRaw[] = [
  { path: "/", name: "heute", component: view(() => import("./views/TodayView.vue")) },
  { path: "/wochen", name: "wochen", component: view(() => import("./views/WeeksView.vue")) },
  {
    path: "/meilensteine",
    name: "meilensteine",
    component: view(() => import("./views/MilestonesView.vue")),
  },
  { path: "/kurven", name: "kurven", component: view(() => import("./views/ChartsView.vue")) },
  { path: "/vorrat", name: "vorrat", component: view(() => import("./views/SupplyView.vue")) },
  { path: "/zahlen", name: "zahlen", component: view(() => import("./views/TotalsView.vue")) },
  { path: "/reisen", name: "reisen", component: view(() => import("./views/TravelView.vue")) },
  { path: "/verlauf", name: "verlauf", component: view(() => import("./views/HistoryView.vue")) },
  { path: "/mehr", name: "mehr", component: view(() => import("./views/MoreView.vue")) },
  {
    path: "/einstellungen",
    name: "einstellungen",
    component: view(() => import("./views/SettingsView.vue")),
  },
  // The invite link lands here: /start?t=<token>
  { path: "/start", name: "start", component: view(() => import("./views/JoinView.vue")) },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

/**
 * After an update, old page references point into the void.
 *
 * The views are loaded on demand and their file names contain a content hash. When a new
 * version is rolled out while a device still has the old one open, its JavaScript points
 * at files that no longer exist: the call fails and the navigation item apparently does
 * NOTHING. Only items whose view has not been loaded in this session are affected.
 *
 * Here that becomes a hard reload onto the target page. To the person in front of it,
 * that looks like a slightly slow page change rather than a dead button.
 *
 * CRUCIAL: this is detected through a marker from `view()`, NOT through the error text.
 * There used to be a comparison against "Failed to fetch dynamically imported module"
 * and two other phrasings here — and that is exactly what failed on the iPhone: Safari
 * phrases the same error differently, the comparison did not match, and the buttons
 * stayed dead. Every browser may name its error however it likes; whether loading failed
 * is something `view()` knows more reliably than any text check.
 */
router.onError((error, to) => {
  if (!viewFailedToLoad) return;
  viewFailedToLoad = false;

  // A guard against an endless loop: if reloading does not improve matters — because
  // the server really is unreachable, say — the app must not restart forever. Better to
  // stand still visibly.
  const marker = `bm.reload:${to.fullPath}`;
  const last = Number(sessionStorage.getItem(marker) ?? 0);
  if (Date.now() - last < 15_000) {
    console.error("Reloading did not help:", to.fullPath, error);
    return;
  }
  sessionStorage.setItem(marker, String(Date.now()));

  console.warn("Stale version detected, reloading:", to.fullPath);
  window.location.assign(to.fullPath);
});
