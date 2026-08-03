<script setup lang="ts">
import { reactive, watch } from "vue";
import type { Child, Sex } from "@babymonitor/shared";

/**
 * Stammdaten des Kindes. Wird sowohl beim ersten Start als auch in den Einstellungen
 * benutzt — dieselben Felder, damit später nichts anders heißt als beim Einrichten.
 */
const props = defineProps<{ modelValue: Partial<Child> }>();
const emit = defineEmits<{ "update:modelValue": [Partial<Child>] }>();

const form = reactive<Partial<Child>>({ ...props.modelValue });

watch(
  () => ({ ...form }),
  (next) => emit("update:modelValue", next),
  { deep: true },
);

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: "female", label: "Mädchen" },
  { value: "male", label: "Junge" },
];

/** Zahleneingabe: leeres Feld muss null werden, nicht 0. */
function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}
</script>

<template>
  <div class="form">
    <label class="field">
      <span class="field__label">Name</span>
      <input v-model="form.name" type="text" autocomplete="off" placeholder="Wie heißt sie oder er?" />
    </label>

    <fieldset class="field">
      <legend class="field__label">Geschlecht</legend>
      <div class="segmented">
        <button
          v-for="option in SEX_OPTIONS"
          :key="option.value"
          type="button"
          class="segmented__item"
          :class="{ 'segmented__item--active': form.sex === option.value }"
          @click="form.sex = option.value"
        >
          {{ option.label }}
        </button>
      </div>
      <!-- Ehrlich benennen, wofür das gebraucht wird — nicht als beiläufige Pflichtangabe. -->
      <p class="field__hint">
        Bestimmt, welche WHO-Wachstumskurven für den Vergleich herangezogen werden.
      </p>
    </fieldset>

    <label class="field">
      <span class="field__label">Geburtsdatum</span>
      <input v-model="form.birthDate" type="date" />
    </label>

    <label class="field">
      <span class="field__label">Errechneter Geburtstermin</span>
      <input v-model="form.dueDate" type="date" />
      <p class="field__hint">
        Die Entwicklungssprünge zählen ab diesem Datum, nicht ab der Geburt. Bei einem
        Frühchen verschiebt sich der Zeitstrahl sonst um Wochen. Kann leer bleiben.
      </p>
    </label>

    <div class="row">
      <label class="field">
        <span class="field__label">Geburtsgewicht</span>
        <span class="field__input-group">
          <input
            :value="form.birthWeightG ?? ''"
            type="number"
            inputmode="numeric"
            min="0"
            @input="form.birthWeightG = toNumber(($event.target as HTMLInputElement).value)"
          />
          <span class="field__unit">g</span>
        </span>
      </label>

      <label class="field">
        <span class="field__label">Geburtsgröße</span>
        <span class="field__input-group">
          <input
            :value="form.birthLengthMm ?? ''"
            type="number"
            inputmode="numeric"
            min="0"
            @input="form.birthLengthMm = toNumber(($event.target as HTMLInputElement).value)"
          />
          <span class="field__unit">mm</span>
        </span>
      </label>
    </div>

    <label class="field">
      <span class="field__label">Kopfumfang bei Geburt</span>
      <span class="field__input-group">
        <input
          :value="form.birthHeadMm ?? ''"
          type="number"
          inputmode="numeric"
          min="0"
          @input="form.birthHeadMm = toNumber(($event.target as HTMLInputElement).value)"
        />
        <span class="field__unit">mm</span>
      </span>
    </label>
  </div>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  border: none;
  padding: 0;
  margin: 0;
}

.field__label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--bm-ink-soft);
  padding: 0;
}

.field__hint {
  margin: 0.15rem 0 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--bm-ink-soft);
}

.field input {
  width: 100%;
  min-height: 2.875rem;
  padding: 0 0.75rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface);
  color: var(--bm-ink);
  font: inherit;
  /* 16 px: darunter zoomt iOS beim Fokussieren in das Feld hinein. */
  font-size: 1rem;
}

.field__input-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.field__unit {
  color: var(--bm-ink-soft);
  font-size: 0.9rem;
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.segmented {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.segmented__item {
  min-height: 2.875rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.segmented__item--active {
  background: var(--bm-growth);
  border-color: transparent;
  color: #fff;
}
</style>
