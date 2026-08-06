<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { calendarDateLabel, lifeWeekStart } from "@babymonitor/shared";
import { useData } from "../stores/data.ts";
import { periodBands, useTimeline, type TimelinePin } from "../composables/useTimeline.ts";
import { usePhotoUpload } from "../composables/usePhotoUpload.ts";

import { regionByCode, regionNote } from "../data/regions/index.ts";
import WeekRibbon from "../components/WeekRibbon.vue";
import { useI18n } from "vue-i18n";

const { t, locale } = useI18n();

const data = useData();
const region = computed(() => regionByCode(data.child?.region));
const route = useRoute();
const ribbon = useTemplateRef<{ scrollToWeek: (w: number) => void }>("ribbon");

// The travel map arrives with "?woche=12" — then jump there instead of to today.
onMounted(() => {
  const target = Number(route.query["woche"]);
  if (Number.isFinite(target) && target >= 0) {
    selectedWeek.value = target;
    setTimeout(() => ribbon.value?.scrollToWeek(target), 100);
  }
});
const { savePhoto, busy } = usePhotoUpload();
/** When each milestone was reached, by key — the same source the checklist reads. */
const achievedMilestones = computed(() => {
  const map = new Map<string, string>();
  for (const e of data.entries) {
    if (e.type === "milestone" && e.milestoneKey) map.set(e.milestoneKey, e.startedAt);
  }
  return map;
});

const { bands, pins, upcoming, activeLeap } = useTimeline(
  () => data.child,
  () => achievedMilestones.value,
);

/** Illnesses and away periods as their own tracks in the ribbon. */
const periods = computed(() =>
  data.child
    ? periodBands(data.entries, data.child.birthDate, data.timezone, data.currentWeek, {
        ill: t("period.ill"),
        away: t("period.away"),
      })
    : [],
);

const selectedWeek = ref(data.currentWeek);
const photoInput = ref<HTMLInputElement>();
const photoTargetWeek = ref(data.currentWeek);

const nextItems = computed(() => upcoming(data.currentWeek, 3));
const runningLeap = computed(() => activeLeap(data.currentWeek));

const selectedPins = computed(() =>
  pins.value.filter((pin) => Math.round(pin.week) === selectedWeek.value),
);

const periodsInWeek = computed(() =>
  periods.value.filter((p) => selectedWeek.value >= p.fromWeek && selectedWeek.value <= p.toWeek),
);

const selectedPhoto = computed(() => data.photosByWeek.get(selectedWeek.value));

const selectedDateLabel = computed(() =>
  data.child ? calendarDateLabel(lifeWeekStart(data.child.birthDate, selectedWeek.value)) : "",
);

function requestPhoto(week: number) {
  photoTargetWeek.value = week;
  photoInput.value?.click();
}

async function onPhotoPicked(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) {
    // Remove an existing photo of the same week first — one per week applies.
    const existing = data.photosByWeek.get(photoTargetWeek.value);
    const saved = await savePhoto(file, photoTargetWeek.value);
    if (saved && existing) await data.remove(existing.id);
  }
  if (photoInput.value) photoInput.value.value = "";
}

/**
 * Replacing a photo means: new one up, old one gone.
 *
 * The entry carries the week of life, and exactly one photo counts per week — so the old
 * entry has to disappear, otherwise two hang off the same week and which one wins is
 * decided by the order in the store.
 */
async function removePhoto() {
  const photo = selectedPhoto.value;
  if (!photo) return;
  await data.remove(photo.id);
}

/**
 * A label per kind.
 *
 * There used to be a two-branch ternary here — written when there were only check-ups
 * and vaccinations. Milestones therefore ended up silently in the vaccination branch.
 * A complete mapping cannot do that: when a kind is added, the gap shows up at once.
 */
const PIN_KIND_LABEL: Record<TimelinePin["kind"], string> = {
  checkup: "pin.checkup",
  vaccination: "pin.vaccination",
  milestone: "pin.milestone",
};

function daysAwayLabel(days: number): string {
  if (days <= 0) return t("away.now");
  if (days < 7) return t("away.days", { n: days });
  const weeks = Math.round(days / 7);
  return t("away.weeks", { n: weeks }, weeks);
}
</script>

