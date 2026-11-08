<script setup lang="ts">
import { computed } from "vue";
import { Line } from "vue-chartjs";
import type { ChartData, ChartOptions } from "chart.js";
import type { FeedGaps } from "../../composables/useStats.ts";
import { baseScaleStyle, useChartColors } from "./chartSetup.ts";
import { useI18n } from "vue-i18n";
import { useDuration } from "../../i18n/format.ts";

/**
 * How far apart the bottles stand, from the first one ever recorded.
 *
 * The other charts cover 30 days, because that is the horizon of "is she drinking enough
 * this week". This one is deliberately the whole history: the rhythm of a newborn
 * stretches over months, and a month-wide window can never show that.
 *
 * Two lines, both seven-day medians. The typical gap is the rhythm of the day; the
 * longest gap is, in practice, the night stretch — and that is the one that lengthens
 * first and the one parents are actually waiting for. The raw daily values sit behind
 * them as faint dots, so the spread stays visible instead of being smoothed into a
 * promise the data does not make.
 */
const props = defineProps<{ gaps: FeedGaps }>();

const { t } = useI18n();
const colors = useChartColors();
const duration = useDuration();

const chartData = computed<ChartData<"line">>(() => ({
  labels: props.gaps.days.map((d) => d.label),
  datasets: [
    {
      label: t("charts.gapTypical"),
      data: props.gaps.days.map((d) => d.trendTypical),
      borderColor: colors.value.feed,
      borderWidth: 2.5,
      pointRadius: 0,
      pointHoverRadius: 5,
      tension: 0.35,
      spanGaps: true,
      order: 1,
    },
    {
      label: t("charts.gapLongest"),
      data: props.gaps.days.map((d) => d.trendLongest),
      borderColor: colors.value.sleep,
      borderWidth: 2,
      borderDash: [5, 4],
      pointRadius: 0,
      pointHoverRadius: 5,
      tension: 0.35,
      spanGaps: true,
      order: 2,
    },
    {
      // The days themselves, behind the trend: a line alone would hide how much one day
      // differs from the next, which is most of what a rhythm actually looks like.
      label: t("charts.gapDaily"),
      data: props.gaps.days.map((d) => d.typicalMinutes),
      showLine: false,
      pointRadius: 1.6,
      pointHoverRadius: 4,
      pointBackgroundColor: colors.value.feed,
      pointBorderWidth: 0,
      order: 3,
    },
  ],
}));

const options = computed<ChartOptions<"line">>(() => ({
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
        // Over months there are more days than labels that fit; Chart.js thins them out.
        autoSkipPadding: 20,
      },
    },
    y: {
      ...baseScaleStyle(colors.value),
      // Not from zero: nobody feeds at a zero-hour interval, and the band the values
      // actually live in is what the slope has to be readable in.
      beginAtZero: false,
      ticks: {
        ...baseScaleStyle(colors.value).ticks,
        // Whole hours. Left to itself Chart.js steps in minutes and the axis comes out
        // reading 6.7 h, 5.8 h, 5 h — true numbers nobody thinks in.
        stepSize: 60,
        // Hours, because the values are hours. In minutes this axis reads 180, 240, 300.
        callback: (value) => `${Math.round((value as number) / 60)} h`,
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
          item.raw === null ? "" : `${item.dataset.label}: ${duration(item.raw as number)}`,
      },
    },
  },
}));
</script>

<template>
  <div class="chart">
    <Line :data="chartData" :options="options" />
  </div>
</template>

<style scoped>
.chart {
  height: 15rem;
}
</style>
