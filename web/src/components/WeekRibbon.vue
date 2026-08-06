<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { calendarDateLabel, lifeWeekStart } from "@milo/shared";
import type { PeriodBand, TimelineBand, TimelinePin } from "../composables/useTimeline.ts";
import type { LocalEntry } from "../db/local.ts";

/**
 * The week ribbon — this app's signature.
 *
 * The timeline is also the photo album: the weekly photos sit on the axis, not in a
 * gallery of their own. That turns scrolling back through the weeks literally into
 * leafing through the year — and the gaps without a photo are visible without any
 * reminder having to sit anywhere.
 *
 * Deliberately scrolling cells rather than an SVG: that way native scroll snapping,
 * keyboard control and lazy image loading work without being rebuilt.
 */
const props = defineProps<{
  weeksTotal: number;
  currentWeek: number;
  birthDate: string;
  bands: TimelineBand[];
  periods: PeriodBand[];
  pins: TimelinePin[];
  photos: Map<number, LocalEntry>;
}>();

const emit = defineEmits<{ selectWeek: [number]; addPhoto: [number] }>();

const scroller = ref<HTMLElement>();
const selected = ref(props.currentWeek);

const weeks = computed(() => Array.from({ length: props.weeksTotal + 1 }, (_, i) => i));

/** Group pins by week so they do not overlap inside the column. */
const pinsByWeek = computed(() => {
  const map = new Map<number, TimelinePin[]>();
  for (const pin of props.pins) {
    const week = Math.round(pin.week);
    const list = map.get(week) ?? [];
    list.push(pin);
    map.set(week, list);
  }
  return map;
});

function checkupsInWeek(week: number): TimelinePin[] {
  return (pinsByWeek.value.get(week) ?? []).filter((pin) => pin.kind === "checkup");
}

function vaccinationCount(week: number): number {
  return (pinsByWeek.value.get(week) ?? []).filter((pin) => pin.kind === "vaccination").length;
}

function milestoneCount(week: number): number {
  return (pinsByWeek.value.get(week) ?? []).filter((pin) => pin.kind === "milestone").length;
}

function bandStyle(band: { fromWeek: number; toWeek: number }) {
  const from = Math.max(0, band.fromWeek);
  const width = Math.max(0.5, band.toWeek - from + 1);
  return {
    insetInlineStart: `calc(${from} * var(--week-w))`,
    width: `calc(${width} * var(--week-w))`,
  };
}

/**
 * Stack periods into tracks so overlaps do not hide each other.
 * Being ill on holiday is not an exotic combination.
 */
const periodRows = computed(() => {
  const rows: PeriodBand[][] = [];
  for (const period of props.periods) {
    const row = rows.find((r) => r.every((p) => p.toWeek < period.fromWeek || p.fromWeek > period.toWeek));
    if (row) row.push(period);
    else rows.push([period]);
  }
  return rows;
});

function weekDateLabel(week: number): string {
  return calendarDateLabel(lifeWeekStart(props.birthDate, week));
}

/**
 * Short start date under the week number, e.g. "31.7.".
 *
 * A week of life starts on the weekday of birth, not on Monday — the weeks count from
 * the birthday. Without this line you have to do arithmetic to know when week 14
 * actually was.
 */
function weekShortDate(week: number): string {
  const [, month, day] = lifeWeekStart(props.birthDate, week).split("-");
  return `${Number(day)}.${Number(month)}.`;
}

function select(week: number) {
  selected.value = week;
  emit("selectWeek", week);
}

onMounted(async () => {
  await nextTick();
  scrollToWeek(props.currentWeek);
});

/**
 * Jump to the current week on open — without animation, so the view does not travel
 * through the whole year before it becomes usable.
 */
function scrollToWeek(week: number) {
  const element = scroller.value;
  if (!element) return;
  const cell = element.querySelector<HTMLElement>(`[data-week="${week}"]`);
  if (!cell) return;
  element.scrollLeft = cell.offsetLeft - element.clientWidth / 2 + cell.clientWidth / 2;
}

defineExpose({ scrollToWeek });
</script>