<template>
  <div class="weeks">
    <header class="weeks__head">
      <h1>{{ $t("weeks.title") }}</h1>
      <p class="weeks__sub">
        {{ $t("weeks.lead") }}
      </p>
    </header>

    <WeekRibbon
      v-if="data.child"
      ref="ribbon"
      :weeks-total="80"
      :current-week="data.currentWeek"
      :birth-date="data.child.birthDate"
      :bands="bands"
      :periods="periods"
      :pins="pins"
      :photos="data.photosByWeek"
      @select-week="selectedWeek = $event"
      @add-photo="requestPhoto"
    />

    <input
      ref="photoInput"
      class="hidden-input"
      type="file"
      accept="image/*"
      @change="onPhotoPicked"
    />

    <!-- Detail for the week that was tapped -->
    <section class="detail" :aria-label="$t('common.weekN', { n: selectedWeek })">
      <div class="detail__head">
        <h2>{{ $t("common.weekN", { n: selectedWeek }) }}</h2>
        <span class="detail__date">{{ $t("weeks.from", { date: selectedDateLabel }) }}</span>
      </div>

      <template v-if="selectedPhoto">
        <figure class="detail__photo">
          <img :src="`/api/media/${selectedPhoto.mediaId}`" :alt="$t('weeks.photoAlt', { week: selectedWeek })" />
        </figure>
        <!-- A photo is not a final state: the first one is rarely the best one. -->
        <div class="photo-actions">
          <button class="photo-action" type="button" :disabled="busy" @click="requestPhoto(selectedWeek)">
            {{ busy ? $t("photo.loading") : $t("weeks.otherPhoto") }}
          </button>
          <button class="photo-action photo-action--remove" type="button" @click="removePhoto">
            {{ $t("weeks.removePhoto") }}
          </button>
        </div>
      </template>
      <button
        v-else-if="selectedWeek <= data.currentWeek"
        class="detail__add"
        type="button"
        :disabled="busy"
        @click="requestPhoto(selectedWeek)"
      >
        {{ busy ? $t("photo.loading") : $t("weeks.addPhoto", { week: selectedWeek }) }}
      </button>

      <ul v-if="periodsInWeek.length" class="periods-list">
        <li v-for="period in periodsInWeek" :key="period.id">
          <span class="periods-list__kind" :class="`periods-list__kind--${period.kind}`">
            {{ period.kind === "illness" ? $t("period.ill") : $t("period.away") }}
          </span>
          <span>
            {{ period.label }}
            <span class="periods-list__weeks">
              {{ period.toWeek !== period.fromWeek
                ? $t("weeks.periodWeeksRange", { from: period.fromWeek, to: period.toWeek })
                : $t("weeks.periodWeeks", { from: period.fromWeek }) }}
              <template v-if="period.ongoing">{{ $t("weeks.stillRunning") }}</template>
            </span>
          </span>
        </li>
      </ul>

      <ul v-if="selectedPins.length" class="pins">
        <li v-for="pin in selectedPins" :key="pin.id" class="pins__item">
          <span class="pins__kind" :class="`pins__kind--${pin.kind}`">
            {{ $t(PIN_KIND_LABEL[pin.kind]) }}
          </span>
          <div class="pins__body">
            <p class="pins__label">{{ pin.label }}</p>
            <p class="pins__when">{{ pin.when }}</p>
            <p v-if="pin.detail" class="pins__detail">{{ pin.detail }}</p>
            <!-- A tick mark once it has happened, an invitation only while it has not.
                 Still asking to tick off something that IS ticked off is the app
                 contradicting what you did. -->
            <span v-if="pin.doneOn" class="pins__done">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                <path d="m5 12 5 5L19 7" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              {{ $t("weeks.milestoneDone") }}
            </span>
            <RouterLink v-else-if="pin.kind === 'milestone'" to="/meilensteine" class="pins__link">
              {{ $t("weeks.checkInList") }}
            </RouterLink>
          </div>
        </li>
      </ul>
      <p v-else-if="!selectedPhoto && !periodsInWeek.length" class="detail__empty">
        {{ $t("weeks.nothingThisWeek") }}
      </p>
    </section>

    <!-- What is coming -->
    <section v-if="nextItems.length" class="upcoming">
      <h2 class="upcoming__title">{{ $t("weeks.upcoming") }}</h2>
      <ul>
        <li v-for="item in nextItems" :key="item.id" class="upcoming__item">
          <span class="upcoming__when">{{ daysAwayLabel(item.daysAway) }}</span>
          <span class="upcoming__label">{{ item.label }}</span>
          <span class="upcoming__meta">{{ item.when }}</span>
        </li>
      </ul>
    </section>

    <section v-if="runningLeap" class="leap">
      <p class="leap__eyebrow">{{ $t("leap.eyebrow", { n: runningLeap.number, week: runningLeap.week }) }}</p>
      <h2 class="leap__title">{{ $t("leap.title", { n: runningLeap.number, name: $t(`leap.${runningLeap.number}.title`) }) }}</h2>
      <p class="leap__text">{{ $t(`leap.${runningLeap.number}.description`) }}</p>
      <p class="leap__skills"><strong>{{ $t("leap.afterwards") }}</strong> {{ $t(`leap.${runningLeap.number}.newSkills`) }}</p>
    </section>

    <footer class="notes">
      <p>{{ $t("leap.disclaimer") }}</p>
      <!-- The note comes from the country file because it reads differently from
           country to country — the German deadlines, for instance, hang off insurance
           cover. -->
      <p v-if="regionNote(region.checkupNote, locale)">{{ regionNote(region.checkupNote, locale) }}</p>
      <p v-if="!region.verified && region.code !== 'none'">{{ $t("region.unverified") }}</p>
      <p>{{ $t("region.medicalNote") }}</p>
    </footer>
  </div>
