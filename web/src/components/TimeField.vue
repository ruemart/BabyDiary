<script setup lang="ts">
import { computed, ref } from "vue";

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

const showExact = ref(false);

const timeLabel = computed(() =>
  model.value.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
);

const dayLabel = computed(() => {
  const today = new Date();
  const isToday = model.value.toDateString() === today.toDateString();
  if (isToday) return "heute";

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (model.value.toDateString() === yesterday.toDateString()) return "gestern";

  return model.value.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
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
 * Vorwärts-Schritte erscheinen erst, wenn der gewählte Zeitpunkt erkennbar in der
 * Vergangenheit liegt.
 *
 * Im Normalfall ("gerade eben, minus ein paar Minuten") wären sie sinnlos und würden
 * die Leiste doppelt so breit machen. Beim Nachtragen einer ganzen Nacht braucht man
 * sie dagegen ständig — man setzt einmal 21:30 und arbeitet sich vorwärts.
 */
const isBackdating = computed(() => Date.now() - model.value.getTime() > 45 * 60_000);

function shift(minutes: number) {
  const next = new Date(model.value.getTime() - minutes * 60_000);
  // Nie in die Zukunft: Ein Eintrag, der noch nicht passiert ist, ergibt keinen Sinn.
  model.value = next.getTime() > Date.now() ? new Date() : next;
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
      <button v-if="dayLabel !== 'heute' || showExact" class="time__reset" type="button" @click="reset">
        auf jetzt
      </button>
    </div>

    <div class="time__chips">
      <button class="chip" type="button" @click="shift(5)">−5 Min</button>
      <button class="chip" type="button" @click="shift(15)">−15 Min</button>
      <button class="chip" type="button" @click="shift(30)">−30 Min</button>
      <template v-if="isBackdating">
        <button class="chip" type="button" @click="shift(-15)">+15 Min</button>
        <button class="chip" type="button" @click="shift(-60)">+1 Std</button>
      </template>
      <button class="chip chip--ghost" type="button" @click="showExact = !showExact">
        {{ showExact ? "Zurück" : "Anderer Zeitpunkt" }}
      </button>
    </div>

    <label v-if="showExact" class="time__exact">
      <span class="time__exact-label">Datum und Uhrzeit</span>
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

.time__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.chip {
  min-height: 2.5rem;
  padding: 0 0.85rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 62.5rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font: inherit;
  font-size: 0.9rem;
  cursor: pointer;
}

.chip--ghost {
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
