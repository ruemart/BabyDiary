<script setup lang="ts">
/**
 * Nappy grid: 14 days × 24 hours.
 *
 * Deliberately plain HTML/CSS grid rather than a Chart.js matrix plugin — the grid is a
 * layout problem, not a charting problem. As a real table it is also readable by screen
 * readers and works without a canvas.
 *
 * The colour scale is SINGLE-HUE and stepped, not categorical: empty → wet → soiled is a
 * ranking, not a set of equal categories. So a saturation ladder in one hue instead of
 * three different colours.
 */
defineProps<{
  rows: { day: string; label: string; hours: ({ kind: string; count: number } | null)[] }[];
}>();

const KIND_LABEL: Record<string, string> = {
  empty: "leer",
  wet: "feucht",
  soiled: "voll",
  both: "voll",
};

const LEGEND = [
  { kind: "empty", label: "leer" },
  { kind: "wet", label: "feucht" },
  { kind: "soiled", label: "voll" },
];
</script>

<template>
  <div class="heatmap">
    <div class="heatmap__scroll">
      <table>
        <caption class="visually-hidden">
          {{ $t("charts.diaperHeatmapCaption", { days: rows.length }) }}
        </caption>
        <thead>
          <tr>
            <th scope="col" class="corner"><span class="visually-hidden">Tag</span></th>
            <th v-for="hour in 24" :key="hour" scope="col" class="hour">
              {{ (hour - 1) % 6 === 0 ? hour - 1 : "" }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.day">
            <th scope="row" class="day">{{ row.label }}</th>
            <td
              v-for="(cell, hour) in row.hours"
              :key="hour"
              class="cell"
              :class="cell ? `cell--${cell.kind}` : ''"
              :title="
                cell
                  ? `${row.label} ${hour}:00 — ${KIND_LABEL[cell.kind]}${cell.count > 1 ? ` (${cell.count}×)` : ''}`
                  : undefined
              "
            >
              <span v-if="cell" class="visually-hidden">
                {{ KIND_LABEL[cell.kind] }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ul class="legend">
      <li v-for="item in LEGEND" :key="item.kind">
        <span class="legend__swatch" :class="`cell--${item.kind}`" />
        {{ item.label }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.heatmap__scroll {
  overflow-x: auto;
  margin-inline: -0.25rem;
  padding-inline: 0.25rem;
}

table {
  border-collapse: separate;
  /* 2 px between the cells so neighbouring fields do not merge. */
  border-spacing: 2px;
  width: 100%;
}

.corner,
.hour,
.day {
  font-weight: 500;
  font-size: 0.6875rem;
  color: var(--bm-ink-soft);
  padding: 0;
}

.day {
  text-align: end;
  padding-inline-end: 0.35rem;
  white-space: nowrap;
}

.hour {
  text-align: center;
}

.cell {
  width: 0.75rem;
  height: 0.75rem;
  min-width: 0.6rem;
  border-radius: 3px;
  background: var(--bm-surface-sunk);
}

/* One colour, three steps — the ranking lives in the saturation. */
.cell--empty {
  background: color-mix(in srgb, var(--bm-chart-diaper) 25%, transparent);
}

.cell--wet {
  background: color-mix(in srgb, var(--bm-chart-diaper) 60%, transparent);
}

.cell--soiled,
.cell--both {
  background: var(--bm-chart-diaper);
}

.legend {
  list-style: none;
  display: flex;
  gap: 1rem;
  margin: 0.75rem 0 0;
  padding: 0;
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.legend li {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.legend__swatch {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 3px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
