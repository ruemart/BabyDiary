<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { EntryType } from "@babymonitor/shared";
import { useData } from "../stores/data.ts";
import { useUndo } from "../composables/useUndo.ts";
import SheetDialog from "./SheetDialog.vue";
import TimeField from "./TimeField.vue";

/**
 * Nachtragen für alle Eintragsarten.
 *
 * Der Schnellzugriff auf dem Startbildschirm deckt den Normalfall ab. Dieses Blatt ist
 * für alles andere: vergessene Mahlzeiten, das Gewicht von der U-Untersuchung, den
 * ersten Zahn — jeweils mit frei wählbarem Zeitpunkt.
 */
const open = defineModel<boolean>("open", { required: true });

const data = useData();
const confirmWithUndo = useUndo();

const TYPES: { value: EntryType; label: string }[] = [
  { value: "feed", label: "Flasche" },
  { value: "diaper", label: "Windel" },
  { value: "sleep", label: "Schlaf" },
  { value: "growth", label: "Wachstum" },
  { value: "milestone", label: "Meilenstein" },
  { value: "note", label: "Notiz" },
];

const type = ref<EntryType>("feed");
const at = ref(new Date());
const endAt = ref<Date>(new Date());
const amountMl = ref(120);
const diaper = ref<"empty" | "wet" | "soiled">("wet");
const weightG = ref<number | null>(null);
const lengthMm = ref<number | null>(null);
const headMm = ref<number | null>(null);
const label = ref("");
const note = ref("");

watch(open, (isOpen) => {
  if (!isOpen) return;
  type.value = "feed";
  at.value = new Date();
  endAt.value = new Date();
  amountMl.value = data.suggestedAmountMl;
  diaper.value = "wet";
  weightG.value = null;
  lengthMm.value = null;
  headMm.value = null;
  label.value = "";
  note.value = "";
});

const canSave = computed(() => {
  switch (type.value) {
    case "feed":
      return amountMl.value >= 0;
    case "growth":
      return weightG.value !== null || lengthMm.value !== null || headMm.value !== null;
    case "milestone":
      return label.value.trim().length > 0;
    case "note":
      return note.value.trim().length > 0;
    case "sleep":
      return endAt.value.getTime() > at.value.getTime();
    default:
      return true;
  }
});

function num(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

async function save() {
  if (!canSave.value) return;

  const entry = data.draft(type.value, at.value, {
    amountMl: type.value === "feed" ? amountMl.value : null,
    diaper: type.value === "diaper" ? diaper.value : null,
    endedAt: type.value === "sleep" ? endAt.value.toISOString() : null,
    weightG: type.value === "growth" ? weightG.value : null,
    lengthMm: type.value === "growth" ? lengthMm.value : null,
    headMm: type.value === "growth" ? headMm.value : null,
    label: type.value === "milestone" ? label.value.trim() : null,
    note: note.value.trim() || null,
  });

  await data.add(entry);
  open.value = false;
  confirmWithUndo("Eintrag nachgetragen", entry.id);
}
</script>

<template>
  <SheetDialog v-model:open="open" title="Eintrag nachtragen">
    <div class="add">
      <div class="types" role="group" aria-label="Art des Eintrags">
        <button
          v-for="option in TYPES"
          :key="option.value"
          type="button"
          class="types__item"
          :class="{ 'types__item--active': type === option.value }"
          @click="type = option.value"
        >
          {{ option.label }}
        </button>
      </div>

      <template v-if="type === 'feed'">
        <label class="field">
          <span class="field__label">Menge</span>
          <span class="field__group">
            <input v-model.number="amountMl" type="number" inputmode="numeric" min="0" max="2000" />
            <span class="field__unit">ml</span>
          </span>
        </label>
      </template>

      <template v-else-if="type === 'diaper'">
        <div class="field">
          <span class="field__label">Zustand</span>
          <div class="segmented">
            <button
              v-for="option in [
                { value: 'empty', label: 'Leer' },
                { value: 'wet', label: 'Feucht' },
                { value: 'soiled', label: 'Voll' },
              ]"
              :key="option.value"
              type="button"
              class="segmented__item"
              :class="{ 'segmented__item--active': diaper === option.value }"
              @click="diaper = option.value as 'empty' | 'wet' | 'soiled'"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </template>

      <template v-else-if="type === 'growth'">
        <div class="grid">
          <label class="field">
            <span class="field__label">Gewicht</span>
            <span class="field__group">
              <input :value="weightG ?? ''" type="number" inputmode="numeric" @input="weightG = num(($event.target as HTMLInputElement).value)" />
              <span class="field__unit">g</span>
            </span>
          </label>
          <label class="field">
            <span class="field__label">Länge</span>
            <span class="field__group">
              <input :value="lengthMm ?? ''" type="number" inputmode="numeric" @input="lengthMm = num(($event.target as HTMLInputElement).value)" />
              <span class="field__unit">mm</span>
            </span>
          </label>
        </div>
        <label class="field">
          <span class="field__label">Kopfumfang</span>
          <span class="field__group">
            <input :value="headMm ?? ''" type="number" inputmode="numeric" @input="headMm = num(($event.target as HTMLInputElement).value)" />
            <span class="field__unit">mm</span>
          </span>
        </label>
      </template>

      <template v-else-if="type === 'milestone'">
        <label class="field">
          <span class="field__label">Was war es?</span>
          <input v-model="label" type="text" placeholder="z. B. Erstes Lächeln" />
        </label>
      </template>

      <TimeField v-model="at" />

      <div v-if="type === 'sleep'" class="field">
        <span class="field__label">Ende</span>
        <TimeField v-model="endAt" />
      </div>

      <label class="field">
        <span class="field__label">
          {{ type === "note" ? "Notiz" : "Notiz (optional)" }}
        </span>
        <textarea v-model="note" rows="2" />
      </label>
    </div>

    <template #actions>
      <button class="save" type="button" :disabled="!canSave" @click="save">Speichern</button>
    </template>
  </SheetDialog>
</template>

<style scoped>
.add {
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
}

.types {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.4rem;
}

.types__item {
  min-height: 2.75rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.types__item--active {
  background: var(--bm-feed);
  border-color: transparent;
  color: #2a2028;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field__label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--bm-ink-soft);
}

.field__group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.field__unit {
  color: var(--bm-ink-soft);
  font-size: 0.9rem;
}

.field input,
.field textarea {
  width: 100%;
  min-height: 2.875rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface);
  color: var(--bm-ink);
  font: inherit;
  font-size: 1rem;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.segmented {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
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
  background: var(--bm-diaper);
  border-color: transparent;
  color: #fff;
}

.save {
  width: 100%;
  min-height: 3.25rem;
  border: none;
  border-radius: 1.125rem;
  background: var(--bm-feed);
  color: #2a2028;
  font: inherit;
  font-size: 1.05rem;
  font-weight: 600;
  cursor: pointer;
}

.save:disabled {
  opacity: 0.5;
}
</style>
