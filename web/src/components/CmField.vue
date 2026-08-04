<script setup lang="ts">
import { computed } from "vue";

/**
 * Längenangabe in Zentimetern.
 *
 * Gespeichert wird in Millimetern als ganze Zahl (keine Fließkomma-Rundung über
 * Jahre hinweg), eingegeben wird in Zentimetern mit einer Nachkommastelle — genau so,
 * wie es im Mutterpass und beim Kinderarzt steht: 52 cm, 35,5 cm.
 *
 * Die erste Fassung fragte Millimeter ab. Das war eine Speicher-Entscheidung, die in
 * die Bedienoberfläche durchgeschlagen ist, und sie hat prompt zu unbrauchbaren
 * Eingaben geführt. Einheiten gehören dorthin, wo der Mensch sie kennt.
 */
// `undefined` mit erlaubt, weil das Feld auch auf teilweise gefüllten Formularen
// (`Partial<Child>` beim Einrichten) sitzt — dort ist ein noch nie berührtes Feld
// undefined, kein null.
const model = defineModel<number | null | undefined>({ required: true });

defineProps<{ label: string; hint?: string }>();

const asText = computed({
  get() {
    if (model.value === null || model.value === undefined) return "";
    // Ganze Zentimeter ohne Nachkommastelle: "52" liest sich besser als "52,0".
    const cm = model.value / 10;
    return Number.isInteger(cm) ? String(cm) : String(cm).replace(".", ",");
  },
  set(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      model.value = null;
      return;
    }
    // Komma als Dezimaltrennzeichen: Auf einer deutschen Tastatur ist das die
    // naheliegende Eingabe, und `Number("35,5")` wäre NaN.
    const parsed = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(parsed)) return;
    model.value = Math.round(parsed * 10);
  },
});
</script>

<template>
  <label class="cm">
    <span class="cm__label">{{ label }}</span>
    <span class="cm__group">
      <!-- `text` mit inputmode `decimal`: `number` würde das Komma je nach
           Browsersprache verschlucken. -->
      <input
        v-model="asText"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        placeholder="z. B. 52"
      />
      <span class="cm__unit">cm</span>
    </span>
    <span v-if="hint" class="cm__hint">{{ hint }}</span>
  </label>
</template>

<style scoped>
.cm {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.cm__label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--bm-ink-soft);
}

.cm__group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cm__group input {
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

.cm__unit {
  color: var(--bm-ink-soft);
  font-size: 0.9rem;
}

.cm__hint {
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--bm-ink-soft);
}
</style>
