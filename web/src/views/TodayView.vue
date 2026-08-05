<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { localTimeLabel, relativeSince } from "@babymonitor/shared";
import { useToast } from "sit-onyx";
import { useData } from "../stores/data.ts";
import { useUndo } from "../composables/useUndo.ts";
import FeedSheet from "../components/FeedSheet.vue";
import PhotoNudge from "../components/PhotoNudge.vue";
import AppHeader from "../components/AppHeader.vue";
import { useAlerts, ALERT_DISCLAIMER } from "../composables/useAlerts.ts";
import { useWeather, describeTemperature } from "../composables/useWeather.ts";
import { useDailyIntake, INTAKE_NOTE } from "../composables/useDailyIntake.ts";
import { useOpenPeriods } from "../composables/useOpenPeriods.ts";
import { useVitaminD } from "../composables/useVitaminD.ts";
import { ageInDays, localDayKey } from "@babymonitor/shared";
import { onMounted } from "vue";

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
 * Vitamin D nachträglich an der letzten heutigen Mahlzeit setzen — oder wieder
 * aufheben. Damit muss niemand in den Verlauf, nur weil das Häkchen beim Eintragen
 * vergessen wurde.
 */
async function toggleVitaminD() {
  const targetId = vitaminD.value.entryId ?? vitaminD.value.latestFeedId;
  if (!targetId) return;
  const entry = data.entries.find((e) => e.id === targetId);
  if (!entry) return;
  await data.update({ ...entry, vitaminD: !entry.vitaminD });
}

/** Alles, was gerade läuft — Schlaf, Krankheit, Urlaub. Mehrere gleichzeitig möglich. */
const openPeriods = useOpenPeriods(() => data.entries, () => now.value);

async function endPeriod(id: string) {
  const entry = data.entries.find((e) => e.id === id);
  if (!entry) return;
  await data.update({ ...entry, endedAt: new Date().toISOString() });
}

async function logBath() {
  const entry = data.draft("bath", new Date());
  await data.add(entry);
  confirmWithUndo("Baden eingetragen", entry.id);
}

const { byDay, load: loadWeather } = useWeather();
onMounted(() => void loadWeather());

/** Wetter von heute — erklärt oft, warum sie mehr oder weniger trinkt. */
const todayWeather = computed(() => {
  const today = localDayKey(new Date(), data.timezone);
  const entry = byDay.value.get(today);
  if (!entry?.tmax) return null;
  return { tmax: Math.round(entry.tmax), label: describeTemperature(entry.tmax) };
});

/**
 * Tickt jede Sekunde. Die Zahl "vor 2 Std 15 Min" ist die eine Information, die
 * nachts wirklich gebraucht wird — sie darf nicht veraltet dastehen.
 */
const now = ref(new Date());
const tick = setInterval(() => (now.value = new Date()), 1000);
onUnmounted(() => clearInterval(tick));

const lastFeedText = computed(() => {
  const feed = data.lastFeed;
  if (!feed) return null;
  return {
    since: relativeSince(feed.startedAt, now.value),
    detail: `${feed.amountMl} ml um ${localTimeLabel(feed.startedAt, data.timezone)}`,
    // Ohne diesen Hinweis liest die Statuszeile wie eine erfolgte Aufnahme.
    spatUp: feed.spatUp === true,
  };
});

const lastDiaperText = computed(() => {
  const diaper = data.lastDiaper;
  if (!diaper) return null;
  return {
    since: relativeSince(diaper.startedAt, now.value),
    detail: DIAPER_LABEL[diaper.diaper ?? "empty"],
  };
});

const sleepSince = computed(() =>
  data.activeSleep ? relativeSince(data.activeSleep.startedAt, now.value) : null,
);

const DIAPER_LABEL: Record<string, string> = {
  empty: "leer",
  wet: "feucht",
  soiled: "voll",
  both: "voll",
};

const DIAPER_BUTTONS = [
  { kind: "empty" as const, label: "Leer" },
  { kind: "wet" as const, label: "Feucht" },
  { kind: "soiled" as const, label: "Voll" },
];

