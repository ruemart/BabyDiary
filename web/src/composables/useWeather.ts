import { ref } from "vue";
import type { WeatherDay } from "@babydiary/shared";

/**
 * Daily temperatures from our own server (which fetches them from Open-Meteo and keeps
 * them).
 *
 * Deliberately NOT in the offline store: the weather is an extra. If it is missing, a
 * track is missing — data entry carries on unaffected.
 */
const days = ref<WeatherDay[]>([]);
const byDay = ref(new Map<string, WeatherDay>());
let loaded = false;

export function useWeather() {
  async function load(force = false): Promise<void> {
    if (loaded && !force) return;
    try {
      const res = await fetch("/api/weather", {
        credentials: "same-origin",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      days.value = await res.json();
      byDay.value = new Map(days.value.map((d) => [d.day, d]));
      loaded = true;
    } catch {
      // No network, or the service is down — it simply stays empty.
    }
  }

  return { days, byDay, load };
}

/** Wording for the display. Thresholds deliberately coarse — this is context, not metrology. */
export function describeTemperature(tmax: number | null | undefined): string | null {
  if (tmax === null || tmax === undefined) return null;
  if (tmax >= 30) return "weather.veryHot";
  if (tmax >= 25) return "weather.hot";
  if (tmax >= 18) return "weather.mild";
  if (tmax >= 8) return "weather.cool";
  return "weather.cold";
}
