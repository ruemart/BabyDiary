import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  ScatterController,
  Tooltip,
} from "chart.js";
import { computed } from "vue";
import { isNight } from "../../composables/useAppearance.ts";

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  ScatterController,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Legend,
  Tooltip,
);

/**
 * Diagrammfarben aus den CSS-Tokens lesen.
 *
 * Chart.js zeichnet auf ein Canvas und kann keine CSS-Variablen auflösen — die Werte
 * müssen als konkrete Farbe hinein. Die Abhängigkeit von `isNight` sorgt dafür, dass
 * die Diagramme beim nächtlichen Umschalten neu gezeichnet werden statt in den
 * Tagesfarben stehen zu bleiben.
 */
export function useChartColors() {
  return computed(() => {
    // Zugriff erzwingt die Neuberechnung beim Moduswechsel.
    void isNight.value;
    const style = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) =>
      style.getPropertyValue(name).trim() || fallback;

    return {
      feed: read("--bm-chart-feed", "#b8770f"),
      sleep: read("--bm-chart-sleep", "#2f5fa8"),
      diaper: read("--bm-chart-diaper", "#2e7d4f"),
      grid: read("--bm-chart-grid", "#e5ddd3"),
      axis: read("--bm-chart-axis", "#6b615f"),
      reference: read("--bm-chart-reference", "#2a2028"),
      surface: read("--bm-surface", "#ffffff"),
    };
  });
}

/** Achsen und Raster treten zurück; die Daten sind das Laute. */
export function baseScaleStyle(colors: { grid: string; axis: string }) {
  return {
    grid: { color: colors.grid, drawTicks: false },
    border: { display: false },
    ticks: {
      color: colors.axis,
      font: { family: "Source Sans 3 Variable, system-ui, sans-serif", size: 11 },
      padding: 6,
    },
  };
}
