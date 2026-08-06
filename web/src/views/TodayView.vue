<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { localTimeLabel } from "@babymonitor/shared";
import { useElapsed } from "../i18n/format.ts";
import { useToast } from "sit-onyx";
import { useData } from "../stores/data.ts";
import { useUndo } from "../composables/useUndo.ts";
import FeedSheet from "../components/FeedSheet.vue";
import PhotoNudge from "../components/PhotoNudge.vue";
import AppHeader from "../components/AppHeader.vue";
import { useAlerts } from "../composables/useAlerts.ts";
import { useWeather, describeTemperature } from "../composables/useWeather.ts";
import { useDailyIntake } from "../composables/useDailyIntake.ts";
import { useOpenPeriods } from "../composables/useOpenPeriods.ts";
import { useVitaminD } from "../composables/useVitaminD.ts";
import { ageInDays, localDayKey } from "@babymonitor/shared";
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";


const { t } = useI18n();
const { since: elapsedSinceLabel } = useElapsed();
const data = useData();
const confirmWithUndo = useUndo();
const toast = useToast();

const feedSheetOpen = ref(false);

const { alerts } = useAlerts(
  () => data.entries,
  () => data.timezone,
  () => (data.child ? ageInDays(data.child.birthDate, new Date(), data.timezone) : 0),
);

const intake = useDailyIntake(() => data.entries, () => data.timezone);

const vitaminD = useVitaminD(() => data.entries, () => data.timezone, () => now.value);

/**
 * Set vitamin D retrospectively on today's last feed — or take it back off. That way
 * nobody has to go into the history just because the tick was forgotten while recording.
 */
async function toggleVitaminD() {
  const targetId = vitaminD.value.entryId ?? vitaminD.value.latestFeedId;
  if (!targetId) return;
  const entry = data.entries.find((e) => e.id === targetId);
  if (!entry) return;
  await data.update({ ...entry, vitaminD: !entry.vitaminD });
}

/** Everything currently running — sleep, illness, being away. Several at once possible. */
const openPeriods = useOpenPeriods(() => data.entries, () => now.value);

async function endPeriod(id: string) {
  const entry = data.entries.find((e) => e.id === id);
  if (!entry) return;
  await data.update({ ...entry, endedAt: new Date().toISOString() });
}

async function logBath() {
  const entry = data.draft("bath", new Date());
  await data.add(entry);
  confirmWithUndo(t("today.bathLogged"), entry.id);
}

const { byDay, load: loadWeather } = useWeather();
onMounted(() => void loadWeather());

/** Today's weather — often explains why she drinks more or less. */
const todayWeather = computed(() => {
  const today = localDayKey(new Date(), data.timezone);
  const entry = byDay.value.get(today);
  if (!entry?.tmax) return null;
  // describeTemperature returns a key, not a text — the wording is a phrasing and
  // belongs in the language files.
  const key = describeTemperature(entry.tmax);
  return { tmax: Math.round(entry.tmax), label: key ? t(key) : "" };
});

/**
 * Ticks every second. The number "2 h 15 min ago" is the one piece of information that
 * is really needed at night — it must not sit there stale.
 */
const now = ref(new Date());
const tick = setInterval(() => (now.value = new Date()), 1000);
onUnmounted(() => clearInterval(tick));

/**
 * Wer den Eintrag angelegt hat — aber NUR, wenn es jemand anderes war.
 *
 * Das ist der eigentliche Zweck: Der Name erscheint genau dann, wenn er etwas bedeutet.
 * Stünde er immer da, wäre er nach zwei Tagen unsichtbar; so ist er ein Signal.
 */
function otherPerson(entry: { createdBy?: string | null } | null): string | null {
  const who = entry?.createdBy?.trim();
  if (!who || who === data.deviceName.trim()) return null;
  return who;
}

