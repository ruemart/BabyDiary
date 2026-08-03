<script setup lang="ts">
/**
 * Windel-Raster: 14 Tage × 24 Stunden.
 *
 * Bewusst reines HTML/CSS-Grid statt eines Chart.js-Matrix-Plugins — das Raster ist ein
 * Layout-Problem, kein Diagramm-Problem. Als echte Tabelle ist es außerdem vorlesbar
 * und funktioniert ohne Canvas.
 *
 * Die Farbskala ist EINFARBIG und gestuft, nicht kategorial: leer → feucht → voll ist
 * eine Rangfolge, keine Auswahl gleichrangiger Kategorien. Deshalb eine Sättigungs-
 * treppe in einem Ton statt drei bunter Farben.
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
          Windeln der letzten 14 Tage nach Stunde
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
  /* 2 px Fläche zwischen den Zellen, damit benachbarte Felder nicht verschmelzen. */
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

/* Eine Farbe, drei Stufen — die Reihenfolge steckt in der Sättigung. */
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
