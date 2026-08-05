<script setup lang="ts">
import { useI18n } from "vue-i18n";

/**
 * Mengeneingabe mit großen Schaltflächen statt Tastatur.
 *
 * Wird an beiden Stellen benutzt, an denen eine Trinkmenge erfasst wird: im
 * Schnellzugriff und beim Nachtragen. Vorher hatte das Nachtragen ein nacktes
 * Zahlenfeld — dieselbe Handlung mit zwei verschiedenen Bedienungen, je nachdem
 * wo man hereinkommt. Ein Bedienelement, das an zwei Orten unterschiedlich
 * aussieht, muss man zweimal lernen.
 */
const model = defineModel<number>({ required: true });

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    unit?: string;
    step?: number;
    presets?: number[];
    max?: number;
  }>(),
  {
    unit: "ml",
    step: 10,
    presets: () => [20, 50],
    max: 2000,
  },
);

function adjust(delta: number) {
  model.value = Math.max(0, Math.min(props.max, model.value + delta));
}
</script>

<template>
  <div class="stepper">
    <div class="stepper__main">
      <button
        class="stepper__step"
        type="button"
        :aria-label="$t('stepper.less', { step, unit })"
        @click="adjust(-step)"
      >
        −
      </button>
      <!-- role=status: Vorlesewerkzeuge sollen die neue Menge ansagen, ohne dass der
           Fokus vom gerade gedrückten Knopf wegspringt. -->
      <div class="stepper__value" role="status" aria-live="polite">
        <span class="bm-tabular">{{ model }}</span>
        <span class="stepper__unit">{{ unit }}</span>
      </div>
      <button
        class="stepper__step"
        type="button"
        :aria-label="$t('stepper.more', { step, unit })"
        @click="adjust(step)"
      >
        +
      </button>
    </div>

    <div class="stepper__presets">
      <button
        v-for="preset in presets"
        :key="`minus-${preset}`"
        class="chip"
        type="button"
        @click="adjust(-preset)"
      >
        −{{ preset }}
      </button>
      <button
        v-for="preset in presets"
        :key="`plus-${preset}`"
        class="chip"
        type="button"
        @click="adjust(preset)"
      >
        +{{ preset }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.stepper {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.stepper__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.stepper__step {
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
  transition: transform 120ms ease;
}

.stepper__step:active {
  transform: scale(0.94);
}

.stepper__value {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  font-family: var(--bm-font-display);
  font-size: 3rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.stepper__unit {
  font-size: 1.25rem;
  color: var(--bm-ink-soft);
}

.stepper__presets {
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
</style>