const lastFeedText = computed(() => {
  const feed = data.lastFeed;
  if (!feed) return null;
  return {
    since: elapsedSinceLabel(feed.startedAt, now.value),
    detail: `${feed.amountMl} ml um ${localTimeLabel(feed.startedAt, data.timezone)}`,
    by: otherPerson(feed),
    // Without this note the status line reads like an intake that happened.
    spatUp: feed.spatUp === true,
  };
});

const lastDiaperText = computed(() => {
  const diaper = data.lastDiaper;
  if (!diaper) return null;
  return {
    since: elapsedSinceLabel(diaper.startedAt, now.value),
    detail: `${t(DIAPER_KEY[diaper.diaper ?? "empty"]!)} um ${localTimeLabel(diaper.startedAt, data.timezone)}`,
    by: otherPerson(diaper),
  };
});

const sleepSince = computed(() =>
  data.activeSleep ? elapsedSinceLabel(data.activeSleep.startedAt, now.value) : null,
);

/** "both" still exists in older entries — it counts as "soiled". */
const DIAPER_KEY: Record<string, string> = {
  empty: "diaper.empty",
  wet: "diaper.wet",
  soiled: "diaper.soiled",
  both: "diaper.soiled",
};

/**
 * So lange gilt eine Windel des anderen Geräts als "gerade eben".
 *
 * Deutlich länger als das Zeitfenster des Doppeltap-Schutzes (zwei Minuten), weil es
 * hier nicht ums Blockieren geht, sondern ums Erwähnen. Zwanzig Minuten decken den
 * Fall ab, der wirklich vorkommt: Zwei Eltern im selben Zimmer, beide tragen ein.
 */
const CROSS_DEVICE_HINT_MS = 20 * 60 * 1000;

const DIAPER_BUTTONS = [
  { kind: "empty" as const, key: "today.diaperButton.empty" },
  { kind: "wet" as const, key: "today.diaperButton.wet" },
  { kind: "soiled" as const, key: "today.diaperButton.soiled" },
];

async function logDiaper(kind: "empty" | "wet" | "soiled") {
  const result = await data.logDiaper(kind);

  // The double-tap guard must not act silently: someone who is not told their second
  // tap was discarded will tap a third time.
  if (result.action === "duplicate") {
    toast.show({
      headline: t("today.diaperAlready", { kind: t(DIAPER_KEY[kind]!) }),
      description: t("today.duplicateDetail"),
      color: "neutral",
      duration: 4000,
    });
    return;
  }

  if (result.action === "corrected") {
    toast.show({
      headline: t("today.diaperChangedTo", { kind: t(DIAPER_KEY[kind]!) }),
      description: t("today.changedDetail"),
      color: "success",
      duration: 4000,
    });
    return;
  }

  /**
   * Hat das andere Gerät gerade eben schon eine Windel eingetragen?
   *
   * Dann NICHT blockieren — zwei Windeln zehn Minuten auseinander können echt sein, und
   * ein Schutz, der so weit greift, verschluckt irgendwann richtige Einträge. Stattdessen
   * beim Bestätigen sagen, was gerade passiert ist. Rückgängig ist es ohnehin ein Tap.
   */
  const recentByOther = data.byTimeDesc.find(
    (e) =>
      e.type === "diaper" &&
      e.id !== result.id &&
      Date.now() - Date.parse(e.startedAt) < CROSS_DEVICE_HINT_MS &&
      !!otherPerson(e),
  );

  confirmWithUndo(
    t("today.diaperLogged", { kind: t(DIAPER_KEY[kind]!) }),
    result.id,
    recentByOther
      ? t("today.diaperAlsoRecent", {
          name: otherPerson(recentByOther),
          since: elapsedSinceLabel(recentByOther.startedAt, new Date()),
        })
      : undefined,
  );
}

async function startSleep() {
  const entry = data.draft("sleep", new Date());
  await data.add(entry);
  confirmWithUndo(t("today.sleepStarted"), entry.id);
}
</script>