<template>
  <div class="ribbon">
    <div class="ribbon__bar">
      <button class="ribbon__today" type="button" @click="scrollToWeek(currentWeek)">
        {{ $t("weeks.toThisWeek") }}
      </button>
    </div>

    <div ref="scroller" class="ribbon__scroll" tabindex="0" role="group" :aria-label="$t('weeks.ariaWeeks')">
      <div class="ribbon__track" :style="{ '--week-w': '4.25rem', '--period-rows': periodRows.length }">
        <!-- The leap bands lie as a continuous surface behind the cells. -->
        <div class="bands" aria-hidden="true">
          <div
            v-for="band in bands"
            :key="band.id"
            class="band"
            :style="bandStyle(band)"
            :title="$t('leap.title', { n: band.leap.number, name: $t(`leap.${band.leap.number}.title`) })"
          >
            <span class="band__label">{{ $t(`leap.${band.leap.number}.title`) }}</span>
          </div>
        </div>

        <!-- What actually happened on its own track, separate from the leap expectations. -->
        <div class="periods" aria-hidden="true">
          <div v-for="(row, i) in periodRows" :key="i" class="periods__row">
            <div
              v-for="period in row"
              :key="period.id"
              class="period"
              :class="`period--${period.kind}`"
              :style="bandStyle(period)"
              :title="period.label"
            >
              <span class="period__label">{{ period.label }}{{ period.ongoing ? " …" : "" }}</span>
            </div>
          </div>
        </div>

        <div class="cells">
          <button
            v-for="week in weeks"
            :key="week"
            :data-week="week"
            type="button"
            class="cell"
            :class="{
              'cell--current': week === currentWeek,
              'cell--future': week > currentWeek,
              'cell--selected': week === selected,
            }"
            :aria-label="`Woche ${week}, ${weekDateLabel(week)}`"
            :aria-current="week === currentWeek ? 'date' : undefined"
            @click="select(week)"
          >
            <!-- Fotostreifen -->
            <span class="cell__photo">
              <img
                v-if="photos.get(week)"
                :src="`/api/media/${photos.get(week)!.mediaId}`"
                :alt="`Foto aus Woche ${week}`"
                loading="lazy"
                decoding="async"
              />
              <span
                v-else-if="week <= currentWeek"
                class="cell__photo-empty"
                @click.stop="emit('addPhoto', week)"
              >
                +
              </span>
              <span v-else class="cell__photo-future" />
            </span>

            <span class="cell__week bm-tabular">{{ week }}</span>
            <span class="cell__date bm-tabular">{{ weekShortDate(week) }}</span>

            <!-- Check-ups by name, vaccinations condensed into ONE dot. Four identical green
                 dots side by side carry no information; which vaccinations they are is in
                 the detail card below. -->
            <span class="cell__pins">
              <span
                v-for="pin in checkupsInWeek(week)"
                :key="pin.id"
                class="pin pin--checkup"
                :title="pin.label"
              >
                {{ pin.label }}
              </span>
              <span
                v-if="vaccinationCount(week) > 0"
                class="pin pin--vaccination"
                :title="`${vaccinationCount(week)} Impfung(en)`"
              />
              <span
                v-if="milestoneCount(week) > 0"
                class="pin pin--milestone"
                :title="$t('weeks.milestoneTitle', { n: milestoneCount(week) })"
              />
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ribbon {
  position: relative;
}

.ribbon__scroll {
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x proximity;
  /* Scroll edge to edge even though the page has padding. */
  margin-inline: -1rem;
  padding: 0.5rem 1rem 0.75rem;
  scrollbar-width: thin;
}

.ribbon__scroll:focus-visible {
  outline: 2px solid var(--bm-feed);
  outline-offset: -2px;
}

.ribbon__track {
  position: relative;
  display: block;
}

/* ── Leap bands ───────────────────────────────────────────────────────────── */

/* The leap bands run as a continuous strip BELOW the cells, not between the week
   number and the appointment pins. Before, the band visually separated the pins from
   their own week. */
.periods {
  position: absolute;
  inset-block-end: 1.6rem;
  inset-inline-start: 0;
}

.periods__row {
  position: relative;
  height: 1.05rem;
  margin-bottom: 0.1rem;
}

