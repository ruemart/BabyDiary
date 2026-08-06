<script setup lang="ts">
import { ref } from "vue";
import AddEntrySheet from "./AddEntrySheet.vue";

/**
 * The floating "add a past entry" button, plus the sheet it opens.
 *
 * Every screen that has it puts it in the same corner, at the same height, with the same
 * label — that is the whole value. A button that moves between screens has to be looked
 * for; one that never moves is found with the thumb alone, which is the only way it gets
 * used at four in the morning.
 *
 * The sheet lives in here rather than in each view, so a screen adds the feature with a
 * single tag and cannot accidentally wire up a different one.
 */
withDefaults(
  defineProps<{
    /**
     * Pre-fills the date and time. The history passes the day being looked at — someone
     * who has Tuesday open and taps this means Tuesday, not now. Left empty elsewhere,
     * where the sheet's own default (now) is the better guess.
     */
    defaultAt?: string | null;
  }>(),
  { defaultAt: null },
);

const open = ref(false);
</script>

<template>
  <button class="fab" type="button" :aria-label="$t('common.backdate')" @click="open = true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke-linecap="round" />
    </svg>
    <span class="fab__label">{{ $t("common.backdate") }}</span>
  </button>

  <AddEntrySheet v-model:open="open" :default-at="defaultAt" />
</template>

<style scoped>
.fab {
  position: fixed;
  inset-inline-end: 1rem;
  /* Clear of the bottom bar, and of the home indicator underneath it. */
  bottom: calc(5.5rem + env(safe-area-inset-bottom));
  z-index: 15;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 3.25rem;
  padding: 0 1.15rem 0 0.95rem;
  border: none;
  border-radius: 62.5rem;
  background: var(--bm-feed);
  color: #2a2028;
  font: inherit;
  font-weight: 600;
  box-shadow: var(--bm-shadow-lift);
  cursor: pointer;
}

.fab svg {
  width: 1.25rem;
  height: 1.25rem;
}

/* The label stays. A bare plus means whatever the screen behind it suggests — "add a day"
   over the history, "another bottle" over the today screen — and it means something
   different on each, which is precisely what this button must not do. */
.fab__label {
  font-size: 0.95rem;
}
</style>
