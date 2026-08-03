<script setup lang="ts">
import { computed, type ComputedRef } from "vue";
import { Bar } from "vue-chartjs";
import type { ChartData, ChartOptions } from "chart.js";
import type { DailyTotal } from "../../composables/useStats.ts";
import { baseScaleStyle, useChartColors } from "./chartSetup.ts";

/**
 * Trinkmenge pro Tag — das Diagramm, das die eigentliche Frage beantwortet:
 * trinkt sie mehr oder weniger als vorher?
 *
 * Balken plus gleitendes 7-Tage-Mittel auf EINER Achse, beide in Millilitern. Keine
 * zweite y-Achse: zwei Skalen im selben Bild lassen jede beliebige Beziehung zwischen
 * den Kurven entstehen, je nachdem wie man sie skaliert.
 */
const props = defineProps<{ series: DailyTotal[] }>();

const colors = useChartColors();

// Gemischtes Diagramm (Balken + Linie). Chart.js kann das, die Typen von vue-chartjs
// erwarten aber eine einzelne Diagrammart — deshalb hier eine einzelne Zusicherung an
// der Grenze statt `any` quer durch die Datei.
const chartData = computed(() => ({
  labels: props.series.map((d) => d.label),
  datasets: [
    {
      label: "Tagesmenge",
      data: props.series.map((d) => d.totalMl),
      backgroundColor: colors.value.feed,
      // Nur das Datenende rundet; der Fuß bleibt an der Nulllinie verankert.
      // Mit `false` würden alle vier Ecken runden und die schmalen Balken sähen
      // bei 30 Tagen auf einem Handybildschirm wie schwebende Pillen aus.
      borderRadius: 4,
      borderSkipped: "bottom",
      // 2 px Fläche zwischen benachbarten Balken.
      categoryPercentage: 0.82,
      barPercentage: 0.94,
      order: 2,
    },
    {
      label: "7-Tage-Mittel",
      data: props.series.map((d) => d.rollingMl),
      type: "line" as const,
      borderColor: colors.value.reference,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 5,
      tension: 0.3,
      spanGaps: false,
      order: 1,
    },
  ],
})) as unknown as ComputedRef<ChartData<"bar">>;

const options = computed<ChartOptions<"bar">>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  scales: {
    x: {
      ...baseScaleStyle(colors.value),
      grid: { display: false },
      ticks: {
        ...baseScaleStyle(colors.value).ticks,
        maxRotation: 0,
        autoSkipPadding: 16,
      },
    },
    y: {
      ...baseScaleStyle(colors.value),
      beginAtZero: true,
      ticks: {
        ...baseScaleStyle(colors.value).ticks,
        callback: (value) => `${value} ml`,
      },
    },
  },
  plugins: {
    legend: {
      display: true,
      position: "bottom",
      align: "start",
      labels: {
        color: colors.value.axis,
        boxWidth: 10,
        boxHeight: 10,
        usePointStyle: true,
        pointStyle: "circle",
        font: { family: "Source Sans 3 Variable, system-ui, sans-serif", size: 12 },
      },
    },
    tooltip: {
      backgroundColor: colors.value.reference,
      padding: 10,
      cornerRadius: 8,
      displayColors: true,
      callbacks: {
        label: (item) =>
          item.raw === null
            ? ""
            : `${item.dataset.label}: ${item.formattedValue} ml` +
              (item.datasetIndex === 0
                ? ` · ${props.series[item.dataIndex]?.feeds ?? 0} Mahlzeiten`
                : ""),
      },
    },
  },
}));
</script>

<template>
  <div class="chart">
    <Bar :data="chartData" :options="options" />
  </div>
</template>

<style scoped>
.chart {
  height: 15rem;
}
</style>
