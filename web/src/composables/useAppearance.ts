import { ref } from "vue";

/**
 * Tag- und Nachtdarstellung.
 *
 * Die Umschaltung hängt an der Uhrzeit, nicht (nur) an der Systemeinstellung. Grund:
 * Der wichtigste Bedienmoment dieser App ist die nächtliche Fütterung im abgedunkelten
 * Zimmer. Ein hell leuchtendes Display ist dort nicht nur unangenehm, es macht das
 * Wiedereinschlafen messbar schwerer — deshalb wird die Nachtdarstellung automatisch
 * aktiv, auch wenn das Telefon tagsüber im Hellmodus läuft.
 *
 * Wer das nicht mag, stellt in den Einstellungen fest auf hell oder dunkel.
 */

export type AppearanceSetting = "auto" | "day" | "night";

const STORAGE_KEY = "bm.appearance";
const NIGHT_STARTS_AT = 20; // ab 20:00 Uhr
const NIGHT_ENDS_AT = 7; //   bis 07:00 Uhr

export const appearance = ref<AppearanceSetting>(readSetting());
export const isNight = ref(false);

function readSetting(): AppearanceSetting {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "day" || stored === "night" ? stored : "auto";
}

export function setAppearance(next: AppearanceSetting): void {
  appearance.value = next;
  localStorage.setItem(STORAGE_KEY, next);
  apply();
}

function nightByClock(now = new Date()): boolean {
  const hour = now.getHours();
  return hour >= NIGHT_STARTS_AT || hour < NIGHT_ENDS_AT;
}

function apply(): void {
  const night =
    appearance.value === "auto" ? nightByClock() : appearance.value === "night";
  isNight.value = night;

  document.documentElement.dataset["mode"] = night ? "night" : "day";
  // Die Adressleiste bzw. die Statusleiste der installierten App mitfärben —
  // sonst bleibt oben ein heller Streifen im dunklen Zimmer stehen.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", night ? "#16120f" : "#f7f4ee");
}

export function startAppearanceWatcher(): void {
  apply();
  // Jede Minute prüfen: die Umschaltung soll auch passieren, während die App offen liegt.
  setInterval(apply, 60_000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) apply();
  });
}
