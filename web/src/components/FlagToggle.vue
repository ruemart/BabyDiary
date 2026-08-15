<script setup lang="ts">
import { computed } from "vue";

/**
 * A yes/no flag on a feed: brought back up, and one per medicine given with it.
 *
 * One component for all of them, because they are the same thing: a property of the same
 * feed, recorded in the same moment, with the same gesture. Three near-identical copies
 * of this markup existed before, and the third one was the point at which they would
 * start drifting apart — a different hit area here, a different tick there, and suddenly
 * two things that mean the same look different. There is no fixed number of them any
 * more, which only makes the point sharper.
 */
const model = defineModel<boolean>({ required: true });

const props = withDefaults(
  defineProps<{
    label: string;
    hint?: string;
    /**
     * Locked: the day's quota for this medicine is already used up elsewhere, and a
     * second tick would be either a slip or a double dose. Only medicines with a "times
     * a day" lock — one given as needed has no number to exceed, and bringing a feed
     * back up is per feed anyway.
     */
    locked?: boolean;
    /** Replaces `hint` while locked, to say why. */
    lockedHint?: string;
  }>(),
  { hint: "", locked: false, lockedHint: "" },
);

/** Locked only when it is not set here — the entry's own tick stays reversible. */
const isLocked = computed(() => props.locked && !model.value);
const shownHint = computed(() => (isLocked.value ? props.lockedHint || props.hint : props.hint));

function toggle() {
  if (isLocked.value) return;
  model.value = !model.value;
}
</script>

<template>
  <button
    class="flag"
    :class="{ 'flag--on': model, 'flag--locked': isLocked }"
    type="button"
    role="switch"
    :aria-checked="model"
    :aria-disabled="isLocked"
    :disabled="isLocked"
    @click="toggle"
  >
    <span class="flag__box" aria-hidden="true">
      <svg v-if="model" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="m5 12 5 5L19 7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
    <span class="flag__text">
      <span class="flag__label">{{ label }}</span>
      <span v-if="shownHint" class="flag__hint">{{ shownHint }}</span>
    </span>
  </button>
</template>

<style scoped>
.flag {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  min-height: 3.25rem;
  padding: 0.6rem 0.9rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 1.125rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.flag--on {
  border-color: color-mix(in srgb, var(--bm-diaper) 55%, transparent);
  background: var(--bm-diaper-soft);
}

.flag--locked {
  opacity: 0.55;
  cursor: not-allowed;
}

.flag__box {
  width: 1.5rem;
  height: 1.5rem;
  flex: none;
  display: grid;
  place-items: center;
  border: 2px solid var(--bm-hairline);
  border-radius: 0.5rem;
  background: var(--bm-surface);
  color: #fff;
}

.flag--on .flag__box {
  background: var(--bm-diaper);
  border-color: var(--bm-diaper);
}

.flag__box svg {
  width: 0.9rem;
  height: 0.9rem;
}

.flag__text {
  display: flex;
  flex-direction: column;
}

.flag__label {
  font-weight: 600;
}

.flag__hint {
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}
</style>