async function logDiaper(kind: "empty" | "wet" | "soiled") {
  const result = await data.logDiaper(kind);

  // Der Schutz gegen Doppeltaps darf nicht still zuschlagen: Wer nicht erfährt, dass
  // sein zweiter Tap verworfen wurde, tippt ein drittes Mal.
  if (result.action === "duplicate") {
    toast.show({
      headline: `Windel ${DIAPER_LABEL[kind]} war schon eingetragen`,
      description: "Gerade eben erfasst — kein zweiter Eintrag angelegt.",
      color: "neutral",
      duration: 4000,
    });
    return;
  }

  if (result.action === "corrected") {
    toast.show({
      headline: `Auf ${DIAPER_LABEL[kind]} geändert`,
      description: "Der Eintrag von gerade eben wurde angepasst.",
      color: "success",
      duration: 4000,
    });
    return;
  }

  confirmWithUndo(`Windel ${DIAPER_LABEL[kind]} eingetragen`, result.id);
}

async function startSleep() {
  const entry = data.draft("sleep", new Date());
  await data.add(entry);
  confirmWithUndo("Schlaf gestartet", entry.id);
}
</script>

<template>
  <div class="today">
    <AppHeader />

    <!-- Statuszeile: das, wofür man das Telefon nachts überhaupt anschaltet. -->
    <section class="status" aria-label="Aktueller Stand">
      <div class="status__primary">
        <p class="status__label">Letzte Flasche</p>
        <p v-if="lastFeedText" class="status__value bm-tabular">{{ lastFeedText.since }}</p>
        <p v-else class="status__value status__value--empty">noch keine</p>
        <p v-if="lastFeedText" class="status__detail bm-tabular">
          {{ lastFeedText.detail }}
          <span v-if="lastFeedText.spatUp" class="status__flag">ausgespuckt</span>
        </p>
      </div>

      <div class="status__row">
        <span class="status__dot" :style="{ background: 'var(--bm-diaper)' }" />
        <template v-if="lastDiaperText">
          Windel {{ lastDiaperText.since }} · {{ lastDiaperText.detail }}
        </template>
        <template v-else>Noch keine Windel eingetragen</template>
      </div>

      <!-- Tagesmenge als Einordnung, nicht als Sollvorgabe: Wie viel sie braucht,
           entscheidet sie selbst. Deshalb steht hier nie ein Rückstand. -->
      <div class="status__row status__row--intake">
        <span class="status__dot" :style="{ background: 'var(--bm-feed)' }" />
        <span>
          Heute <strong class="bm-tabular">{{ intake.todayMl }} ml</strong>
          <template v-if="intake.orientationMl"> · Richtwert etwa {{ intake.orientationMl }} ml</template>
          <span v-if="intake.praise" class="status__praise">{{ intake.praise }}</span>
        </span>
      </div>

      <div v-if="todayWeather" class="status__row">
        <span class="status__dot" :style="{ background: 'var(--bm-growth)' }" />
        Heute bis {{ todayWeather.tmax }} °C · {{ todayWeather.label }}
      </div>

    </section>

    <!-- Vitamin D: eigene Karte, nicht eine Zeile unter vielen. Die tägliche Gabe
         wird genau deshalb vergessen, weil sie so klein ist — und am Abend weiß
         niemand mehr sicher, ob sie nun passiert ist. -->
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
          {{ vitaminD.given ? `Vitamin D gegeben · ${vitaminD.atLabel}` : "Vitamin D heute noch offen" }}
        </span>
        <span v-if="!vitaminD.given && !vitaminD.latestFeedId" class="vitamin__hint">
          Beim nächsten Fläschchen mit ankreuzen.
        </span>
        <span v-else-if="!vitaminD.given" class="vitamin__hint">
          {{ vitaminD.urgent ? "Der Tag wird knapp." : "Beim Fläschchen ankreuzen oder hier eintragen." }}
        </span>
      </span>
      <button
        v-if="vitaminD.latestFeedId || vitaminD.entryId"
        class="vitamin__action"
        type="button"
        @click="toggleVitaminD"
      >
        {{ vitaminD.given ? "Rückgängig" : "Erledigt" }}
      </button>
    </section>

    <!-- Was gerade läuft. Ein Tap beendet es zum jetzigen Zeitpunkt — ohne dass
         beim Starten schon nach dem Ende gefragt werden musste. -->
    <section v-if="openPeriods.length" class="running" aria-label="Läuft gerade">
      <p class="running__title">Läuft gerade</p>
      <div v-for="period in openPeriods" :key="period.id" class="running__item">
        <span class="running__dot" :class="`running__dot--${period.kind}`" aria-hidden="true" />
        <span class="running__body">
          <span class="running__label">{{ period.title }}</span>
          <span class="running__since">{{ period.since }}</span>
        </span>
        <button class="running__stop" type="button" @click="endPeriod(period.id)">
          Beenden
        </button>
      </div>
    </section>

    <!-- Eingabe. Reihenfolge nach Häufigkeit, Größe nach Wichtigkeit. -->
    <section class="actions" aria-label="Eintragen">
      <button class="feed" type="button" @click="feedSheetOpen = true">
        <span class="feed__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M9 2h6M10 2v3.2a4 4 0 0 1-.5 1.9L8 9.5V21a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V9.5l-1.5-2.4a4 4 0 0 1-.5-1.9V2" />
            <path d="M8 13h8" stroke-linecap="round" />
          </svg>
        </span>
        <span class="feed__text">
          <span class="feed__title">Flasche</span>
          <span class="feed__hint bm-tabular">{{ data.suggestedAmountMl }} ml vorgeschlagen</span>
        </span>
      </button>

      <div class="diapers" role="group" aria-label="Windel eintragen">
        <button
          v-for="button in DIAPER_BUTTONS"
          :key="button.kind"
          class="diaper"
          type="button"
          @click="logDiaper(button.kind)"
        >
          {{ button.label }}
        </button>
      </div>

      <div class="secondary-row">
        <button v-if="!data.activeSleep" class="sleep" type="button" @click="startSleep">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M20 13.5A8 8 0 0 1 10.5 4a8 8 0 1 0 9.5 9.5Z" stroke-linejoin="round" />
          </svg>
          Schlaf starten
        </button>
        <button class="bath" type="button" @click="logBath">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M4 12h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-2Z" stroke-linejoin="round" />
            <path d="M7 12V6a2 2 0 0 1 3.6-1.2" stroke-linecap="round" />
          </svg>
          Baden
        </button>
      </div>
    </section>

    <!-- Hinweise: beobachtend formuliert, nie beurteilend. -->
    <section v-if="alerts.length" class="alerts" aria-label="Hinweise">
      <div v-for="alert in alerts" :key="alert.id" class="alert" :class="`alert--${alert.level}`">
        <p class="alert__title">{{ alert.title }}</p>
        <p class="alert__detail">{{ alert.detail }}</p>
      </div>
      <p class="alerts__note">{{ ALERT_DISCLAIMER }}</p>
    </section>

    <PhotoNudge v-if="!data.currentWeekHasPhoto" />

    <p v-if="intake.orientationMl" class="intake-note">{{ INTAKE_NOTE }}</p>

    <RouterLink to="/verlauf" class="history-link">
      Verlauf ansehen und nachtragen
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
  /* Groß genug, um es aus einem Meter Entfernung im Halbdunkeln zu lesen. */
  font-size: clamp(1.9rem, 8vw, 2.6rem);
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

/* Kein Rot, kein Ausrufezeichen: Der Hinweis soll gelesen, nicht gefürchtet werden. */
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
  /* Bewusst hoch: das ist das Ziel, das nachts einhändig getroffen werden muss. */
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

/* Erst am Abend deutlicher. Ein vergessener Tag ist kein Notfall — die App
   erinnert, sie mahnt nicht. */
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

/* Wenn der Schlaf läuft, steht sein Knopf oben in "Läuft gerade" — dann bekommt
   Baden die volle Breite statt einer Lücke daneben. */
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

/* ── Fußzeile ─────────────────────────────────────────────────────────────── */

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
