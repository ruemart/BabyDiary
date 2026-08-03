<script setup lang="ts">
import { computed } from "vue";
import { Scatter } from "vue-chartjs";
import type { ChartData, ChartOptions } from "chart.js";
import { baseScaleStyle, useChartColors } from "./chartSetup.ts";

/**
 * Mahlzeiten-Rhythmus: x = Tag, y = Uhrzeit, Punktgröße = Menge.
 *
 * Das lohnendste Diagramm der ganzen App. Über Wochen sieht man zu, wie sich das
 * nächtliche Band lichtet und die Mahlzeiten in den Tag rutschen — eine Entwicklung,
 * die in einer Tabelle unsichtbar bleibt und die man als Eltern sehr genau spüren,
 * aber schlecht belegen kann.
 *
 * Die y-Achse steht auf dem Kopf (0 Uhr oben), damit die Nacht oben und unten liegt
 * und die Nachtmahlzeiten als zusammenhängendes Band lesbar sind.
 */
const props = defineProps<{
  points: { x: number; y: number; ml: number; day: string }[];
  days: number;
}>();

const colors = useChartColors();

const chartData = computed<ChartData<"scatter">>(() => ({
  datasets: [
    {
      label: "Mahlzeiten",
      data: props.points.map((p) => ({ x: p.x, y: p.y, ml: p.ml, day: p.day })),
      backgroundColor: `color-mix(in srgb, ${colors.value.feed} 70%, transparent)`,
      borderColor: colors.value.surface,
      // 2 px Ring in Flächenfarbe: überlappende Punkte bleiben einzeln erkennbar.
      borderWidth: 2,
      pointRadius: (ctx) => {
        const ml = (ctx.raw as { ml: number } | undefined)?.ml ?? 0;
        // Fläche proportional zur Menge, nicht der Radius — sonst überzeichnet
        // ein doppelter Wert die Fläche um das Vierfache.
        return Math.max(4, Math.sqrt(ml) * 0.85);
      },
      pointHoverRadius: (ctx) => {
        const ml = (ctx.raw as { ml: number } | undefined)?.ml ?? 0;
        return Math.max(6, Math.sqrt(ml) * 0.85 + 2);
      },
    },
  ],
}));

const HOUR_TICKS = [0, 6, 12, 18, 24];

const options = computed<ChartOptions<"scatter">>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      ...baseScaleStyle(colors.value),
      min: -0.5,
      max: props.days - 0.5,
      grid: { display: false },
      // Halber Rand links und rechts, damit Punkte am Rand nicht abgeschnitten werden.
      // Die Beschriftungen müssen deshalb von Hand gesetzt werden — Chart.js würde
      // sonst auf den halben Positionen landen und "vor 29.5 T" schreiben.
      afterBuildTicks: (axis) => {
        const marks = [0, 7, 14, 21, props.days - 1].filter(
          (v, i, all) => v >= 0 && v <= props.days - 1 && all.indexOf(v) === i,
        );
        axis.ticks = marks.map((value) => ({ value, label: "" }));
      },
      ticks: {
        ...baseScaleStyle(colors.value).ticks,
        autoSkip: false,
        callback: (value) => {
          const daysAgo = props.days - 1 - Number(value);
          if (daysAgo <= 0) return "heute";
          return `vor ${daysAgo} T`;
        },
      },
    },
    y: {
      ...baseScaleStyle(colors.value),
      min: 0,
      max: 1440,
      reverse: true,
      ticks: {
        ...baseScaleStyle(colors.value).ticks,
        callback: (value) => {
          const minutes = Number(value);
          return HOUR_TICKS.includes(minutes / 60) ? `${minutes / 60}:00` : "";
        },
        stepSize: 180,
      },
    },
  },
  plugins: {
    // Eine Reihe — die Überschrift benennt sie, ein Legendenkasten wäre Rauschen.
    legend: { display: false },
    tooltip: {
      backgroundColor: colors.value.reference,
      padding: 10,
      cornerRadius: 8,
      displayColors: false,
      callbacks: {
        label: (item) => {
          const raw = item.raw as { y: number; ml: number };
          const hour = Math.floor(raw.y / 60);
          const minute = Math.round(raw.y % 60);
          return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} · ${raw.ml} ml`;
        },
      },
    },
  },
}));
</script>

<template>
  <div class="chart">
    <Scatter :data="chartData" :options="options" />
  </div>
</template>

<style scoped>
.chart {
  height: 17rem;
}
</style>
