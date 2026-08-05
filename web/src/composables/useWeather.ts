import { ref } from "vue";
import type { WeatherDay } from "@babymonitor/shared";

/**
 * Tagestemperaturen vom eigenen Server (der sie von Open-Meteo holt und behält).
 *
 * Bewusst NICHT im Offline-Speicher: Das Wetter ist Beiwerk. Fehlt es, fehlt eine
 * Kurve — die Eingabe funktioniert davon unberührt weiter.
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
      // Kein Netz oder Dienst gestört — bleibt einfach leer.
    }
  }

  return { days, byDay, load };
}

/** Einordnung für die Anzeige. Schwellen bewusst grob — es geht um Kontext, nicht um Messtechnik. */
export function describeTemperature(tmax: number | null | undefined): string | null {
  if (tmax === null || tmax === undefined) return null;
  if (tmax >= 30) return "weather.veryHot";
  if (tmax >= 25) return "weather.hot";
  if (tmax >= 18) return "weather.mild";
  if (tmax >= 8) return "weather.cool";
  return "weather.cold";
}
