<script setup lang="ts">
import { ref, watch } from "vue";
import { useData } from "../stores/data.ts";
import { useUndo } from "../composables/useUndo.ts";
import SheetDialog from "./SheetDialog.vue";
import TimeField from "./TimeField.vue";
import AmountStepper from "./AmountStepper.vue";
import FlagToggle from "./FlagToggle.vue";
import MedicineToggles from "./MedicineToggles.vue";
import { useI18n } from "vue-i18n";


const { t } = useI18n();
const open = defineModel<boolean>("open", { required: true });

const data = useData();
const confirmWithUndo = useUndo();

const amount = ref(0);
const at = ref(new Date());
const note = ref("");
const spatUp = ref(false);
/** Ids of the medicines given with this bottle — see MedicineToggles. */
const medicines = ref<string[]>([]);

/**
 * Prefill freshly on open: amount to the median of the last seven feeds, time to now.
 * That makes the normal case two taps — open, save.
 */
watch(open, (isOpen) => {
  if (!isOpen) return;
  amount.value = data.suggestedAmountMl;
  at.value = new Date();
  note.value = "";
  spatUp.value = false;
  medicines.value = [];
});

async function save() {
  const entry = data.draft("feed", at.value, {
    amountMl: amount.value,
    spatUp: spatUp.value,
    note: note.value.trim() || null,
  });
  await data.add(entry);
  // Only now: a dose hangs off the feed and needs its id.
  await data.syncFeedDoses(entry.id, at.value, medicines.value);
  open.value = false;
  confirmWithUndo(
    spatUp.value
      ? t("feed.savedSpatUp", { amount: amount.value })
      : t("feed.saved", { amount: amount.value }),
    entry.id,
  );
}
</script>

<template>
  <SheetDialog v-model:open="open" :title="$t('entry.feed')">
    <div class="feed-sheet">
      <AmountStepper v-model="amount" />

      <TimeField v-model="at" />

      <FlagToggle
        v-model="spatUp"
        :label="$t('feed.spatUp.label')"
        :hint="$t('feed.spatUp.hint')"
      />
      <MedicineToggles v-model="medicines" :at="at" />

      <label class="note">
        <span class="note__label">{{ $t("common.noteLabel") }}</span>
        <!-- No speech recognition field of our own: the microphone key on the system keyboard
             dictates more reliably here than the Web Speech API, on both platforms. -->
        <textarea v-model="note" rows="2" :placeholder="$t('common.notePlaceholder')" />
      </label>
    </div>

    <template #actions>
      <button class="save" type="button" @click="save">{{ $t("common.save") }}</button>
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
