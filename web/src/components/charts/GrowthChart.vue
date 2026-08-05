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
 * Wachstum gegen die WHO-Perzentilkurven.
 *
 * Der Punkt ist nicht der absolute Wert, sondern die Lage im Band: Ein Kind auf P20
 * ist völlig gesund, solange es auf P20 BLEIBT. Deshalb liegen die Referenzkurven
 * zurückhaltend im Hintergrund und die eigene Messreihe deutlich darüber — man soll
 * den Verlauf lesen, nicht einen Wert mit einer Sollmarke vergleichen.
 */
const props = defineProps<{
  measure: GrowthMeasure;
  sex: Sex;
  /** Messwerte in der Einheit der WHO-Tabellen: kg bzw. cm. */
  points: { ageDays: number; value: number }[];
  maxAgeDays: number;
}>();

const colors = useChartColors();

/** Stützstellen alle zwei Wochen — dichter braucht es für eine glatte Kurve nicht. */
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
      // Der Median durchgezogen, die äußeren Linien gestrichelt — damit die
      // Orientierung nicht allein von der Farbe abhängt.
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
    // Fünf Referenzlinien in einer Legende wären Rauschen; sie sind unter dem
    // Diagramm benannt, und die eigentlich interessante Zahl steht im Tooltip.
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
