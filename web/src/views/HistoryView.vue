<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  addDays,
  calendarDateLabel,
  localDayKey,
  localTimeLabel,
  shortDateLabel,
  startOfWeek,
  weekdayIndex,
} from "@milo/shared";
import { useData } from "../stores/data.ts";
import type { LocalEntry } from "../db/local.ts";
import AddEntrySheet from "../components/AddEntrySheet.vue";
import BackdateFab from "../components/BackdateFab.vue";
import { numberWithinDay } from "../utils/dayOrdinals.ts";
import { availableWeeks, buildWeek, dayAfterWeekChange } from "../utils/historyWeeks.ts";
import { useI18n } from "vue-i18n";
import { useDuration } from "../i18n/format.ts";


const { t } = useI18n();
const duration = useDuration();
const data = useData();

/**
 * One day at a time, chosen by week and weekday.
 *
 * Everything used to sit underneath each other. That works for four weeks and then
 * becomes steadily less usable: "what happened last Wednesday" can only be answered by
 * scrolling. The day strip also shows the numbers for all seven days without having to
 * open a single one.
 */
const today = computed(() => localDayKey(new Date(), data.timezone));
const selectedDay = ref(today.value);
const weekStart = computed(() => startOfWeek(selectedDay.value));

const weeks = computed(() => availableWeeks(data.entries, data.timezone, today.value));

const week = computed(() =>
  buildWeek(data.entries, data.timezone, weekStart.value, today.value),
);

const day = computed(
  () => week.value.days.find((d) => d.key === selectedDay.value) ?? week.value.days[0]!,
);

const ordinals = computed(() => numberWithinDay(day.value.entries));

/**
 * Keep the weekday when switching weeks — that makes weeks comparable. If the day would
 * be in the future, it is clamped to today.
 */
function goToWeek(start: string) {
  selectedDay.value = dayAfterWeekChange(start, weekdayIndex(selectedDay.value), today.value);
}

function shiftWeek(by: number) {
  const target = weeks.value[weeks.value.indexOf(weekStart.value) + by];
  if (target) goToWeek(target);
}

const hasNewer = computed(() => weeks.value.indexOf(weekStart.value) > 0);
const hasOlder = computed(
  () => weeks.value.indexOf(weekStart.value) < weeks.value.length - 1,
);

/** "3 Aug – 9 Aug 2026" — the span, not the ISO week number. Nobody knows those by heart. */
function weekLabel(start: string): string {
  // Do not cut the year out of the full date: in English there is a comma there
  // ("Aug 3, 2026") and "Aug 3, – Aug 9" would be left. That is what shortDateLabel is for.
  return `${shortDateLabel(start)} – ${calendarDateLabel(addDays(start, 6))}`;
}

/** Weekday names from the language files, Monday = 0 (see `weekdayIndex`). */
const weekdayShort = (i: number) => t(`weekday.short.${i}`);
const weekdayLong = (i: number) => t(`weekday.long.${i}`);

/** Heading of the chosen day: "Wednesday, 5 Aug 2026" — plus "today" when it is. */
const dayTitle = computed(() => {
  const label = `${weekdayLong(day.value.weekday)}, ${calendarDateLabel(day.value.key)}`;
  return day.value.key === today.value ? t("history.dayTitleToday", { day: label }) : label;
});

/** The day's numbers in words — the strip shows them tersely, here they are spelled out. */
const dayFacts = computed(() => {
  const d = day.value;
  const facts: string[] = [];
  if (d.totalMl > 0) facts.push(`${d.totalMl} ml`);
  if (d.feeds > 0) facts.push(t("history.factsFeeds", { n: d.feeds }, d.feeds));
  if (d.diapers > 0) facts.push(t("history.factsDiapers", { n: d.diapers }, d.diapers));
  if (d.sleepMinutes > 0) facts.push(t("history.factsSleep", { duration: duration(d.sleepMinutes) }));
  return facts;
});

/** For screen readers: the strip is otherwise just a wall of numbers. */
function tabLabel(d: { weekday: number; key: string; totalMl: number; diapers: number }): string {
  const parts = [`${weekdayLong(d.weekday)}, ${calendarDateLabel(d.key)}`];
  if (d.totalMl > 0) parts.push(t("history.tabMl", { n: d.totalMl }));
  if (d.diapers > 0) parts.push(t("history.tabDiapers", { n: d.diapers }));
  if (d.totalMl === 0 && d.diapers === 0) parts.push(t("history.tabNothing"));
  return parts.join(", ");
}

/**
 * Without this, a restart across midnight would leave yesterday selected.
 */
