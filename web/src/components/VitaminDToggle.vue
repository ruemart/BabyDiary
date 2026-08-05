<script setup lang="ts">
/**
 * "Vitamin D gegeben" an einer Mahlzeit.
 *
 * Bewusst genauso gebaut wie der Ausspuck-Schalter: Beides sind Kennzeichen an
 * derselben Mahlzeit, und zwei ähnliche Dinge sollen auch gleich aussehen und gleich
 * bedient werden.
 */
const model = defineModel<boolean>({ required: true });
</script>

<template>
  <button
    class="vit"
    :class="{ 'vit--on': model }"
    type="button"
    role="switch"
    :aria-checked="model"
    @click="model = !model"
  >
    <span class="vit__box" aria-hidden="true">
      <svg v-if="model" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="m5 12 5 5L19 7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
    <span class="vit__text">
      <span class="vit__label">Vitamin D gegeben</span>
      <span class="vit__hint">Die tägliche Gabe — einmal am Tag genügt</span>
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
