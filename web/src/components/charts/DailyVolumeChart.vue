<script setup lang="ts">
import { computed, type ComputedRef } from "vue";
import { Bar } from "vue-chartjs";
import type { ChartData, ChartOptions } from "chart.js";
import type { DailyTotal } from "../../composables/useStats.ts";
import { baseScaleStyle, useChartColors } from "./chartSetup.ts";

/**
 * Daily intake — the chart that answers the actual question: is she drinking more or
 * less than before?
 *
 * Bars plus a rolling 7-day average on ONE axis, both in millilitres. No second y-axis:
 * two scales in the same picture can produce any relationship you like between the
 * curves, depending on how you scale them.
 */
const props = defineProps<{ series: DailyTotal[] }>();

const colors = useChartColors();

// A mixed chart (bars + line). Chart.js can do that, but the vue-chartjs types expect
// a single chart type — hence one assertion at the boundary instead of `any` throughout
// the file.
const chartData = computed(() => ({
  labels: props.series.map((d) => d.label),
  datasets: [
    {
      label: "Tagesmenge",
      data: props.series.map((d) => d.totalMl),
      backgroundColor: colors.value.feed,
      // Only the data end is rounded; the foot stays anchored on the zero line. With
      // `false` all four corners would round and the narrow bars would look like
      // floating pills at 30 days on a phone screen.
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