<template>
  <div class="today">
    <AppHeader />

    <!-- Status line: the reason you switch the phone on at night at all. -->
    <section class="status" :aria-label="$t('today.statusRegion')">
      <!-- Flasche und Windel gleichrangig. Vorher war die Windel eine graue Zeile
           unter der großen Flaschen-Zahl — und genau deshalb ist zweimal dieselbe
           Windel eingetragen worden: Man sah sie nicht, bevor man tippte. -->
      <div class="status__primary">
        <p class="status__label">{{ $t("today.lastFeed") }}</p>
        <p v-if="lastFeedText" class="status__value bm-tabular">{{ lastFeedText.since }}</p>
        <p v-else class="status__value status__value--empty">{{ $t("today.none") }}</p>
        <p v-if="lastFeedText" class="status__detail bm-tabular">
          {{ lastFeedText.detail }}
          <span v-if="lastFeedText.spatUp" class="status__flag">{{ $t("today.spatUp") }}</span>
          <span v-if="lastFeedText.by" class="status__by">{{ $t("today.byOther", { name: lastFeedText.by }) }}</span>
        </p>
      </div>

      <div class="status__primary status__primary--diaper">
        <p class="status__label">{{ $t("today.lastDiaperLabel") }}</p>
        <p v-if="lastDiaperText" class="status__value bm-tabular">{{ lastDiaperText.since }}</p>
        <p v-else class="status__value status__value--empty">{{ $t("today.noDiaperYet") }}</p>
        <p v-if="lastDiaperText" class="status__detail bm-tabular">
          {{ lastDiaperText.detail }}
          <!-- Der Name des anderen ist hier die wichtigste Information: Er beantwortet
               "hat das schon jemand eingetragen?", bevor man es ein zweites Mal tut. -->
          <span v-if="lastDiaperText.by" class="status__by">{{ $t("today.byOther", { name: lastDiaperText.by }) }}</span>
        </p>
      </div>

      <!-- The daily amount as context, not as a target: how much she needs is her call.
           So there is never a shortfall shown here. -->
      <div class="status__row status__row--intake">
        <span class="status__dot" :style="{ background: 'var(--bm-feed)' }" />
        <span>
          {{ $t("today.intake", { amount: intake.todayMl }) }}
          <template v-if="intake.orientationMl">{{ $t("today.orientation", { amount: intake.orientationMl }) }}</template>
          <span v-if="intake.praise" class="status__praise">{{ intake.praise }}</span>
        </span>
      </div>

      <div v-if="todayWeather" class="status__row">
        <span class="status__dot" :style="{ background: 'var(--bm-growth)' }" />
        {{ $t("today.weather", { tmax: todayWeather.tmax, label: todayWeather.label }) }}
      </div>

    </section>

    <!-- Vitamin D: its own card, not one line among many. The daily dose gets forgotten
         precisely because it is so small — and by the evening nobody is sure any more
         whether it happened. -->
    <section
      class="vitamin"
      :class="{ 'vitamin--done': vitaminD.given, 'vitamin--urgent': vitaminD.urgent }"
      aria-label="Vitamin D"
    >
      <span class="vitamin__mark" aria-hidden="true">
        <svg v-if="vitaminD.given" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="m5 12 5 5L19 7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4.5" stroke-linecap="round" />
          <path d="M12 16h.01" stroke-linecap="round" />
        </svg>
      </span>
      <span class="vitamin__text">
        <span class="vitamin__label">
          {{ vitaminD.given ? $t("today.vitaminDone", { time: vitaminD.atLabel }) : $t("today.vitaminOpen") }}
        </span>
        <span v-if="!vitaminD.given && !vitaminD.latestFeedId" class="vitamin__hint">
          {{ $t("today.vitaminHintNoFeed") }}
        </span>
        <span v-else-if="!vitaminD.given" class="vitamin__hint">
          {{ vitaminD.urgent ? $t("today.vitaminHintUrgent") : $t("today.vitaminHint") }}
        </span>
      </span>
      <button
        v-if="vitaminD.latestFeedId || vitaminD.entryId"
        class="vitamin__action"
        type="button"
        @click="toggleVitaminD"
      >
        {{ vitaminD.given ? $t("today.vitaminUndo") : $t("today.vitaminDoneAction") }}
      </button>
    </section>

    <!-- What is currently running. One tap ends it at the present moment — without
         having had to ask for the end when it started. -->
    <section v-if="openPeriods.length" class="running" :aria-label="$t('today.running')">
      <p class="running__title">{{ $t("today.running") }}</p>
      <div v-for="period in openPeriods" :key="period.id" class="running__item">
        <span class="running__dot" :class="`running__dot--${period.kind}`" aria-hidden="true" />
        <span class="running__body">
          <span class="running__label">{{ period.title }}</span>
          <span class="running__since">{{ period.since }}</span>
        </span>
        <button class="running__stop" type="button" @click="endPeriod(period.id)">
          {{ $t("today.endPeriod") }}
        </button>
      </div>
    </section>

    <!-- Entry. Order by frequency, size by importance. -->
    <section class="actions" :aria-label="$t('today.entryRegion')">
      <button class="feed" type="button" @click="feedSheetOpen = true">
        <span class="feed__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M9 2h6M10 2v3.2a4 4 0 0 1-.5 1.9L8 9.5V21a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V9.5l-1.5-2.4a4 4 0 0 1-.5-1.9V2" />
            <path d="M8 13h8" stroke-linecap="round" />
          </svg>
        </span>
        <span class="feed__text">
          <span class="feed__title">{{ $t("entry.feed") }}</span>
          <span class="feed__hint bm-tabular">{{ $t("today.feedHint", { amount: data.suggestedAmountMl }) }}</span>
        </span>
      </button>

      <div class="diapers" role="group" :aria-label="$t('today.diaperRegion')">
        <button
          v-for="button in DIAPER_BUTTONS"
          :key="button.kind"
          class="diaper"
          type="button"
          @click="logDiaper(button.kind)"
        >
          {{ $t(button.key) }}
        </button>
      </div>

      <div class="secondary-row">
        <button v-if="!data.activeSleep" class="sleep" type="button" @click="startSleep">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M20 13.5A8 8 0 0 1 10.5 4a8 8 0 1 0 9.5 9.5Z" stroke-linejoin="round" />
          </svg>
          {{ $t("today.startSleep") }}
        </button>
        <button class="bath" type="button" @click="logBath">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M4 12h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-2Z" stroke-linejoin="round" />
            <path d="M7 12V6a2 2 0 0 1 3.6-1.2" stroke-linecap="round" />
          </svg>
          {{ $t("today.bath") }}
        </button>
      </div>
    </section>

    <!-- Hinweise: beobachtend formuliert, nie beurteilend. -->
    <section v-if="alerts.length" class="alerts" :aria-label="$t('today.alertsRegion')">
      <div v-for="alert in alerts" :key="alert.id" class="alert" :class="`alert--${alert.level}`">
        <p class="alert__title">{{ alert.title }}</p>
        <p class="alert__detail">{{ alert.detail }}</p>
      </div>
      <p class="alerts__note">{{ $t("alerts.disclaimer") }}</p>
    </section>

    <PhotoNudge v-if="!data.currentWeekHasPhoto" />

    <p v-if="intake.orientationMl" class="intake-note">{{ $t("intake.note") }}</p>

    <RouterLink to="/verlauf" class="history-link">
      {{ $t("today.historyLink") }}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="m9 18 6-6-6-6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </RouterLink>

    <FeedSheet v-model:open="feedSheetOpen" />
  </div>
