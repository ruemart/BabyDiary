<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { getDisplayLocale } from "@milo/shared";


const { t } = useI18n();
/**
 * The moment of an entry.
 *
 * Two ways to operate one field, because there are two very different situations:
 *
 *  - The normal case is "just now". The minus chips are enough for that — no keyboard,
 *    no date picker, one-handed.
 *  - Catching up ("we forgot to record last night") needs a free date. That sits behind
 *    "another time" so it does not slow the normal case down.
 */
const model = defineModel<Date>({ required: true });

const props = withDefaults(
  defineProps<{
    /**
     * Allow moments in the future.
     *
     * Off by default: a feed that has not happened yet makes no sense. For the END of a
     * period it does — a holiday is quite reasonably recorded beforehand.
     */
    allowFuture?: boolean;
  }>(),
  { allowFuture: false },
);

const showExact = ref(false);

const timeLabel = computed(() =>
  model.value.toLocaleTimeString(getDisplayLocale(), { hour: "2-digit", minute: "2-digit" }),
);

const dayLabel = computed(() => {
  const today = new Date();
  const isToday = model.value.toDateString() === today.toDateString();
  if (isToday) return t("common.today");

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (model.value.toDateString() === yesterday.toDateString()) return t("common.yesterday");

  return model.value.toLocaleDateString(getDisplayLocale(), { day: "numeric", month: "short" });
});

/** Value for <input type="datetime-local"> — which expects LOCAL time without a zone. */
const exactValue = computed({
  get() {
    const d = model.value;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },
  set(value: string) {
    if (value) model.value = new Date(value);
  },
});

/**
 * Steps in both directions, arranged symmetrically.
 *
 * There used to be only minus steps — meant for the normal case "just now, minus a few
 * minutes". But catching up on a whole night, or setting the end of a period, means
 * working forwards just as often, and then half of it was simply missing.
 */
const STEPS = [5, 10, 15, 30, 60] as const;

function stepLabel(minutes: number): string {
  return minutes === 60 ? t("time.hourShort") : String(minutes);
}

function shift(minutes: number) {
  const next = new Date(model.value.getTime() + minutes * 60_000);
  // No going into the future without explicit permission.
  model.value = !props.allowFuture && next.getTime() > Date.now() ? new Date() : next;
}

function reset() {
  model.value = new Date();
  showExact.value = false;
}
</script>

<template>
  <div class="time">
    <div class="time__head">
      <span class="time__value bm-tabular">{{ timeLabel }}</span>
      <span class="time__day">{{ dayLabel }}</span>
      <button v-if="dayLabel !== $t('common.today') || showExact" class="time__reset" type="button" @click="reset">
        {{ $t("time.now2") }}
      </button>
    </div>

    <!-- Two rows, mirrored: minus on top, plus below. The symmetry makes it clear at a
         glance what the numbers mean — minutes, except for "1 h". -->
    <div class="time__steps">
      <div class="time__row">
        <button
          v-for="step in [...STEPS].reverse()"
          :key="`minus-${step}`"
          class="chip"
          type="button"
          :aria-label="$t('time.earlierAria', { label: step === 60 ? $t('time.oneHour') : $t('time.nMinutes', { n: step }) })"
          @click="shift(-step)"
        >
          −{{ stepLabel(step) }}
        </button>
      </div>
      <div class="time__row">
        <button
          v-for="step in STEPS"
          :key="`plus-${step}`"
          class="chip"
          type="button"
          :aria-label="$t('time.laterAria', { label: step === 60 ? $t('time.oneHour') : $t('time.nMinutes', { n: step }) })"
          @click="shift(step)"
        >
          +{{ stepLabel(step) }}
        </button>
      </div>
    </div>

    <button class="chip chip--ghost" type="button" @click="showExact = !showExact">
      {{ showExact ? $t("time.back") : $t("time.otherMoment") }}
    </button>

    <label v-if="showExact" class="time__exact">
      <span class="time__exact-label">{{ $t("time.exactLabel") }}</span>
      <input v-model="exactValue" type="datetime-local" />
    </label>
  </div>
</template>

<style scoped>
.time {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.time__head {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.time__value {
  font-family: var(--bm-font-display);
  font-size: 1.5rem;
  font-weight: 600;
}

.time__day {
  color: var(--bm-ink-soft);
  font-size: 0.95rem;
}

.time__reset {
  margin-inline-start: auto;
  border: none;
  background: none;
  padding: 0.25rem;
  color: var(--bm-ink-soft);
  font: inherit;
  font-size: 0.85rem;
  text-decoration: underline;
  cursor: pointer;
}

.time__steps {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.time__row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.35rem;
}

.chip {
  min-height: 2.5rem;
  padding: 0 0.5rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 62.5rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font: inherit;
  font-size: 0.9rem;
  cursor: pointer;
}

.chip--ghost {
  align-self: flex-start;
  padding-inline: 0.85rem;
  background: transparent;
  color: var(--bm-ink-soft);
}

.time__exact {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.time__exact-label {
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.time__exact input {
  min-height: 2.75rem;
  padding: 0 0.75rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface);
  color: var(--bm-ink);
  font: inherit;
  /* 16 px stops iOS from zooming in on focus. */
  font-size: 1rem;
}
</style>
