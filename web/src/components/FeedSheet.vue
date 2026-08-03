<script setup lang="ts">
import { ref, watch } from "vue";
import { useData } from "../stores/data.ts";
import { useUndo } from "../composables/useUndo.ts";
import SheetDialog from "./SheetDialog.vue";
import TimeField from "./TimeField.vue";

const open = defineModel<boolean>("open", { required: true });

const data = useData();
const confirmWithUndo = useUndo();

const amount = ref(0);
const at = ref(new Date());
const note = ref("");

/**
 * Beim Öffnen frisch vorbelegen: Menge auf den Median der letzten sieben Mahlzeiten,
 * Zeit auf jetzt. Damit ist der Normalfall zwei Taps — öffnen, speichern.
 */
watch(open, (isOpen) => {
  if (!isOpen) return;
  amount.value = data.suggestedAmountMl;
  at.value = new Date();
  note.value = "";
});

function adjust(delta: number) {
  amount.value = Math.max(0, Math.min(2000, amount.value + delta));
}

async function save() {
  const entry = data.draft("feed", at.value, {
    amountMl: amount.value,
    note: note.value.trim() || null,
  });
  await data.add(entry);
  open.value = false;
  confirmWithUndo(`Flasche ${amount.value} ml gespeichert`, entry.id);
}
</script>

<template>
  <SheetDialog v-model:open="open" title="Flasche">
    <div class="feed-sheet">
      <div class="amount">
        <button class="amount__step" type="button" aria-label="10 Milliliter weniger" @click="adjust(-10)">
          −
        </button>
        <div class="amount__value">
          <span class="bm-tabular">{{ amount }}</span>
          <span class="amount__unit">ml</span>
        </div>
        <button class="amount__step" type="button" aria-label="10 Milliliter mehr" @click="adjust(10)">
          +
        </button>
      </div>

      <div class="presets">
        <button v-for="step in [20, 50]" :key="`minus${step}`" class="chip" type="button" @click="adjust(-step)">
          −{{ step }}
        </button>
        <button v-for="step in [20, 50]" :key="`plus${step}`" class="chip" type="button" @click="adjust(step)">
          +{{ step }}
        </button>
      </div>

      <TimeField v-model="at" />

      <label class="note">
        <span class="note__label">Notiz (optional)</span>
        <!-- Kein eigenes Spracherkennungs-Feld: die Mikrofontaste der Systemtastatur
             diktiert hier zuverlässiger als die Web Speech API, auf beiden Plattformen. -->
        <textarea v-model="note" rows="2" placeholder="z. B. hat gespuckt" />
      </label>
    </div>

    <template #actions>
      <button class="save" type="button" @click="save">Speichern</button>
    </template>
  </SheetDialog>
</template>

<style scoped>
.feed-sheet {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.amount {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.amount__step {
  width: 3.5rem;
  height: 3.5rem;
  flex: none;
  border: 1px solid var(--bm-hairline);
  border-radius: 50%;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font-size: 1.75rem;
  line-height: 1;
  cursor: pointer;
}

.amount__step:active {
  transform: scale(0.94);
}

.amount__value {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  font-family: var(--bm-font-display);
  font-size: 3rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.amount__unit {
  font-size: 1.25rem;
  color: var(--bm-ink-soft);
}

.presets {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.4rem;
}

.chip {
  min-height: 2.5rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 62.5rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font: inherit;
  cursor: pointer;
}

.note {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.note__label {
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.note textarea {
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface);
  color: var(--bm-ink);
  font: inherit;
  font-size: 1rem;
  resize: vertical;
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
</style>
