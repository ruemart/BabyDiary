<script setup lang="ts">
import { computed, type ComputedRef } from "vue";
import { Line } from "vue-chartjs";
import type { ChartData, ChartOptions } from "chart.js";
import type { Sex } from "@babymonitor/shared";
import {
  PERCENTILE_LINES,
  valueAtZ,
  zScore,
  zToPercentile,
  type GrowthMeasure,
} from "../../data/who/index.ts";
import { baseScaleStyle, useChartColors } from "./chartSetup.ts";

/**
 * Growth against the WHO percentile curves.
 *
 * The point is not the absolute value but the position in the band: a child on P20 is
 * perfectly healthy as long as it STAYS on P20. So the reference curves sit quietly in
 * the background and the child's own measurements clearly on top — you should read the
 * course, not compare a value against a target mark.
 */
const props = defineProps<{
  measure: GrowthMeasure;
  sex: Sex;
  /** Measurements in the units of the WHO tables: kg and cm. */
  points: { ageDays: number; value: number }[];
  maxAgeDays: number;
}>();

const colors = useChartColors();

/** Anchor points every two weeks — no denser is needed for a smooth curve. */
const grid = computed(() => {
  const step = 14;
  const upper = Math.max(60, Math.ceil((props.maxAgeDays + 28) / step) * step);
  return Array.from({ length: Math.floor(upper / step) + 1 }, (_, i) => i * step);
});

const chartData = computed(() => ({
  datasets: [
    ...PERCENTILE_LINES.map((line) => ({
      label: line.label,
      data: grid.value.map((day) => ({
        x: day,
        y: valueAtZ(props.measure, props.sex, day, line.z),
      })),
      borderColor: colors.value.grid,
      // The median solid, the outer lines dashed — so orientation does not depend on
      // colour alone.
      borderDash: line.label === "P50" ? [] : [4, 4],
      borderWidth: 1,
      pointRadius: 0,
      pointHitRadius: 0,
      fill: false,
      tension: 0.4,
      order: 3,
    })),
    {
      label: "Gemessen",
      data: props.points.map((p) => ({ x: p.ageDays, y: p.value })),
      borderColor: colors.value.feed,
      backgroundColor: colors.value.feed,
      borderWidth: 2.5,
      pointRadius: 4,
      pointHoverRadius: 7,
      pointBorderColor: colors.value.surface,
      pointBorderWidth: 2,
      tension: 0.2,
      order: 1,
    },
  ],
})) as unknown as ComputedRef<ChartData<"line">>;

const unit = computed(() => (props.measure === "weight" ? "kg" : "cm"));

const options = computed<ChartOptions<"line">>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  parsing: false,
  scales: {
    x: {
      ...baseScaleStyle(colors.value),
      type: "linear",
      min: 0,
      grid: { display: false },
      ticks: {
        ...baseScaleStyle(colors.value).ticks,
        stepSize: 61,
        callback: (value) => {
          const months = Math.round(Number(value) / 30.44);
          return months === 0 ? "Geburt" : `${months} Mon`;
        },
      },
    },
    y: {
      ...baseScaleStyle(colors.value),
      ticks: {
        ...baseScaleStyle(colors.value).ticks,
        callback: (value) => `${value} ${unit.value}`,
      },
    },
  },
  plugins: {
    // Five reference lines in a legend would be noise; they are named under the chart,
    // and the number that actually matters is in the tooltip.
    legend: { display: false },
    tooltip: {
      backgroundColor: colors.value.reference,
      padding: 10,
      cornerRadius: 8,
      displayColors: false,
      filter: (item) => item.datasetIndex === PERCENTILE_LINES.length,
      callbacks: {
        title: (items) => {
          const days = Number(items[0]?.parsed.x ?? 0);
          const weeks = Math.floor(days / 7);
          return weeks < 14 ? `Woche ${weeks}` : `${Math.round(days / 30.44)} Monate`;
        },
        label: (item) => {
          const value = Number(item.parsed.y);
          const z = zScore(props.measure, props.sex, Number(item.parsed.x), value);
          const percentile = z === null ? null : Math.round(zToPercentile(z));
          return percentile === null
            ? `${value} ${unit.value}`
            : `${value} ${unit.value} · P${percentile}`;
        },
      },
    },
  },
}));
</script>

<template>
  <div>
    <div class="chart">
      <Line :data="chartData" :options="options" />
    </div>
    <p class="caption">
      {{ $t("charts.growthLegend") }}
    </p>
  </div>
</template>

<style scoped>
.chart {
  height: 16rem;
}

.caption {
  margin: 0.75rem 0 0;
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--bm-ink-soft);
}
</style>
