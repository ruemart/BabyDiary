<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { getDisplayLocale } from "@babymonitor/shared";


const { t } = useI18n();
/**
 * Zeitpunkt eines Eintrags.
 *
 * Zwei Bedienwege in einem Feld, weil es zwei sehr verschiedene Situationen gibt:
 *
 *  - Der Normalfall ist "gerade eben". Dafür genügen die Minus-Chips — ohne Tastatur,
 *    ohne Datumsauswahl, einhändig.
 *  - Der Nachtragefall ("gestern Abend haben wir vergessen einzutragen") braucht ein
 *    freies Datum. Das steckt hinter "Anderer Zeitpunkt", damit es den Normalfall
 *    nicht verlangsamt.
 */
const model = defineModel<Date>({ required: true });

const props = withDefaults(
  defineProps<{
    /**
     * Zukünftige Zeitpunkte zulassen.
     *
     * Standardmäßig aus: Eine Mahlzeit, die noch nicht stattgefunden hat, ergibt
     * keinen Sinn. Beim ENDE eines Zeitraums schon — einen Urlaub trägt man
     * durchaus vorher ein.
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

/** Wert für <input type="datetime-local"> — der erwartet LOKALE Zeit ohne Zone. */
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
 * Schritte in beide Richtungen, symmetrisch angeordnet.
 *
 * Vorher gab es nur Minus-Schritte — gedacht für den Normalfall "gerade eben, minus
 * ein paar Minuten". Beim Nachtragen einer ganzen Nacht oder beim Setzen eines
 * Zeitraum-Endes arbeitet man sich aber genauso oft vorwärts, und dann fehlte
 * schlicht die Hälfte.
 */
const STEPS = [5, 10, 15, 30, 60] as const;

function stepLabel(minutes: number): string {
  return minutes === 60 ? t("time.hourShort") : String(minutes);
}

function shift(minutes: number) {
  const next = new Date(model.value.getTime() + minutes * 60_000);
  // Ohne ausdrückliche Erlaubnis nicht in die Zukunft.
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

    <!-- Zwei Reihen, spiegelbildlich: minus oben, plus unten. Die Symmetrie macht
         auf einen Blick klar, was die Zahlen bedeuten — Minuten, außer "1 Std". -->
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
  /* 16 px verhindert, dass iOS beim Fokussieren hineinzoomt. */
  font-size: 1rem;
}
</style>
