<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { localTimeLabel, relativeSince } from "@babymonitor/shared";
import { useData } from "../stores/data.ts";
import { useUndo } from "../composables/useUndo.ts";
import FeedSheet from "../components/FeedSheet.vue";
import PhotoNudge from "../components/PhotoNudge.vue";
import AppHeader from "../components/AppHeader.vue";

const data = useData();
const confirmWithUndo = useUndo();

const feedSheetOpen = ref(false);

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
  const entry = data.draft("diaper", new Date(), { diaper: kind });
  await data.add(entry);
  confirmWithUndo(`Windel ${DIAPER_LABEL[kind]} eingetragen`, entry.id);
}

async function toggleSleep() {
  const running = data.activeSleep;
  if (running) {
    await data.update({ ...running, endedAt: new Date().toISOString() });
    return;
  }
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
        <p v-if="lastFeedText" class="status__detail bm-tabular">{{ lastFeedText.detail }}</p>
      </div>

      <div class="status__row">
        <span class="status__dot" :style="{ background: 'var(--bm-diaper)' }" />
        <template v-if="lastDiaperText">
          Windel {{ lastDiaperText.since }} · {{ lastDiaperText.detail }}
        </template>
        <template v-else>Noch keine Windel eingetragen</template>
      </div>

      <div v-if="sleepSince" class="status__row status__row--sleep">
        <span class="status__dot status__dot--pulse" :style="{ background: 'var(--bm-sleep)' }" />
        Schläft seit {{ sleepSince }}
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

      <button class="sleep" :class="{ 'sleep--running': data.activeSleep }" type="button" @click="toggleSleep">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
          <path d="M20 13.5A8 8 0 0 1 10.5 4a8 8 0 1 0 9.5 9.5Z" stroke-linejoin="round" />
        </svg>
        {{ data.activeSleep ? "Schlaf beenden" : "Schlaf starten" }}
      </button>
    </section>

    <PhotoNudge v-if="!data.currentWeekHasPhoto" />

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
