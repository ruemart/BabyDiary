import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

/**
 * Merker: Das Nachladen einer Ansicht ist gescheitert.
 *
 * Wird von `view()` gesetzt und von `router.onError` ausgewertet. Der Umweg über eine
 * Variable statt über den Fehlertext ist der eigentliche Punkt dieser Datei — siehe
 * die Erklärung bei `router.onError`.
 */
let viewFailedToLoad = false;

/**
 * Ansicht bei Bedarf nachladen und einen Fehlschlag festhalten.
 *
 * Ein zweiter Versuch an dieser Stelle wäre wirkungslos: Ist ein Modul einmal
 * gescheitert, merkt sich das Dokument genau das und gibt beim nächsten `import()`
 * dieselbe Ablehnung zurück, ohne überhaupt noch einmal anzufragen. Im Prüflauf
 * nachgemessen — der zweite Aufruf löste keine einzige Anfrage aus. Was hier hilft,
 * ist ausschließlich ein neues Dokument, also das harte Neuladen unten.
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
  {
    path: "/einstellungen",
    name: "einstellungen",
    component: view(() => import("./views/SettingsView.vue")),
  },
  // Der Einladungs-Link landet hier: /start?t=<token>
  { path: "/start", name: "start", component: view(() => import("./views/JoinView.vue")) },
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
 * Aufruf schlägt fehl, und der Navigationspunkt tut scheinbar NICHTS. Betroffen sind
 * nur Punkte, deren Ansicht in dieser Sitzung noch nicht geladen war.
 *
 * Hier wird daraus ein hartes Neuladen auf die Zielseite. Für den Menschen davor sieht
 * das aus wie ein etwas langsamer Seitenwechsel statt wie ein toter Knopf.
 *
 * ENTSCHEIDEND: erkannt wird das über einen Merker aus `view()`, NICHT über den
 * Fehlertext. Vorher stand hier ein Abgleich mit "Failed to fetch dynamically imported
 * module" und zwei weiteren Formulierungen — und genau daran ist es auf dem iPhone
 * gescheitert: Safari formuliert denselben Fehler anders, der Abgleich griff nicht, und
 * die Knöpfe blieben tot. Jeder Browser darf seinen Fehler nennen, wie er will; ob das
 * Nachladen gescheitert ist, weiß `view()` ohnehin sicherer als jede Textprüfung.
 */
router.onError((error, to) => {
  if (!viewFailedToLoad) return;
  viewFailedToLoad = false;

  // Schutz vor einer Endlosschleife: Wenn das Neuladen die Lage nicht bessert — etwa
  // weil der Server wirklich nicht erreichbar ist — darf die App nicht dauerhaft
  // neu starten. Dann lieber sichtbar stehen bleiben.
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