.period {
  position: absolute;
  height: 100%;
  border-radius: 62.5rem;
  display: flex;
  align-items: center;
  padding-inline: 0.45rem;
  overflow: hidden;
}

.period--illness {
  background: color-mix(in srgb, #b5677a 30%, transparent);
}

.period--absence {
  background: color-mix(in srgb, var(--bm-sleep) 32%, transparent);
}

.period__label {
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--bm-ink);
  white-space: nowrap;
}

.bands {
  position: absolute;
  inset-block-end: 0;
  inset-inline-start: 0;
  height: 1.4rem;
}

.band {
  position: absolute;
  height: 100%;
  border-radius: 62.5rem;
  background: color-mix(in srgb, var(--bm-photo) 22%, transparent);
  display: flex;
  align-items: center;
  padding-inline: 0.5rem;
  overflow: hidden;
}

.band__label {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--bm-photo);
  white-space: nowrap;
}

/* ── Wochenzellen ─────────────────────────────────────────────────────────── */

.cells {
  display: flex;
  /* Reserve room for the period tracks and the leap strip below them. */
  padding-bottom: calc(1.75rem + var(--period-rows, 0) * 1.15rem);
}

.cell {
  flex: none;
  width: var(--week-w);
  scroll-snap-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.15rem 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.cell__photo {
  position: relative;
  width: 3.25rem;
  height: 3.25rem;
  border-radius: 50%;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: var(--bm-surface-sunk);
  box-shadow: var(--bm-shadow-card);
}

/**
 * The image is LAID OVER the circle, not computed into it.
 *
 * With `height: 100%` alone it did not fill it: for a grid item a percentage height
 * against an automatically sized row is indefinite, so the browser falls back to
 * `auto` — measured, a 52 px circle got a 69 px tall image, in BOTH engines. It only
 * showed on the iPhone because WebKit aligns the overflow differently: there the image
 * slipped downwards and you could see its top edge inside the circle.
 *
 * Stretched absolutely across the four edges there is no percentage arithmetic left,
 * and `object-fit: cover` finally gets a box to relate to.
 */
.cell__photo img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cell__photo-empty {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  border: 2px dashed color-mix(in srgb, var(--bm-photo) 40%, transparent);
  border-radius: 50%;
  color: color-mix(in srgb, var(--bm-photo) 70%, transparent);
  font-size: 1.25rem;
  line-height: 1;
}

/* Future weeks get no call to action — only a quiet hint. */
.cell__photo-future {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--bm-hairline);
}

.cell__week {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--bm-ink-soft);
}

.cell__date {
  font-size: 0.625rem;
  color: var(--bm-ink-soft);
  opacity: 0.75;
  line-height: 1;
}

.cell--current .cell__week {
  color: var(--bm-ink);
  background: var(--bm-feed);
  border-radius: 62.5rem;
  padding: 0.05rem 0.5rem;
}

.cell--selected:not(.cell--current) .cell__week {
  color: var(--bm-ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.cell--future {
  opacity: 0.55;
}

.cell__pins {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 0.15rem;
  min-height: 1rem;
}

.pin {
  min-width: 0.45rem;
  height: 0.9rem;
  padding-inline: 0.25rem;
  border-radius: 62.5rem;
  font-size: 0.625rem;
  font-weight: 700;
  line-height: 0.9rem;
  color: #fff;
}

.pin--checkup {
  background: var(--bm-growth);
}

.pin--vaccination {
  background: var(--bm-diaper);
  width: 0.5rem;
  min-width: 0.5rem;
  height: 0.5rem;
  padding: 0;
  border-radius: 50%;
}

.pin--milestone {
  background: var(--bm-photo);
  width: 0.5rem;
  min-width: 0.5rem;
  height: 0.5rem;
  padding: 0;
  border-radius: 50%;
}

/* In normal flow instead of absolutely positioned — the earlier variant sat on top of
   the subheading line. */
.ribbon__bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.25rem;
}

.ribbon__today {
  border: 1px solid var(--bm-hairline);
  border-radius: 62.5rem;
  padding: 0.25rem 0.7rem;
  background: var(--bm-surface);
  color: var(--bm-ink-soft);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}
</style>