</template>

<style scoped>
.today {
  padding: 0 1rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* ── Status ───────────────────────────────────────────────────────────────── */

.status {
  background: var(--bm-surface);
  border-radius: 1.5rem;
  padding: 1.5rem 1.25rem 1.25rem;
  box-shadow: var(--bm-shadow-card);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.status__label {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--bm-ink-soft);
}

.status__value {
  margin: 0.15rem 0 0;
  font-family: var(--bm-font-display);
  /* Big enough to read from a metre away in half darkness. Slightly smaller since
     there are two of these now — both still far above everything else on the screen. */
  font-size: clamp(1.6rem, 6.6vw, 2.1rem);
  font-weight: 600;
  line-height: 1.05;
  letter-spacing: -0.02em;
}

.status__value--empty {
  color: var(--bm-ink-soft);
  font-weight: 500;
}

.status__detail {
  margin: 0.3rem 0 0;
  color: var(--bm-ink-soft);
  font-size: 0.95rem;
}

.status__row--intake {
  align-items: flex-start;
}

.status__praise {
  display: block;
  margin-top: 0.15rem;
  color: var(--bm-diaper);
  font-weight: 600;
}

.intake-note {
  margin: 0;
  padding: 0 0.25rem;
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--bm-ink-soft);
}

.status__flag {
  display: inline-block;
  margin-inline-start: 0.4rem;
  padding: 0.1rem 0.45rem;
  border-radius: 62.5rem;
  background: var(--bm-photo-soft);
  color: var(--bm-photo);
  font-size: 0.75rem;
  font-weight: 600;
  font-variant-numeric: normal;
}