</template>

<style scoped>
.weeks {
  padding: 1.5rem 1rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.weeks__head h1 {
  font-size: 1.75rem;
}

.weeks__sub {
  margin: 0.25rem 0 0;
  color: var(--bm-ink-soft);
  font-size: 0.95rem;
}

.hidden-input {
  display: none;
}

/* ── Detail ───────────────────────────────────────────────────────────────── */

.detail {
  background: var(--bm-surface);
  border-radius: 1.5rem;
  padding: 1.25rem;
  box-shadow: var(--bm-shadow-card);
}

.detail__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.875rem;
}

.detail__head h2 {
  font-size: 1.25rem;
}

.detail__date {
  color: var(--bm-ink-soft);
  font-size: 0.85rem;
}

.detail__photo {
  margin: 0 0 1rem;
  border-radius: 1.125rem;
  overflow: hidden;
  background: var(--bm-surface-sunk);
}

.detail__photo img {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
}

.photo-actions {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.photo-action {
  flex: 1;
  min-height: 2.75rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font: inherit;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
}

.photo-action--remove {
  background: transparent;
  border-color: color-mix(in srgb, var(--bm-photo) 45%, transparent);
  color: var(--bm-photo);
}

.photo-action:disabled {
  opacity: 0.5;
}

.detail__add {
  width: 100%;
  min-height: 3rem;
  border: 1px dashed color-mix(in srgb, var(--bm-photo) 45%, transparent);
  border-radius: 1.125rem;
  background: var(--bm-photo-soft);
  color: var(--bm-ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.detail__empty {
  margin: 0;
  color: var(--bm-ink-soft);
  font-size: 0.95rem;
}

.periods-list {
  list-style: none;
  margin: 0 0 0.875rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.periods-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  font-size: 0.95rem;
}

.periods-list__kind {
  flex: none;
  padding: 0.15rem 0.5rem;
  border-radius: 62.5rem;
  font-size: 0.6875rem;
  font-weight: 700;
  color: #fff;
}

.periods-list__kind--illness {
  background: #b5677a;
}

.periods-list__kind--absence {
  background: var(--bm-sleep);
}

.periods-list__weeks {
  display: block;
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.pins {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.pins__item {
  display: flex;
  gap: 0.75rem;
}

.pins__kind {
  flex: none;
  align-self: flex-start;
  padding: 0.15rem 0.5rem;
  border-radius: 62.5rem;
  font-size: 0.6875rem;
  font-weight: 700;
  color: #fff;
}

.pins__kind--checkup {
  background: var(--bm-growth);
}

.pins__kind--vaccination {
  background: var(--bm-diaper);
}

.pins__kind--milestone {
  background: var(--bm-photo);
}

.pins__label {
  margin: 0;
  font-weight: 600;
}

.pins__when {
  margin: 0.1rem 0 0;
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.pins__body {
  min-width: 0;
}

.pins__link {
  display: inline-block;
  margin-top: 0.35rem;
  color: var(--bm-photo);
  font-size: 0.8125rem;
  font-weight: 600;
}

/* Sage rather than the milestone colour: green is what "done" means everywhere else in
   this app, and it must not read as another link to tap. */
.pins__done {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.35rem;
  color: var(--bm-diaper);
  font-size: 0.8125rem;
  font-weight: 600;
}

.pins__done svg {
  width: 0.85rem;
  height: 0.85rem;
}

.pins__detail {
  margin: 0.35rem 0 0;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--bm-ink-soft);
}

/* ── What is coming ───────────────────────────────────────────────────────── */

.upcoming {
  background: var(--bm-surface);
  border-radius: 1.5rem;
  padding: 1.25rem;
  box-shadow: var(--bm-shadow-card);
}

.upcoming__title {
  font-size: 1.1rem;
  margin-bottom: 0.75rem;
}

.upcoming ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.upcoming__item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.15rem 0.75rem;
}

.upcoming__when {
  grid-row: span 2;
  align-self: center;
  padding: 0.3rem 0.6rem;
  border-radius: 62.5rem;
  background: var(--bm-feed-soft);
  color: var(--bm-ink);
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
}

.upcoming__label {
  font-weight: 600;
}

.upcoming__meta {
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

/* ── Sprung ───────────────────────────────────────────────────────────────── */

.leap {
  background: var(--bm-photo-soft);
  border-radius: 1.5rem;
  padding: 1.25rem;
}

.leap__eyebrow {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--bm-photo);
}

.leap__title {
  margin: 0.25rem 0 0.5rem;
  font-size: 1.35rem;
}

.leap__text,
.leap__skills {
  margin: 0 0 0.5rem;
  line-height: 1.55;
  font-size: 0.95rem;
}

.notes {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.notes p {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--bm-ink-soft);
}
</style>
