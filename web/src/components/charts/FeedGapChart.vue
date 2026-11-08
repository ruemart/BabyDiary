<script setup lang="ts">
import { computed } from "vue";
import { Bar } from "vue-chartjs";
import type { ChartData, ChartOptions } from "chart.js";
import type { FeedGaps } from "../../composables/useStats.ts";
import { baseScaleStyle, useChartColors } from "./chartSetup.ts";
import { useI18n } from "vue-i18n";
import { useDuration } from "../../i18n/format.ts";

/**
 * How far apart the bottles stand, from the first one ever recorded.
 *
 * One bar per week, each the median gap of that week, and nothing else in the picture.
 * The question this chart is opened for is "do the bars get taller", and every second
 * series, dot cloud and dashed line in the earlier version got in the way of reading
 * that. The record pause and the then-versus-now numbers are said in words underneath,
 * where they are easier to read than off an axis anyway.
 */
const props = defineProps<{ gaps: FeedGaps }>();

const { t } = useI18n();
const colors = useChartColors();
const duration = useDuration();

const chartData = computed<ChartData<"bar">>(() => ({
  labels: props.gaps.weeks.map((w) => w.label),
  datasets: [
    {
      label: t("charts.gapTitle"),
      data: props.gaps.weeks.map((w) => w.typicalMinutes),
      backgroundColor: colors.value.feed,
      // Only the top is rounded; the foot stays anchored on the zero line.
      borderRadius: 4,
      borderSkipped: "bottom" as const,
      categoryPercentage: 0.82,
      barPercentage: 0.94,
    },
  ],
}));

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
        // Over a year there are more weeks than labels that fit; Chart.js thins them.
        autoSkipPadding: 16,
      },
    },
    y: {
      ...baseScaleStyle(colors.value),
      // Bars are read by their height, so this axis has to start at zero. On a cropped
      // axis a quarter of an hour more would look like the rhythm had doubled.
      beginAtZero: true,
      ticks: {
        ...baseScaleStyle(colors.value).ticks,
        // Whole hours. Left to itself Chart.js steps in minutes and the axis comes out
        // reading 6.7 h, 5.8 h, 5 h — true numbers nobody thinks in.
        stepSize: 60,
        callback: (value) => `${Math.round((value as number) / 60)} h`,
      },
    },
  },
  plugins: {
    // One series, so a legend would only repeat the heading above the chart.
    legend: { display: false },
    tooltip: {
      backgroundColor: colors.value.reference,
      padding: 10,
      cornerRadius: 8,
      displayColors: false,
      callbacks: {
        // The axis can only carry the date; the tooltip says what the date means.
        title: (items) => t("charts.gapWeekOf", { date: items[0]?.label ?? "" }),
        label: (item) => (item.raw === null ? "" : duration(item.raw as number)),
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
  height: 13rem;
}
</style>
