import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  { path: "/", name: "heute", component: () => import("./views/TodayView.vue") },
  { path: "/wochen", name: "wochen", component: () => import("./views/WeeksView.vue") },
  {
    path: "/meilensteine",
    name: "meilensteine",
    component: () => import("./views/MilestonesView.vue"),
  },
  { path: "/kurven", name: "kurven", component: () => import("./views/ChartsView.vue") },
  { path: "/vorrat", name: "vorrat", component: () => import("./views/SupplyView.vue") },
  { path: "/zahlen", name: "zahlen", component: () => import("./views/TotalsView.vue") },
  { path: "/reisen", name: "reisen", component: () => import("./views/TravelView.vue") },
  { path: "/verlauf", name: "verlauf", component: () => import("./views/HistoryView.vue") },
  {
    path: "/einstellungen",
    name: "einstellungen",
    component: () => import("./views/SettingsView.vue"),
  },
  // Der Einladungs-Link landet hier: /start?t=<token>
  { path: "/start", name: "start", component: () => import("./views/JoinView.vue") },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

/**
 * Nach einem Update zeigen alte Seitenverweise ins Leere.
 *
 * Die Ansichten werden bei Bedarf nachgeladen, und ihre Dateinamen enthalten einen
 * Inhalts-Hash. Wird eine neue Fassung ausgerollt, während ein Gerät noch die alte
 * offen hat, verweist dessen JavaScript auf Dateien, die es nicht mehr gibt: Der
 * Aufruf schlägt fehl, und der Navigationspunkt tut scheinbar NICHTS.
 *
 * Genau das ist passiert — betroffen waren nur die Punkte, deren Ansicht in dieser
 * Sitzung noch nicht geladen war; bereits geladene funktionierten weiter.
 *
 * Hier wird daraus ein hartes Neuladen auf die Zielseite. Für den Menschen davor
 * sieht das aus wie ein etwas langsamer Seitenwechsel statt wie ein toter Knopf.
 */
router.onError((error, to) => {
  const message = error instanceof Error ? error.message : String(error);
  const chunkMissing =
    /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
      message,
    );
  if (chunkMissing) {
    console.warn("Veraltete Fassung erkannt, lade neu:", to.fullPath);
    window.location.assign(to.fullPath);
  }
});
