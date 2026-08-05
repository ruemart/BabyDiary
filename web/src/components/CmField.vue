<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

/**
 * A length in centimetres.
 *
 * Stored in millimetres as an integer (no floating-point rounding over years), entered
 * in centimetres with one decimal — exactly the way it is written in the health booklet
 * and at the doctor's: 52 cm, 35.5 cm.
 *
 * The first version asked for millimetres. That was a storage decision leaking into the
 * user interface, and it promptly led to unusable input. Units belong where the person
 * knows them.
 */
// `undefined` allowed as well, because the field also sits on partially filled forms
// (`Partial<Child>` during setup) — there a never-touched field is undefined, not null.
const model = defineModel<number | null | undefined>({ required: true });

defineProps<{ label: string; hint?: string }>();

const asText = computed({
  get() {
    if (model.value === null || model.value === undefined) return "";
    // Whole centimetres without a decimal: "52" reads better than "52.0".
    const cm = model.value / 10;
    return Number.isInteger(cm) ? String(cm) : String(cm).replace(".", ",");
  },
  set(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      model.value = null;
      return;
    }
    // Comma as the decimal separator: on a German keyboard that is the obvious input,
    // and `Number("35,5")` would be NaN.
    const parsed = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(parsed)) return;
    model.value = Math.round(parsed * 10);
  },
});
</script>

<template>
  <label class="cm">
    <span class="cm__label">{{ label }}</span>
    <span class="cm__group">
      <!-- `text` with inputmode `decimal`: `number` would swallow the comma depending on
           the browser language. -->
      <input
        v-model="asText"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        :placeholder="$t('cm.placeholder')"
      />
      <span class="cm__unit">cm</span>
    </span>
    <span v-if="hint" class="cm__hint">{{ hint }}</span>
  </label>
</template>

<style scoped>
.cm {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.cm__label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--bm-ink-soft);
}

.cm__group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cm__group input {
  width: 100%;
  min-height: 2.875rem;
  padding: 0 0.75rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface);
  color: var(--bm-ink);
  font: inherit;
  /* 16 px: below that, iOS zooms into the field on focus. */
  font-size: 1rem;
}

.cm__unit {
  color: var(--bm-ink-soft);
  font-size: 0.9rem;
}

.cm__hint {
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--bm-ink-soft);
}
</style>
