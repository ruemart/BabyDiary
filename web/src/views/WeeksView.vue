<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { calendarDateLabel, lifeWeekStart } from "@babymonitor/shared";
import { useData } from "../stores/data.ts";
import { periodBands, useTimeline, type TimelinePin } from "../composables/useTimeline.ts";
import { usePhotoUpload } from "../composables/usePhotoUpload.ts";

import { regionByCode } from "../data/regions/index.ts";
import WeekRibbon from "../components/WeekRibbon.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const data = useData();
const region = computed(() => regionByCode(data.child?.region));
const route = useRoute();
const ribbon = useTemplateRef<{ scrollToWeek: (w: number) => void }>("ribbon");

// Aus der Reisekarte kommt "?woche=12" — dann dorthin springen statt auf heute.
onMounted(() => {
  const target = Number(route.query["woche"]);
  if (Number.isFinite(target) && target >= 0) {
    selectedWeek.value = target;
    setTimeout(() => ribbon.value?.scrollToWeek(target), 100);
  }
});
const { savePhoto, busy } = usePhotoUpload();
const { bands, pins, upcoming, activeLeap } = useTimeline(() => data.child);

/** Krankheiten und Abwesenheiten als eigene Spuren im Band. */
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
    // Vorhandenes Foto derselben Woche zuerst entfernen — es gilt eines pro Woche.
    const existing = data.photosByWeek.get(photoTargetWeek.value);
    const saved = await savePhoto(file, photoTargetWeek.value);
    if (saved && existing) await data.remove(existing.id);
  }
  if (photoInput.value) photoInput.value.value = "";
}

/**
 * Foto ersetzen heißt: neues hoch, altes weg.
 *
 * Der Eintrag trägt die Lebenswoche, und pro Woche gilt genau ein Foto — der alte
 * Eintrag muss also verschwinden, sonst hängen zwei an derselben Woche und welches
 * gewinnt, entscheidet die Reihenfolge im Speicher.
 */
async function removePhoto() {
  const photo = selectedPhoto.value;
  if (!photo) return;
  await data.remove(photo.id);
}

/**
 * Beschriftung je Art.
 *
 * Vorher stand hier ein Ternär mit zwei Zweigen — geschrieben, als es nur
 * Untersuchungen und Impfungen gab. Meilensteine landeten dadurch stillschweigend
 * im Impfungs-Zweig. Eine vollständige Zuordnung kann das nicht passieren: Kommt
 * eine Art dazu, fällt die Lücke sofort auf.
 */
const PIN_KIND_LABEL: Record<TimelinePin["kind"], string> = {
  checkup: "Untersuchung",
  vaccination: "Impfung",
  milestone: "Meilenstein",
};

function daysAwayLabel(days: number): string {
  if (days <= 0) return "jetzt";
  if (days < 7) return `in ${days} Tagen`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? "in 1 Woche" : `in ${weeks} Wochen`;
}
</script>

<template>
  <div class="weeks">
    <header class="weeks__head">
      <h1>Wochenband</h1>
      <p class="weeks__sub">
        Jede Woche ein Foto — der Zeitstrahl wird damit zum Album.
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

    <!-- Detail zur angetippten Woche -->
    <section class="detail" :aria-label="`Woche ${selectedWeek}`">
      <div class="detail__head">
        <h2>Woche {{ selectedWeek }}</h2>
        <span class="detail__date">ab {{ selectedDateLabel }}</span>
      </div>

      <template v-if="selectedPhoto">
        <figure class="detail__photo">
          <img :src="`/api/media/${selectedPhoto.mediaId}`" :alt="`Foto aus Woche ${selectedWeek}`" />
        </figure>
        <!-- Ein Foto ist kein endgültiger Zustand: Das erste ist selten das beste. -->
        <div class="photo-actions">
          <button class="photo-action" type="button" :disabled="busy" @click="requestPhoto(selectedWeek)">
            {{ busy ? "Lädt …" : "Anderes Foto" }}
          </button>
          <button class="photo-action photo-action--remove" type="button" @click="removePhoto">
            Entfernen
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
        {{ busy ? "Lädt …" : `Foto für Woche ${selectedWeek} hinzufügen` }}
      </button>

      <ul v-if="periodsInWeek.length" class="periods-list">
        <li v-for="period in periodsInWeek" :key="period.id">
          <span class="periods-list__kind" :class="`periods-list__kind--${period.kind}`">
            {{ period.kind === "illness" ? "Krank" : "Unterwegs" }}
          </span>
          <span>
            {{ period.label }}
            <span class="periods-list__weeks">
              Woche {{ period.fromWeek }}<template v-if="period.toWeek !== period.fromWeek">–{{ period.toWeek }}</template>
              <template v-if="period.ongoing"> · läuft noch</template>
            </span>
          </span>
        </li>
      </ul>

      <ul v-if="selectedPins.length" class="pins">
        <li v-for="pin in selectedPins" :key="pin.id" class="pins__item">
          <span class="pins__kind" :class="`pins__kind--${pin.kind}`">
            {{ PIN_KIND_LABEL[pin.kind] }}
          </span>
          <div class="pins__body">
            <p class="pins__label">{{ pin.label }}</p>
            <p class="pins__when">{{ pin.when }}</p>
            <p v-if="pin.detail" class="pins__detail">{{ pin.detail }}</p>
            <RouterLink v-if="pin.kind === 'milestone'" to="/meilensteine" class="pins__link">
              In der Liste abhaken
            </RouterLink>
          </div>
        </li>
      </ul>
      <p v-else-if="!selectedPhoto && !periodsInWeek.length" class="detail__empty">
        In dieser Woche steht nichts an.
      </p>
    </section>

    <!-- Ausblick -->
    <section v-if="nextItems.length" class="upcoming">
      <h2 class="upcoming__title">Demnächst</h2>
      <ul>
        <li v-for="item in nextItems" :key="item.id" class="upcoming__item">
          <span class="upcoming__when">{{ daysAwayLabel(item.daysAway) }}</span>
          <span class="upcoming__label">{{ item.label }}</span>
          <span class="upcoming__meta">{{ item.when }}</span>
        </li>
      </ul>
    </section>

    <section v-if="runningLeap" class="leap">
      <p class="leap__eyebrow">Sprung {{ runningLeap.number }} · Woche {{ runningLeap.week }}</p>
      <h2 class="leap__title">{{ $t("leap.title", { n: runningLeap.number, name: $t(`leap.${runningLeap.number}.title`) }) }}</h2>
      <p class="leap__text">{{ $t(`leap.${runningLeap.number}.description`) }}</p>
      <p class="leap__skills"><strong>{{ $t("leap.afterwards") }}</strong> {{ $t(`leap.${runningLeap.number}.newSkills`) }}</p>
    </section>

    <footer class="notes">
      <p>{{ $t("leap.disclaimer") }}</p>
      <!-- Der Hinweis kommt aus der Länderdatei, weil er von Land zu Land anders
           lautet — die deutschen Fristen etwa hängen an der Kassenleistung. -->
      <p v-if="region.checkupNote">{{ region.checkupNote }}</p>
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

.pins__detail {
  margin: 0.35rem 0 0;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--bm-ink-soft);
}

/* ── Ausblick ─────────────────────────────────────────────────────────────── */

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
