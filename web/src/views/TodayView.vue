<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { localTimeLabel, predictNext, type Rhythm } from "@babydiary/shared";
import { useDose, useDuration, useElapsed } from "../i18n/format.ts";
import { useConfirmToast } from "../composables/useConfirmations.ts";
import { useData } from "../stores/data.ts";
import { useUndo } from "../composables/useUndo.ts";
import FeedSheet from "../components/FeedSheet.vue";
import PhotoNudge from "../components/PhotoNudge.vue";
import BackdateFab from "../components/BackdateFab.vue";
import AppHeader from "../components/AppHeader.vue";
import { useAlerts } from "../composables/useAlerts.ts";
import { useWeather, describeTemperature } from "../composables/useWeather.ts";
import { useDailyIntake } from "../composables/useDailyIntake.ts";
import { useOpenPeriods } from "../composables/useOpenPeriods.ts";
import { useMedicines, type MedicineStatus } from "../composables/useMedicine.ts";
import { ageInDays, localDayKey } from "@babydiary/shared";
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";


const { t } = useI18n();
const { since: elapsedSinceLabel } = useElapsed();
const duration = useDuration();
const data = useData();
const confirmWithUndo = useUndo();
const confirm = useConfirmToast();

const feedSheetOpen = ref(false);

const { alerts } = useAlerts(
  () => data.entries,
  () => data.timezone,
  () => (data.child ? ageInDays(data.child.birthDate, new Date(), data.timezone) : 0),
);

const intake = useDailyIntake(() => data.entries, () => data.timezone);

const dose = useDose();

const medicines = useMedicines(
  () => data.entries,
  () => data.timezone,
  () => now.value,
  () => data.medicines,
);

/**
 * Record a dose here, without a bottle.
 *
 * The everyday path is the tick in the bottle sheet — the drops go in the bottle. This
 * is for everything that does not: a pill in the morning, a dose the day nobody drank
 * from a bottle at the right time, or simply the tick that was forgotten.
 */
async function giveMedicine(medicine: MedicineStatus) {
  const id = await data.logMedicine(medicine.plan, new Date());
  confirmWithUndo(t("medicine.saved", { name: medicine.name }), id);
}

/** Taking it back off: the same button, once everything for the day is given. */
async function undoMedicine(medicine: MedicineStatus) {
  if (medicine.lastDoseId) await data.remove(medicine.lastDoseId);
}

