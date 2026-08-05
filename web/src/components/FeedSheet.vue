<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { localDayKey } from "@babymonitor/shared";
import { vitaminHolderOn } from "../composables/useVitaminD.ts";
import { useData } from "../stores/data.ts";
import { useUndo } from "../composables/useUndo.ts";
import SheetDialog from "./SheetDialog.vue";
import TimeField from "./TimeField.vue";
import AmountStepper from "./AmountStepper.vue";
import SpatUpToggle from "./SpatUpToggle.vue";
import VitaminDToggle from "./VitaminDToggle.vue";

const open = defineModel<boolean>("open", { required: true });

const data = useData();
const confirmWithUndo = useUndo();

const amount = ref(0);
const at = ref(new Date());
const note = ref("");
const spatUp = ref(false);
const vitaminD = ref(false);

/**
 * Hängt an dem Tag, auf den dieser Eintrag fällt, schon irgendwo das Vitamin D?
 *
 * Dann ist der Schalter gesperrt — dieses Blatt legt immer NEU an, ein zweiter Haken
 * am selben Tag wäre also entweder ein Versehen oder eine doppelte Gabe. Gefragt wird
 * nach dem Tag des Eintrags, weil sich die Zeit hier auch zurückstellen lässt.
 */
const vitaminAlreadyThatDay = computed(
  () => !!vitaminHolderOn(data.entries, data.timezone, localDayKey(at.value, data.timezone)),
);

/**
 * Beim Öffnen frisch vorbelegen: Menge auf den Median der letzten sieben Mahlzeiten,
 * Zeit auf jetzt. Damit ist der Normalfall zwei Taps — öffnen, speichern.
 */
watch(open, (isOpen) => {
  if (!isOpen) return;
  amount.value = data.suggestedAmountMl;
  at.value = new Date();
  note.value = "";
  spatUp.value = false;
  vitaminD.value = false;
});

async function save() {
  const entry = data.draft("feed", at.value, {
    amountMl: amount.value,
    spatUp: spatUp.value,
    vitaminD: vitaminD.value,
    note: note.value.trim() || null,
  });
  await data.add(entry);
  open.value = false;
  confirmWithUndo(
    spatUp.value ? `Flasche ${amount.value} ml — ausgespuckt` : `Flasche ${amount.value} ml gespeichert`,
    entry.id,
  );
}
</script>

<template>
  <SheetDialog v-model:open="open" title="Flasche">
    <div class="feed-sheet">
      <AmountStepper v-model="amount" />

      <TimeField v-model="at" />

      <SpatUpToggle v-model="spatUp" />
      <VitaminDToggle v-model="vitaminD" :already-given-that-day="vitaminAlreadyThatDay" />

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
