<script setup lang="ts">
import { computed } from "vue";
import { Scatter } from "vue-chartjs";
import type { ChartData, ChartOptions } from "chart.js";
import { baseScaleStyle, useChartColors } from "./chartSetup.ts";

/**
 * Feeding rhythm: x = day, y = time of day, dot size = amount.
 *
 * The most rewarding chart in the whole app. Over weeks you watch the night-time band
 * thin out and the feeds slide into the day — a development invisible in a table and one
 * parents feel very clearly but can hardly evidence.
 *
 * The y-axis is upside down (midnight at the top) so the night sits at the top and the
 * bottom and the night feeds read as one connected band.
 */
const props = defineProps<{
  points: { x: number; y: number; ml: number; spatUp: boolean; day: string }[];
  days: number;
}>();

const colors = useChartColors();

const chartData = computed<ChartData<"scatter">>(() => ({
  datasets: [
    {
      label: "Mahlzeiten",
      data: props.points.map((p) => ({ x: p.x, y: p.y, ml: p.ml, spatUp: p.spatUp, day: p.day })),
      // Feeds brought back up are hollow: the moment belongs in the rhythm, but the
      // amount did not arrive — a filled area would claim the opposite.
      backgroundColor: (ctx) =>
        (ctx.raw as { spatUp?: boolean } | undefined)?.spatUp
          ? "transparent"
          : `color-mix(in srgb, ${colors.value.feed} 70%, transparent)`,
      borderColor: (ctx) =>
        (ctx.raw as { spatUp?: boolean } | undefined)?.spatUp
          ? colors.value.feed
          : colors.value.surface,
      // 2 px Ring in Flächenfarbe: überlappende Punkte bleiben einzeln erkennbar.
      borderWidth: 2,
      pointRadius: (ctx) => {
        const ml = (ctx.raw as { ml: number } | undefined)?.ml ?? 0;
        // Area proportional to the amount, not the radius — otherwise doubling the
        // value would quadruple the area.
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
      // Half a margin left and right so dots at the edge are not clipped. The labels
      // therefore have to be placed by hand — Chart.js would otherwise land on the half
      // positions and write "29.5 d ago".
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
    // A single series — the heading names it, a legend box would be noise.
    legend: { display: false },
    tooltip: {
      backgroundColor: colors.value.reference,
      padding: 10,
      cornerRadius: 8,
      displayColors: false,
      callbacks: {
        label: (item) => {
          const raw = item.raw as { y: number; ml: number; spatUp: boolean };
          const hour = Math.floor(raw.y / 60);
          const minute = Math.round(raw.y % 60);
          const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
          return raw.spatUp
            ? `${time} · ${raw.ml} ml, ausgespuckt`
            : `${time} · ${raw.ml} ml`;
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