watch(today, (now, before) => {
  if (selectedDay.value === before) selectedDay.value = now;
});

/**
 * The edit sheet. Among other things this is how the time of a nappy gets corrected:
 * the one-tap path on the home screen deliberately sets "now", because any prompt there
 * would slow down the night-time case — the correction belongs here.
 */
const editing = ref<LocalEntry | null>(null);
const editOpen = ref(false);

function edit(entry: LocalEntry) {
  editing.value = entry;
  editOpen.value = true;
}

const typeLabel = (type: string) => t(`entry.${type}`);

const DIAPER_KEY: Record<string, string> = {
  empty: "diaper.empty",
  wet: "diaper.wet",
  soiled: "diaper.soiled",
  both: "diaper.soiled",
};

function describe(entry: LocalEntry): string {
  switch (entry.type) {
    case "feed":
      return [
        `${entry.amountMl} ml`,
        entry.spatUp ? t("describe.spatUp") : null,
        entry.vitaminD ? t("describe.vitaminD") : null,
        entry.colicDrops ? t("describe.colicDrops") : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "diaper":
      return t(DIAPER_KEY[entry.diaper ?? "empty"] ?? "diaper.empty");
    case "sleep":
      return entry.endedAt
        ? t("describe.until", { time: localTimeLabel(entry.endedAt, data.timezone) })
        : t("describe.running");
    case "growth":
      return [
        entry.weightG ? `${(entry.weightG / 1000).toFixed(3)} kg` : null,
        entry.lengthMm ? `${(entry.lengthMm / 10).toFixed(1)} cm` : null,
        entry.headMm ? t("describe.head", { cm: (entry.headMm / 10).toFixed(1) }) : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "milestone":
      return entry.label ?? "";
    case "photo":
      return t("describe.weekN", { n: entry.lifeWeek });
    case "illness":
      return [
        entry.label,
        entry.temperatureDc ? `${(entry.temperatureDc / 10).toFixed(1).replace(".", ",")} °C` : null,
        entry.endedAt ? null : t("describe.running"),
      ]
        .filter(Boolean)
        .join(" · ");
    case "absence":
      return entry.label ?? "";
    case "supply":
      return [entry.label, entry.supplySize, entry.supplyShop && t("describe.boughtAt", { shop: entry.supplyShop })]
        .filter(Boolean)
        .join(" · ");
    default:
      return "";
  }
}

async function remove(entry: LocalEntry) {
  await data.remove(entry.id);
}
</script>

<template>
  <div class="history">
    <header class="history__head">
      <h1>{{ $t("history.title") }}</h1>
      <!-- Only visible when you really are away. A button that always sits there and
           mostly does nothing is worse than no button. -->
      <button
        v-if="weekStart !== startOfWeek(today)"
        class="history__now"
        type="button"
        @click="selectedDay = today"
      >
        {{ $t("history.jumpToday") }}
      </button>
    </header>

    <!-- Entries the server permanently rejects. They no longer block syncing, but they
         do need correcting — otherwise they silently never reach the other device. -->
    <div v-if="data.invalidEntries.length > 0" class="warning" role="alert">
      <p class="warning__title">
        {{ data.invalidEntries.length === 1
          ? $t("history.invalid.one")
          : $t("history.invalid.many", { n: data.invalidEntries.length }) }}
      </p>
      <p class="warning__text">
        {{ $t("history.invalid.text") }}
      </p>
      <p class="warning__reason">{{ data.invalidEntries[0]!.reason }}</p>
    </div>

    <!-- Week picker. The span rather than the ISO week number: "3–9 Aug" can be placed,
         "week 32" has to be looked up. -->
    <div class="weekbar">
      <button
        class="weekbar__step"
        type="button"
        :disabled="!hasOlder"
        :aria-label="$t('history.prevWeek')"
        @click="shiftWeek(1)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>

      <label class="weekbar__pick">
        <span class="weekbar__label">{{ weekLabel(weekStart) }}</span>
        <select :value="weekStart" :aria-label="$t('history.pickWeek')" @change="goToWeek(($event.target as HTMLSelectElement).value)">
          <option v-for="w in weeks" :key="w" :value="w">{{ weekLabel(w) }}</option>
        </select>
      </label>

      <button
        class="weekbar__step"
        type="button"
        :disabled="!hasNewer"
        :aria-label="$t('history.nextWeek')"
        @click="shiftWeek(-1)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>

    <!-- Day strip: seven fixed columns, including the empty ones. A gap is a statement;
         leaving them out would shift the weekdays around. -->
    <div class="dayrow" role="tablist" :aria-label="$t('history.weekday')">
      <button
        v-for="d in week.days"
        :key="d.key"
        class="dayrow__tab"
        :class="{
          'dayrow__tab--on': d.key === selectedDay,
          'dayrow__tab--today': d.key === today,
          'dayrow__tab--future': d.isFuture,
        }"
        type="button"
        role="tab"
        :aria-selected="d.key === selectedDay"
        :aria-label="tabLabel(d)"
        :disabled="d.isFuture"
        @click="selectedDay = d.key"
      >
        <span class="dayrow__wd">{{ weekdayShort(d.weekday) }}</span>
        <span class="dayrow__num bm-tabular">{{ d.dayOfMonth }}</span>
        <span class="dayrow__ml bm-tabular">{{ d.totalMl > 0 ? d.totalMl : "·" }}</span>
        <span class="dayrow__dp bm-tabular">{{ d.diapers > 0 ? `${d.diapers}×` : "·" }}</span>
      </button>
    </div>

    <section class="day">
      <div class="day__head">
        <h2>{{ dayTitle }}</h2>
      </div>
      <p v-if="dayFacts.length" class="day__facts">{{ dayFacts.join(" · ") }}</p>

      <p v-if="day.entries.length === 0" class="empty">
        {{
          day.key === today
            ? $t("history.nothingToday")
            : $t("history.nothingThatDay")
        }}
      </p>

      <ul v-else class="entries">
        <li v-for="entry in day.entries" :key="entry.id" class="entry">
          <!-- The whole row is the edit button; only the delete cross next to it sits
               outside. -->
          <button class="entry__open" type="button" @click="edit(entry)">
            <span class="entry__time bm-tabular">
              {{ localTimeLabel(entry.startedAt, data.timezone) }}
            </span>
            <span class="entry__dot" :class="`entry__dot--${entry.type}`" aria-hidden="true" />
            <span class="entry__body">
              <span class="entry__type">
                <span v-if="ordinals.has(entry.id)" class="entry__ordinal bm-tabular"
                  >{{ ordinals.get(entry.id) }}.</span
                >
                {{ typeLabel(entry.type) }}
              </span>
              <span class="entry__detail">{{ describe(entry) }}</span>
              <span v-if="entry.note" class="entry__note">{{ entry.note }}</span>
            </span>
            <span class="entry__by">{{ entry.createdBy }}</span>
          </button>
          <button
            class="entry__remove"
            type="button"
            :aria-label="$t('history.deleteAria', { type: typeLabel(entry.type), time: localTimeLabel(entry.startedAt, data.timezone) })"
            @click="remove(entry)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
            </svg>
          </button>
        </li>
      </ul>
    </section>

    <!-- Schwebender Knopf statt einer Kopfzeile, die wegscrollt.
         Nachtragen ist der Grund, warum man diese Seite überhaupt öffnet — der Knopf
         darf nicht von der Länge der Tagesliste abhängen. Er sitzt über der
         Navigationsleiste und in Daumenreichweite. -->
    <BackdateFab :default-at="day.key === today ? null : `${day.key}T12:00:00`" />
    <AddEntrySheet v-model:open="editOpen" :entry="editing" />
  </div>
</template>

<style scoped>
.history {
  /* Unten Luft für den schwebenden Knopf — sonst verdeckt er den letzten Eintrag. */
  padding: 1.5rem 1rem 5.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.history__head {
  margin-bottom: 0.3rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.history__head h1 {
  font-size: 1.75rem;
  margin-inline-end: auto;
}

.history__now {
  min-height: 2.5rem;
  padding: 0 0.9rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 62.5rem;
  background: var(--bm-surface);
  color: var(--bm-ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.warning {
  padding: 0.9rem 1rem;
  border: 1px solid color-mix(in srgb, var(--bm-photo) 45%, transparent);
  border-radius: 1.125rem;
  background: var(--bm-photo-soft);
}

.warning__title {
  margin: 0;
  font-weight: 600;
}

.warning__text {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
  line-height: 1.45;
  color: var(--bm-ink-soft);
}

.warning__reason {
  margin: 0.4rem 0 0;
  font-size: 0.75rem;
  font-family: var(--onyx-font-family-mono, monospace);
  color: var(--bm-ink-soft);
  word-break: break-word;
}

.empty {
  margin: 0;
  padding: 2rem 1rem;
  text-align: center;
  color: var(--bm-ink-soft);
  line-height: 1.5;
}

/* ── Wochenwahl ──────────────────────────────────────────────────────────── */

.weekbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.weekbar__step {
  width: 2.5rem;
  height: 2.5rem;
  flex: none;
  display: grid;
  place-items: center;
  border: 1px solid var(--bm-hairline);
  border-radius: 50%;
  background: var(--bm-surface);
  color: var(--bm-ink);
  cursor: pointer;
}

.weekbar__step:disabled {
  opacity: 0.35;
  cursor: default;
}

.weekbar__step svg {
  width: 1.1rem;
  height: 1.1rem;
}

/* The label sits visibly underneath, the real <select> invisibly on top. That keeps
   the system picker with its familiar behaviour without letting its default look
   dictate the bar. */
.weekbar__pick {
  position: relative;
  flex: 1;
  min-height: 2.5rem;
  display: grid;
  place-items: center;
  border-radius: 62.5rem;
  background: var(--bm-surface);
  border: 1px solid var(--bm-hairline);
}

.weekbar__label {
  font-weight: 600;
  font-size: 0.95rem;
}

.weekbar__pick select {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  font: inherit;
  cursor: pointer;
}

/* ── Tagesleiste ─────────────────────────────────────────────────────────── */

.dayrow {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.25rem;
}

.dayrow__tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.05rem;
  padding: 0.4rem 0.1rem 0.45rem;
  border: 1px solid transparent;
  border-radius: 0.875rem;
  background: var(--bm-surface);
  color: var(--bm-ink);
  font: inherit;
  cursor: pointer;
}

.dayrow__tab--today .dayrow__num {
  text-decoration: underline;
  text-underline-offset: 0.15em;
}

.dayrow__tab--on {
  background: var(--bm-feed);
  color: #2a2028;
}

.dayrow__tab--future {
  opacity: 0.3;
  cursor: default;
}

.dayrow__wd {
  font-size: 0.7rem;
  color: var(--bm-ink-soft);
}

.dayrow__tab--on .dayrow__wd {
  color: #2a2028;
}

.dayrow__num {
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.1;
}

/* The two numbers carry their meaning through the same colours as the dots in the
   list — spelled out they sit under the heading. */
.dayrow__ml,
.dayrow__dp {
  font-size: 0.625rem;
  font-weight: 600;
  line-height: 1.25;
}

.dayrow__ml {
  color: color-mix(in srgb, var(--bm-feed) 80%, var(--bm-ink));
}

.dayrow__dp {
  color: color-mix(in srgb, var(--bm-diaper) 65%, var(--bm-ink));
}

.dayrow__tab--on .dayrow__ml,
.dayrow__tab--on .dayrow__dp {
  color: color-mix(in srgb, #2a2028 65%, transparent);
}

/* ── Day ─────────────────────────────────────────────────────────────────── */

.day__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 0.15rem;
}

.day__head h2 {
  font-size: 1.05rem;
}

.day__facts {
  margin: 0 0 0.6rem;
  color: var(--bm-ink-soft);
  font-size: 0.875rem;
  font-weight: 600;
}

.entries {
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--bm-surface);
  border-radius: 1.25rem;
  box-shadow: var(--bm-shadow-card);
  overflow: hidden;
}

.entry {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  padding-inline-end: 0.5rem;
}

/* The row itself is the edit button. */
.entry__open {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.7rem 0.35rem 0.7rem 0.85rem;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.entry__open:active {
  background: var(--bm-surface-sunk);
}

.entry + .entry {
  border-top: 1px solid var(--bm-hairline);
}

.entry__time {
  font-size: 0.85rem;
  color: var(--bm-ink-soft);
  font-weight: 600;
}

.entry__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
}

.entry__dot--feed {
  background: var(--bm-feed);
}
.entry__dot--diaper {
  background: var(--bm-diaper);
}
.entry__dot--sleep {
  background: var(--bm-sleep);
}
.entry__dot--growth {
  background: var(--bm-growth);
}
.entry__dot--milestone,
.entry__dot--photo {
  background: var(--bm-photo);
}
.entry__dot--note {
  background: var(--bm-ink-soft);
}
.entry__dot--illness {
  background: #b5677a;
}
.entry__dot--absence {
  background: var(--bm-sleep);
}
.entry__dot--supply {
  background: var(--bm-growth);
}
.entry__dot--bath {
  background: var(--bm-sleep);
}

.entry__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* The running number steps back: it places the entry, it is not the main thing. */
.entry__ordinal {
  color: var(--bm-ink-soft);
  font-weight: 500;
}

.entry__type {
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.entry__detail {
  font-weight: 600;
}

.entry__note {
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.entry__by {
  font-size: 0.75rem;
  color: var(--bm-ink-soft);
}

.entry__remove {
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--bm-ink-soft);
  cursor: pointer;
}

.entry__remove svg {
  width: 0.95rem;
  height: 0.95rem;
}
</style>
