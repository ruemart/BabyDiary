<script setup lang="ts">
/**
 * "Wieder ausgespuckt" — die Mahlzeit fand statt, die Menge zählt nicht.
 *
 * Bewusst ein Schalter und keine Mengenangabe: Wie viel von 120 ml zurückkam, kann
 * niemand beziffern. Die ehrliche Unterscheidung ist "im Kind angekommen" gegen
 * "vollständig zurück" — alles dazwischen wäre erfundene Genauigkeit.
 */
const model = defineModel<boolean>({ required: true });
</script>

<template>
  <button
    class="spat"
    :class="{ 'spat--on': model }"
    type="button"
    role="switch"
    :aria-checked="model"
    @click="model = !model"
  >
    <span class="spat__box" aria-hidden="true">
      <svg v-if="model" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="m5 12 5 5L19 7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
    <span class="spat__text">
      <span class="spat__label">Alles wieder ausgespuckt</span>
      <span class="spat__hint">Zählt nicht zur Tagesmenge</span>
    </span>
  </button>
</template>

<style scoped>
.spat {
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

.spat--on {
  border-color: color-mix(in srgb, var(--bm-photo) 55%, transparent);
  background: var(--bm-photo-soft);
}

.spat__box {
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

.spat--on .spat__box {
  background: var(--bm-photo);
  border-color: var(--bm-photo);
}

.spat__box svg {
  width: 0.9rem;
  height: 0.9rem;
}

.spat__text {
  display: flex;
  flex-direction: column;
}

.spat__label {
  font-weight: 600;
}

.spat__hint {
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}
</style>
