<script setup lang="ts">
import { calendarDateLabel } from "@babydiary/shared";
import type { BathCalendar } from "../../composables/useStats.ts";
import { useI18n } from "vue-i18n";

/**
 * Baths as a calendar: weekdays down, weeks across.
 *
 * Deliberately not the nappy grid. That one runs over 24 hours because nappies happen
 * many times a day; a bath happens about once a week, and an hour axis would be a screen
 * of empty cells with two marks in it. What is worth knowing here is the rhythm in days
 * — and whether it has quietly become a fortnight.
 *
 * A real table, so it reads correctly with a screen reader: the weekday is the row
 * header, the week's Monday the column header.
 */
defineProps<{ calendar: BathCalendar }>();

const { t } = useI18n();

const weekdayShort = (i: number) => t(`weekday.short.${i}`);
const weekdayLong = (i: number) => t(`weekday.long.${i}`);
</script>

<template>
  <div class="bath">
    <div class="bath__scroll">
      <table>
        <caption class="visually-hidden">
          {{ $t("charts.bathCaption", { n: calendar.weeks.length }) }}
        </caption>
        <thead>
          <tr>
            <th scope="col" class="corner"><span class="visually-hidden">{{ $t("history.weekday") }}</span></th>
            <th v-for="week in calendar.weeks" :key="week.start" scope="col" class="week">
              {{ week.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(cells, weekday) in calendar.grid" :key="weekday">
            <th scope="row" class="day">{{ weekdayShort(weekday) }}</th>
            <td
              v-for="cell in cells"
              :key="cell.day"
              class="cell"
              :class="{ 'cell--on': cell.count > 0, 'cell--future': cell.isFuture }"
            >
              <span v-if="cell.count > 0" class="visually-hidden">
                {{ $t("charts.bathOn", { day: weekdayLong(weekday), date: calendarDateLabel(cell.day) }) }}
              </span>
              <span v-if="cell.count > 1" class="cell__count bm-tabular">{{ cell.count }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="facts">
      <template v-if="calendar.averageGapDays !== null">
        {{ $t("charts.bathEvery", { n: calendar.averageGapDays }) }}
      </template>
      <template v-if="calendar.daysSinceLast !== null">
        · {{ calendar.daysSinceLast === 0
          ? $t("charts.bathToday")
          : $t("charts.bathLast", { n: calendar.daysSinceLast }, calendar.daysSinceLast) }}
      </template>
    </p>
  </div>
</template>

<style scoped>
.bath__scroll {
  overflow-x: auto;
  margin-inline: -0.25rem;
  padding-inline: 0.25rem;
}

/*
 * Fixed layout: the columns are equal because the table is told to make them equal, not
 * because their contents happen to be the same width. Content-driven widths are what
 * made every second column wider than its neighbours — and in a calendar an uneven
 * column reads as an uneven week.
 *
 * Only the weekday column gets a width of its own; the rest share what is left, and a
 * heading that would not fit is clipped rather than allowed to push its column wider.
 */
table {
  border-collapse: separate;
  border-spacing: 3px;
  width: 100%;
  table-layout: fixed;
}

.corner,
.week,
.day {
  font-weight: 500;
  font-size: 0.6875rem;
  color: var(--bm-ink-soft);
  padding: 0;
  white-space: nowrap;
  overflow: hidden;
}

.corner,
.day {
  width: 1.5rem;
  text-align: end;
  padding-inline-end: 0.35rem;
}

.week {
  text-align: center;
}

.cell {
  height: 1.1rem;
  border-radius: 3px;
  background: var(--bm-surface-sunk);
  text-align: center;
}

.cell--on {
  background: var(--bm-chart-sleep);
  color: #fff;
}

/* Days that have not happened yet are not days without a bath. */
.cell--future {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--bm-chart-grid);
}

.cell__count {
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.1rem;
}

.facts {
  margin: 0.75rem 0 0;
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
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
