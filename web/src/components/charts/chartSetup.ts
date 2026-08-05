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
 * Read the chart colours from the CSS tokens.
 *
 * Chart.js draws onto a canvas and cannot resolve CSS variables — the values have to go
 * in as concrete colours. The dependency on `isNight` makes sure the charts are redrawn
 * when night mode kicks in instead of staying in the daytime colours.
 */
export function useChartColors() {
  return computed(() => {
    // Reading it forces recomputation when the mode changes.
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

/** Axes and gridlines step back; the data is the loud part. */
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
