<script setup lang="ts">
import { computed } from "vue";
/**
 * "Vitamin D given" on a feed.
 *
 * Deliberately built exactly like the spat-up switch: both are flags on the same feed,
 * and two similar things should look and behave the same.
 */
const model = defineModel<boolean>({ required: true });

const props = withDefaults(
  defineProps<{
    /**
     * ANOTHER feed on the same day already carries the vitamin D.
     *
     * Then the switch is locked: once a day is enough, and a second tick would be either
     * a slip or a double dose — neither is something to record in passing.
     *
     * "The same day", not "today": when adding a past entry, the day of the entry counts.
     */
    alreadyGivenThatDay?: boolean;
  }>(),
  { alreadyGivenThatDay: false },
);

/** Locked only when it already sits elsewhere — the entry's own tick stays reversible. */
const locked = computed(() => props.alreadyGivenThatDay && !model.value);

function toggle() {
  if (locked.value) return;
  model.value = !model.value;
}
</script>

<template>
  <button
    class="vit"
    :class="{ 'vit--on': model, 'vit--locked': locked }"
    type="button"
    role="switch"
    :aria-checked="model"
    :aria-disabled="locked"
    :disabled="locked"
    @click="toggle"
  >
    <span class="vit__box" aria-hidden="true">
      <svg v-if="model" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="m5 12 5 5L19 7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
    <span class="vit__text">
      <span class="vit__label">{{ $t("feed.vitaminD.label") }}</span>
      <span class="vit__hint">
        <!-- "On this day" instead of "today": when adding a past entry the day meant is not
             necessarily today, and a wrong "today" would be worse than no note at all. -->
        {{ locked ? $t("feed.vitaminD.hintLocked") : $t("feed.vitaminD.hint") }}
      </span>
    </span>
  </button>
</template>

<style scoped>
.vit {
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

.vit--on {
  border-color: color-mix(in srgb, var(--bm-diaper) 55%, transparent);
  background: var(--bm-diaper-soft);
}

.vit--locked {
  opacity: 0.55;
  cursor: not-allowed;
}

.vit__box {
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

.vit--on .vit__box {
  background: var(--bm-diaper);
  border-color: var(--bm-diaper);
}

.vit__box svg {
  width: 0.9rem;
  height: 0.9rem;
}

.vit__text {
  display: flex;
  flex-direction: column;
}

.vit__label {
  font-weight: 600;
}

.vit__hint {
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}
</style>