/* Die zweite Karte bekommt eine Trennlinie statt einer eigenen Fläche — ein zweiter
   Kasten würde die Karte zerreißen, eine Linie ordnet sie einander zu. */
.status__primary--diaper {
  padding-top: 0.85rem;
  border-top: 1px solid var(--bm-hairline);
}

/* Der Name des anderen Geräts: farbig statt grau, weil er eine Handlung verhindern
   soll und nicht bloß Beiwerk ist. */
.status__by {
  margin-inline-start: 0.5rem;
  padding: 0.1rem 0.45rem;
  border-radius: 62.5rem;
  background: var(--bm-diaper-soft);
  color: color-mix(in srgb, var(--bm-diaper) 60%, var(--bm-ink));
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
}

.status__row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--bm-hairline);
  font-size: 0.95rem;
  color: var(--bm-ink-soft);
}

.status__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  flex: none;
}

.status__dot--pulse {
  animation: sleep-pulse 2.6s ease-in-out infinite;
}

@keyframes sleep-pulse {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 1;
  }
}

/* ── Eingabe ──────────────────────────────────────────────────────────────── */

.alerts {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.alert {
  padding: 0.85rem 1rem;
  border-radius: 1.125rem;
  border: 1px solid var(--bm-hairline);
  background: var(--bm-surface);
}

/* No red, no exclamation mark: the note should be read, not feared. */
.alert--watch {
  border-color: color-mix(in srgb, var(--bm-feed) 55%, transparent);
  background: var(--bm-feed-soft);
}

.alert__title {
  margin: 0;
  font-weight: 600;
}

.alert__detail {
  margin: 0.2rem 0 0;
  font-size: 0.875rem;
  line-height: 1.45;
  color: var(--bm-ink-soft);
}

.alerts__note {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--bm-ink-soft);
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.feed {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
  /* Deliberately tall: this is the target that has to be hit one-handed at night. */
  min-height: 5.5rem;
  padding: 1rem 1.25rem;
  border: none;
  border-radius: 1.5rem;
  background: var(--bm-feed);
  color: #2a2028;
  font: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: var(--bm-shadow-card);
  transition: transform 120ms ease, box-shadow 120ms ease;
}

.feed:active {
  transform: scale(0.985);
  box-shadow: var(--bm-shadow-lift);
}

.feed__icon svg {
  width: 2rem;
  height: 2rem;
}

.feed__text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.feed__title {
  font-family: var(--bm-font-display);
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.feed__hint {
  font-size: 0.875rem;
  opacity: 0.75;
}

.diapers {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.625rem;
}

.diaper {
  min-height: 3.75rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 1.125rem;
  background: var(--bm-diaper-soft);
  color: var(--bm-ink);
  font: inherit;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: transform 120ms ease;
}

.diaper:active {
  transform: scale(0.97);
}

.vitamin {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 1.25rem;
  background: var(--bm-surface);
  box-shadow: var(--bm-shadow-card);
}

.vitamin--done {
  border-color: color-mix(in srgb, var(--bm-diaper) 45%, transparent);
  background: var(--bm-diaper-soft);
}

/* Only clearer in the evening. A forgotten day is not an emergency — the app
   reminds, it does not nag. */
.vitamin--urgent {
  border-color: color-mix(in srgb, var(--bm-feed) 65%, transparent);
  background: var(--bm-feed-soft);
}

.vitamin__mark {
  width: 2rem;
  height: 2rem;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink-soft);
}

.vitamin--done .vitamin__mark {
  background: var(--bm-diaper);
  color: #fff;
}

.vitamin--urgent .vitamin__mark {
  color: var(--bm-ink);
}

.vitamin__mark svg {
  width: 1.15rem;
  height: 1.15rem;
}

.vitamin__text {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.vitamin__label {
  font-weight: 600;
}

.vitamin__hint {
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.vitamin__action {
  flex: none;
  min-height: 2.5rem;
  padding: 0 0.9rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 62.5rem;
  background: var(--bm-surface);
  color: var(--bm-ink);
  font: inherit;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
}

.running {
  background: var(--bm-surface);
  border-radius: 1.25rem;
  padding: 0.9rem 1rem;
  box-shadow: var(--bm-shadow-card);
}

.running__title {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--bm-ink-soft);
}

.running__item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.running__item + .running__item {
  margin-top: 0.6rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--bm-hairline);
}

.running__dot {
  width: 0.55rem;
  height: 0.55rem;
  flex: none;
  border-radius: 50%;
  animation: sleep-pulse 2.6s ease-in-out infinite;
}

.running__dot--sleep {
  background: var(--bm-sleep);
}
.running__dot--illness {
  background: var(--bm-photo);
}
.running__dot--absence {
  background: var(--bm-growth);
}

.running__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.running__label {
  font-weight: 600;
}

.running__since {
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.running__stop {
  flex: none;
  min-height: 2.5rem;
  padding: 0 0.9rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 62.5rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font: inherit;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
}

.secondary-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.625rem;
}

/* When a sleep is running its button sits above in "Currently running" — then the
   bath button gets the full width instead of a gap next to it. */
.secondary-row:has(.bath:only-child) {
  grid-template-columns: 1fr;
}

.bath {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 3.25rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 1.125rem;
  background: var(--bm-growth-soft);
  color: var(--bm-ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.bath svg {
  width: 1.2rem;
  height: 1.2rem;
}

.sleep {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 3.25rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 1.125rem;
  background: var(--bm-sleep-soft);
  color: var(--bm-ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.sleep svg {
  width: 1.2rem;
  height: 1.2rem;
}

.sleep--running {
  background: var(--bm-sleep);
  color: #fff;
  border-color: transparent;
}

/* ── Footer ───────────────────────────────────────────────────────────────── */

.history-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.9rem 1.1rem;
  border-radius: 1.125rem;
  background: var(--bm-surface);
  color: var(--bm-ink-soft);
  text-decoration: none;
  font-size: 0.95rem;
  font-weight: 500;
  box-shadow: var(--bm-shadow-card);
}

.history-link svg {
  width: 1.1rem;
  height: 1.1rem;
}
</style>
