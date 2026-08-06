<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { localDayKey } from "@milo/shared";
import { vitaminHolderOn } from "../composables/useVitaminD.ts";
import { useData } from "../stores/data.ts";
import { useUndo } from "../composables/useUndo.ts";
import SheetDialog from "./SheetDialog.vue";
import TimeField from "./TimeField.vue";
import AmountStepper from "./AmountStepper.vue";
import FlagToggle from "./FlagToggle.vue";
import { useI18n } from "vue-i18n";


const { t } = useI18n();
const open = defineModel<boolean>("open", { required: true });

const data = useData();
const confirmWithUndo = useUndo();

const amount = ref(0);
const at = ref(new Date());
const note = ref("");
const spatUp = ref(false);
const vitaminD = ref(false);
const colicDrops = ref(false);

/**
 * Does the day this entry falls on already carry the vitamin D somewhere?
 *
 * Then the switch is locked — this sheet always creates a NEW entry, so a second tick on
 * the same day would be either a slip or a double dose. The question is about the day of
 * the entry, because the time can be moved back here too.
 */
const vitaminAlreadyThatDay = computed(
  () => !!vitaminHolderOn(data.entries, data.timezone, localDayKey(at.value, data.timezone)),
);

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
  vitaminD.value = false;
  colicDrops.value = false;
});

async function save() {
  const entry = data.draft("feed", at.value, {
    amountMl: amount.value,
    spatUp: spatUp.value,
    vitaminD: vitaminD.value,
    colicDrops: colicDrops.value,
    note: note.value.trim() || null,
  });
  await data.add(entry);
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
      <FlagToggle
        v-model="vitaminD"
        :label="$t('feed.vitaminD.label')"
        :hint="$t('feed.vitaminD.hint')"
        :locked="vitaminAlreadyThatDay"
        :locked-hint="$t('feed.vitaminD.hintLocked')"
      />
      <FlagToggle
        v-model="colicDrops"
        :label="$t('feed.colicDrops.label')"
        :hint="$t('feed.colicDrops.hint')"
      />

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
