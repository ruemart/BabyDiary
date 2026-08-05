import { ref } from "vue";

/**
 * Day and night appearance.
 *
 * The switch depends on the clock, not (only) on the system setting. The reason: the
 * most important moment of use for this app is the night feed in a darkened room. A
 * brightly lit display is not just unpleasant there, it measurably makes falling back
 * asleep harder — so night mode kicks in automatically even when the phone runs in
 * light mode during the day.
 *
 * Anyone who dislikes that can pin it to light or dark in Settings.
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
  // Tint the address bar, or the status bar of the installed app, along with it —
  // otherwise a bright strip stays at the top in a dark room.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", night ? "#16120f" : "#f7f4ee");
}

export function startAppearanceWatcher(): void {
  apply();
  // Check every minute: the switch should also happen while the app lies open.
  setInterval(apply, 60_000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) apply();
  });
}
