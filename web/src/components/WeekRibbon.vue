<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { calendarDateLabel, lifeWeekStart } from "@babymonitor/shared";
import type { PeriodBand, TimelineBand, TimelinePin } from "../composables/useTimeline.ts";
import type { LocalEntry } from "../db/local.ts";

/**
 * Das Wochenband — die Signatur dieser App.
 *
 * Der Zeitstrahl ist zugleich das Fotoalbum: Die Wochenfotos sitzen auf der Achse,
 * nicht in einer eigenen Galerie. Dadurch wird das Zurückscrollen durch die Wochen
 * buchstäblich zum Durchblättern des Jahres — und die Lücken ohne Foto sind sichtbar,
 * ohne dass irgendwo eine Mahnung stehen muss.
 *
 * Bewusst als scrollende Zellen statt als SVG: Damit funktionieren native
 * Scroll-Snap-Punkte, Tastaturbedienung und Bildlazyloading ohne Nachbau.
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

/** Pins je Woche gruppieren, damit sie sich in der Spalte nicht überlagern. */
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
 * Zeiträume in Spuren stapeln, damit sich Überlappungen nicht verdecken.
 * Krank im Urlaub ist keine exotische Kombination.
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
 * Kurzes Startdatum unter der Wochenzahl, etwa "31.7.".
 *
 * Der Beginn einer Lebenswoche ist der Wochentag der Geburt, nicht der Montag — die
 * Wochen zählen ab dem Geburtstag. Ohne diese Zeile muss man rechnen, um zu wissen,
 * wann Woche 14 eigentlich war.
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
 * Beim Öffnen auf die aktuelle Woche springen — ohne Animation, damit die Ansicht
 * nicht erst durch das ganze Jahr fährt, bevor sie brauchbar ist.
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
        Zu dieser Woche
      </button>
    </div>

    <div ref="scroller" class="ribbon__scroll" tabindex="0" role="group" aria-label="Wochen">
      <div class="ribbon__track" :style="{ '--week-w': '4.25rem', '--period-rows': periodRows.length }">
        <!-- Sprung-Bänder liegen als durchgehende Fläche hinter den Zellen. -->
        <div class="bands" aria-hidden="true">
          <div
            v-for="band in bands"
            :key="band.id"
            class="band"
            :style="bandStyle(band)"
            :title="`Sprung ${band.leap.number}: ${band.leap.title}`"
          >
            <span class="band__label">{{ band.leap.title }}</span>
          </div>
        </div>

        <!-- Tatsächlich Erlebtes auf eigener Spur, getrennt von den Sprung-Erwartungen. -->
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

            <!-- U-Termine namentlich, Impfungen zu EINEM Punkt zusammengefasst.
                 Vier identische grüne Punkte nebeneinander tragen keine Information;
                 welche Impfungen es sind, steht in der Detailkarte darunter. -->
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
                :title="`${milestoneCount(week)} Meilenstein(e) üblich ab dieser Woche`"
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
  /* Randlos bis an den Bildschirmrand scrollen, obwohl die Seite Innenabstand hat. */
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

/* ── Sprung-Bänder ────────────────────────────────────────────────────────── */

/* Die Sprung-Bänder laufen als durchgehender Streifen UNTER den Zellen, nicht
   zwischen Wochenzahl und Terminmarkern. Vorher trennte das Band die Marker optisch
   von ihrer eigenen Woche ab. */
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
  /* Platz für Zeitraum-Spuren und den Sprung-Streifen darunter reservieren. */
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
 * Das Bild wird über den Kreis GELEGT, nicht in ihn hineingerechnet.
 *
 * Mit `height: 100%` allein füllte es ihn nicht: Für ein Rasterkind ist eine
 * Prozenthöhe gegen eine automatisch bemessene Zeile unbestimmt, der Browser fällt auf
 * `auto` zurück — nachgemessen kam bei einem 52-px-Kreis ein 69 px hohes Bild heraus,
 * in BEIDEN Maschinen. Sichtbar wurde es nur auf dem iPhone, weil WebKit den Überhang
 * anders ausrichtet: Dort rutschte das Bild nach unten und man sah seine Oberkante im
 * Kreis liegen.
 *
 * Absolut über die vier Kanten gespannt gibt es keine Prozentrechnung mehr, und
 * `object-fit: cover` bekommt endlich eine Box, auf die es sich beziehen kann.
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

/* Zukünftige Wochen bekommen keinen Aufforderungscharakter — nur eine leise Andeutung. */
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

/* Im normalen Fluss statt absolut positioniert — die frühere Variante lag über der
   Unterzeile der Überschrift. */
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
