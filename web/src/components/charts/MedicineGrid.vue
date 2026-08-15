<script setup lang="ts">
import { computed } from "vue";
import { calendarDateLabel } from "@babydiary/shared";
import type { MedicineRow } from "../../composables/useStats.ts";
import { useI18n } from "vue-i18n";

/**
 * Medicine, a row per medicine and a cell per day.
 *
 * The chart answers one question: was it kept up? Not "how much" — the dose is the same
 * every day, and a bar chart of it would be a rectangle. A grid shows the gaps as holes,
 * and three medicines underneath each other show at a glance which one is the one that
 * gets forgotten.
 *
 * Plain HTML and CSS rather than a chart library, like the nappy grid next to it: this
 * is a layout problem, not a plotting problem. The cells are hidden from screen readers
 * and replaced by one sentence per row — thirty cells read out one by one would be worse
 * than useless, while "given on 28 of 30 days, 2 missed" is the whole picture.
 */
const props = defineProps<{ rows: MedicineRow[] }>();

const { t } = useI18n();

/** The line under the name: what is due, and how it went. */
function meta(row: MedicineRow): string {
  const parts: string[] = [];

  if (!row.active) parts.push(t("medicine.notOnListAnyMore"));
  else if (row.timesPerDay === null) parts.push(t("medicine.asNeeded"));
  else parts.push(t("medicine.perDayN", { n: row.timesPerDay }));

  parts.push(
    t("charts.medicineDays", { given: row.daysGiven, total: row.daysPossible }, row.daysPossible),
  );
  if (row.streak !== null && row.streak > 1) {
    parts.push(t("charts.medicineStreak", { n: row.streak }));
  }
  return parts.join(" · ");
}

function cellTitle(row: MedicineRow, index: number): string {
  const cell = row.cells[index]!;
  return `${calendarDateLabel(cell.day)} — ${t(`charts.medicineCell.${cell.state}`, { n: cell.given })}`;
}

const summary = (row: MedicineRow) =>
  t("charts.medicineSummary", {
    name: row.name,
    given: row.daysGiven,
    total: row.daysPossible,
    missed: row.cells.filter((cell) => cell.state === "missed").length,
  });

/** Only a medicine with a "times a day" can miss one — otherwise the key is a lie. */
const hasMissed = computed(() => props.rows.some((row) => row.timesPerDay !== null));
</script>

<template>
  <div class="grid">
    <div v-for="row in rows" :key="row.id" class="row">
      <p class="row__name">
        {{ row.name }}
        <span class="row__meta">{{ meta(row) }}</span>
      </p>
      <p class="visually-hidden">{{ summary(row) }}</p>
      <div class="row__cells" :style="{ '--cols': row.cells.length }" aria-hidden="true">
        <span
          v-for="(cell, index) in row.cells"
          :key="cell.day"
          class="cell"
          :class="`cell--${cell.state}`"
          :title="cellTitle(row, index)"
        />
      </div>
    </div>

    <ul class="legend">
      <li><span class="legend__swatch cell--complete" />{{ $t("charts.medicineLegend.complete") }}</li>
      <li><span class="legend__swatch cell--partial" />{{ $t("charts.medicineLegend.partial") }}</li>
      <li v-if="hasMissed">
        <span class="legend__swatch cell--missed" />{{ $t("charts.medicineLegend.missed") }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.grid {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.row__name {
  margin: 0 0 0.3rem;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem;
  font-weight: 600;
}

.row__meta {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--bm-ink-soft);
}

/* One column per day, sharing the width — thirty days fit on the narrowest phone
   without a scroll bar, and the picture stays one glance rather than a gesture. */
.row__cells {
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  gap: 2px;
}

.cell {
  height: 1.25rem;
  border-radius: 2px;
  background: var(--bm-surface-sunk);
}

/* One hue, three steps: given fully, given partly, due and not given. A ranking, not
   three categories — so it is the saturation that carries it, not the hue. */
.cell--complete {
  background: var(--bm-chart-medicine);
}

.cell--partial {
  background: color-mix(in srgb, var(--bm-chart-medicine) 45%, transparent);
}

/* The missed day is the one you look for. An outline rather than another shade: it has
   to be findable in a row of pale cells, and colour alone would put it on the same
   ladder as "given a bit". */
.cell--missed {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--bm-chart-medicine) 40%, transparent);
}

.legend {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin: 0;
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
  border-radius: 2px;
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