/** "1 drop · given 08:12", "2 of 3 today", "not yet today" — whatever is true. */
function medicineStatusText(medicine: MedicineStatus): string {
  /**
   * The ceiling speaks first once it is reached. It is the only line here that is about
   * a limit rather than a routine, and reading it after "3× today" would bury it.
   */
  if (medicine.overMax) {
    return t("medicine.overMax", { n: medicine.givenToday, max: medicine.maxPerDay });
  }
  if (medicine.atMax) {
    return t("medicine.atMax", { max: medicine.maxPerDay });
  }
  if (medicine.timesPerDay === null) {
    return medicine.givenToday === 0
      ? t("medicine.asNeeded")
      : t("medicine.timesToday", { n: medicine.givenToday, time: medicine.lastAtLabel });
  }
  // One a day has a time worth naming — "given at 08:12" answers the question exactly.
  // Beyond one, the count is the answer and the times would be a list.
  if (medicine.complete && medicine.timesPerDay === 1) {
    return t("medicine.doneAt", { time: medicine.lastAtLabel });
  }
  return t("medicine.openToday", { given: medicine.givenToday, target: medicine.timesPerDay });
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

/* ── Wann kommt das Nächste? ──────────────────────────────────────────────── */

/**
 * The estimate is the child's own rhythm, and the same one the bottle reminder uses —
 * see `shared/rhythm`. Not a table, and not a target: what it answers is "roughly when",
 * so that whoever takes the next shift can plan, and so nobody has to work it out from
 * the timestamps at three in the morning.
 */
const nextFeed = computed(() =>
  predictNext(data.entries.filter((e) => e.type === "feed")),
);
const nextDiaper = computed(() =>
  predictNext(data.entries.filter((e) => e.type === "diaper")),
);

/**
 * Once the expected moment has passed the line does NOT start counting how late it is.
 *
 * A child who sleeps through the usual gap has not missed anything, and a screen that
 * says "40 minutes overdue" invents a duty out of an average. "Any time now" is both
 * calmer and more accurate — that really is all the median knows by then.
 */
function nextText(rhythm: Rhythm | null): { text: string; typical: string } | null {
  if (!rhythm) return null;
  return {
    text:
      rhythm.dueAt > now.value.getTime()
        ? t("today.nextAround", { time: localTimeLabel(new Date(rhythm.dueAt), data.timezone) })
        : t("today.nextAnyTime"),
    // The rhythm behind the estimate, for anyone who wants to know where it comes from.
    typical: t("today.nextTypical", { duration: duration(rhythm.typicalGapMinutes) }),
  };
}

const nextFeedText = computed(() => nextText(nextFeed.value));
const nextDiaperText = computed(() => nextText(nextDiaper.value));

const lastFeedText = computed(() => {
  const feed = data.lastFeed;
  if (!feed) return null;
  return {
    since: elapsedSinceLabel(feed.startedAt, now.value),
    detail: t("today.feedDetail", {
      amount: feed.amountMl,
      time: localTimeLabel(feed.startedAt, data.timezone),
    }),
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
    detail: t("today.diaperDetail", {
      kind: t(DIAPER_KEY[diaper.diaper ?? "empty"]!),
      time: localTimeLabel(diaper.startedAt, data.timezone),
    }),
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
  // tap was discarded will tap a third time. With confirmations switched off the status
  // card carries that instead — it already reads "just now" from the first tap, so the
  // second one landing nowhere is exactly what it looks like.
  if (result.action === "duplicate") {
    confirm({
      headline: t("today.diaperAlready", { kind: t(DIAPER_KEY[kind]!) }),
      description: t("today.duplicateDetail"),
      color: "neutral",
      duration: 4000,
    });
    return;
  }

  if (result.action === "corrected") {
    confirm({
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
      <!-- Bottle and nappy side by side and of equal rank.
           The nappy used to be a grey line under the large bottle figure — and that is
           exactly why the same nappy got recorded twice: it was not seen before the tap.
           Two columns rather than two blocks stacked, so both are in view without
           scrolling. And one mark each in the colour of the entry type: two columns
           styled alike have to be READ to be told apart, while shape and colour are
           recognised before that. -->
      <div class="status__pair">
        <div class="status__primary">
          <p class="status__label">
            <svg class="status__icon status__icon--feed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M9 2h6M10 2v3.2a4 4 0 0 1-.5 1.9L8 9.5V21a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V9.5l-1.5-2.4a4 4 0 0 1-.5-1.9V2" />
              <path d="M8 13h8" stroke-linecap="round" />
            </svg>
            {{ $t("today.lastFeed") }}
          </p>
          <p v-if="lastFeedText" class="status__value bm-tabular">{{ lastFeedText.since }}</p>
          <p v-else class="status__value status__value--empty">{{ $t("today.none") }}</p>
          <p v-if="lastFeedText" class="status__detail bm-tabular">
            {{ lastFeedText.detail }}
            <span v-if="lastFeedText.spatUp" class="status__flag">{{ $t("today.spatUp") }}</span>
          </p>
          <p v-if="lastFeedText?.by" class="status__by">
            {{ $t("today.byOther", { name: lastFeedText.by }) }}
          </p>
          <!-- Not a target, an estimate: see `nextText`. -->
          <p v-if="nextFeedText" class="status__next bm-tabular" :title="nextFeedText.typical">
            {{ nextFeedText.text }}
          </p>
        </div>

        <div class="status__primary status__primary--diaper">
          <p class="status__label">
            <!-- Windel: breit oben, nach unten zusammenlaufend — und GEFÜLLT, während
                 die Flasche daneben ein Umriss ist. Zwei Zeichen derselben Machart
                 unterscheidet man erst beim Hinsehen; gefüllt gegen offen sieht man
                 sofort, und die Farbe bestätigt es nur noch. -->
            <svg class="status__icon status__icon--diaper" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M4 5h16v5.2c0 3.8-2.8 5.7-5 6.7-1.6 .8-2.4 1.9-3 4.1-.6-2.2-1.4-3.3-3-4.1-2.2-1-5-2.9-5-6.7V5Z" />
            </svg>
            {{ $t("today.lastDiaperLabel") }}
          </p>
          <p v-if="lastDiaperText" class="status__value bm-tabular">{{ lastDiaperText.since }}</p>
          <p v-else class="status__value status__value--empty">{{ $t("today.noDiaperYet") }}</p>
          <p v-if="lastDiaperText" class="status__detail bm-tabular">{{ lastDiaperText.detail }}</p>
          <!-- Der Name des anderen ist hier die wichtigste Information: Er beantwortet
               "hat das schon jemand eingetragen?", bevor man es ein zweites Mal tut. -->
          <p v-if="lastDiaperText?.by" class="status__by">
            {{ $t("today.byOther", { name: lastDiaperText.by }) }}
          </p>
          <p v-if="nextDiaperText" class="status__next bm-tabular" :title="nextDiaperText.typical">
            {{ nextDiaperText.text }}
          </p>
        </div>
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

    <!-- Medicine: one line per medicine set up, and nothing at all while the list is
         empty. A daily dose gets forgotten precisely because it is so small — no
         occasion of its own, no feedback, and by the evening nobody is sure any more
         whether it happened. That is the one question this answers. -->
    <section v-if="medicines.length" class="meds" :aria-label="$t('medicine.title')">
      <div
        v-for="medicine in medicines"
        :key="medicine.id"
        class="med"
        :class="{
          'med--done': (medicine.complete || medicine.atMax) && !medicine.overMax,
          'med--urgent': medicine.urgent,
          'med--over': medicine.overMax,
        }"
      >
        <span class="med__mark" aria-hidden="true">
          <svg v-if="medicine.overMax" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
            <path d="M12 4 2.5 20h19L12 4Z" stroke-linejoin="round" />
            <path d="M12 10v4" stroke-linecap="round" />
            <path d="M12 17h.01" stroke-linecap="round" />
          </svg>
          <svg
            v-else-if="medicine.complete || medicine.atMax"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <path d="m5 12 5 5L19 7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4.5" stroke-linecap="round" />
            <path d="M12 16h.01" stroke-linecap="round" />
          </svg>
        </span>
        <span class="med__text">
          <span class="med__label">{{ medicine.name }}</span>
          <span class="med__hint">
            {{ medicineStatusText(medicine) }}
            <template v-if="dose(medicine.amount, medicine.unit)">
              · {{ dose(medicine.amount, medicine.unit) }}
            </template>
          </span>
        </span>
        <!-- At the ceiling the one-tap way to record another closes, and what is left is
             the way back. Not a dead end: an eighth dose that really was given still
             goes in through "Add entry", deliberately, where the number can be seen.
             An app that refuses to record what happened would be keeping a diary of
             what should have happened. -->
        <button
          v-if="medicine.complete || medicine.atMax"
          class="med__action"
          type="button"
          @click="undoMedicine(medicine)"
        >
          {{ $t("medicine.undo") }}
        </button>
        <button v-else class="med__action" type="button" @click="giveMedicine(medicine)">
          {{ $t("medicine.give") }}
        </button>
      </div>
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

    <FeedSheet v-model:open="feedSheetOpen" />
    <BackdateFab />
  </div>
</template>

<style scoped>
.today {
  /* Room at the bottom for the floating button — otherwise it sits on the last card. */
  padding: 0 1rem 5.5rem;
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
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--bm-ink-soft);
}

.status__value {
  margin: 0.15rem 0 0;
  font-family: var(--bm-font-display);
  /* Big enough to read from a metre away in half darkness. In a half-width column,
     so smaller than when it stood alone — still far above everything else. */
  font-size: clamp(1.05rem, 4.6vw, 1.45rem);
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

/* Zwei Spalten. Die Trennlinie steht senkrecht dazwischen statt waagrecht darunter —
   damit lesen sich beide als gleichrangig und nicht als Haupt- und Nebensache. */
.status__pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.9rem;
}

.status__primary {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.status__primary--diaper {
  padding-inline-start: 0.9rem;
  border-inline-start: 1px solid var(--bm-hairline);
}

/* Zeichen in der Farbe der Eintragsart. Form UND Farbe, damit man die Spalten
   unterscheidet, bevor man liest. */
.status__icon {
  width: 0.95rem;
  height: 0.95rem;
  flex: none;
}

.status__icon--feed {
  color: var(--bm-feed);
}

.status__icon--diaper {
  color: var(--bm-diaper);
}

/* The other device's name. Set apart enough to be noticed, but WITHOUT the colour of an
   entry type: it names a person, not a category — in nappy green it would read as part
   of the nappy reading. */
.status__by {
  margin: 0.25rem 0 0;
  align-self: start;
  width: fit-content;
  padding: 0.1rem 0.5rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 62.5rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

/* Everything above this line happened. This line has not.
   The dashed rule is the same convention a chart uses for a projection, and it is what
   keeps "nächste gegen 17:37" from being read as another recorded time — side by side
   with "120 ml um 14:35" the wording alone was not enough. */
.status__next {
  margin: 0.45rem 0 0;
  padding-top: 0.4rem;
  border-top: 1px dashed var(--bm-hairline);
  font-size: 0.75rem;
  line-height: 1.3;
  color: var(--bm-ink-soft);
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

.meds {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.med {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 1.25rem;
  background: var(--bm-surface);
  box-shadow: var(--bm-shadow-card);
}

.med--done {
  border-color: color-mix(in srgb, var(--bm-diaper) 45%, transparent);
  background: var(--bm-diaper-soft);
}

/* Only clearer in the evening. A forgotten day is not an emergency — the app
   reminds, it does not nag. */
.med--urgent {
  border-color: color-mix(in srgb, var(--bm-feed) 65%, transparent);
  background: var(--bm-feed-soft);
}

/* Over the household's own ceiling. The one state here that is not about a routine,
   so the only one that gets a colour of its own — still no red, and still no alarm:
   it says what the entries say and leaves the conclusion to the people reading it. */
.med--over {
  border-color: color-mix(in srgb, var(--bm-photo) 60%, transparent);
  background: var(--bm-photo-soft);
}

.med--over .med__mark {
  background: var(--bm-photo);
  color: #fff;
}

.med__mark {
  width: 2rem;
  height: 2rem;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink-soft);
}

.med--done .med__mark {
  background: var(--bm-diaper);
  color: #fff;
}

.med--urgent .med__mark {
  color: var(--bm-ink);
}

.med__mark svg {
  width: 1.15rem;
  height: 1.15rem;
}

.med__text {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.med__label {
  font-weight: 600;
}

.med__hint {
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.med__action {
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

</style>
