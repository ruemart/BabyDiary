<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { MEDICINE_UNITS, type MedicineUnit } from "@babydiary/shared";
import { useData } from "../stores/data.ts";
import type { LocalEntry } from "../db/local.ts";
import SheetDialog from "./SheetDialog.vue";
import { useI18n } from "vue-i18n";

/**
 * Setting up a medicine: name, how often a day, how much per dose.
 *
 * This is a SETTING, not an entry — which is why it lives behind Settings and not behind
 * the plus button. It is filled in once when a treatment starts and read a dozen times a
 * day afterwards, by the bottle sheet and the home screen.
 *
 * It is still stored as an entry (`medicineplan`). That is not a workaround: syncing,
 * conflict resolution and soft deletion already exist for entries, and a list that both
 * phones must agree on gets all three for free.
 */
const { t } = useI18n();

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{ plan?: LocalEntry | null }>();

const data = useData();

const isEditing = computed(() => !!props.plan);

const name = ref("");
const unit = ref<MedicineUnit>("drops");
const amount = ref("");
/** Null = as needed. The chips below make that a choice rather than an empty field. */
const timesPerDay = ref<number | null>(1);

const TIMES_OPTIONS = [null, 1, 2, 3, 4, 6] as const;

watch(open, (isOpen) => {
  if (!isOpen) return;
  const plan = props.plan;
  name.value = plan?.label ?? "";
  unit.value = plan?.medicineUnit ?? "drops";
  amount.value = plan?.medicineAmount === null || plan?.medicineAmount === undefined
    ? ""
    : String(plan.medicineAmount);
  timesPerDay.value = plan ? plan.medicineTimesPerDay : 1;
});

/**
 * "0,5" and "0.5" both mean half a pill.
 *
 * A German keyboard puts a comma there and a number field will not take it — the same
 * reason the temperature field on the illness sheet does this. Nothing at all is a valid
 * answer too: see `medicineAmount` in the schema.
 */
function parsedAmount(): number | null {
  const trimmed = amount.value.trim().replace(",", ".");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const canSave = computed(() => name.value.trim().length > 0);

async function save() {
  if (!canSave.value) return;

  const fields = {
    label: name.value.trim(),
    medicineUnit: unit.value,
    medicineAmount: parsedAmount(),
    medicineTimesPerDay: timesPerDay.value,
  };

  if (props.plan) {
    // Edited in place, deliberately unlike "What we buy": a corrected dose is a
    // correction, not a switch worth keeping a history of. What was actually given is
    // recorded on the doses themselves and stays untouched by this.
    await data.update({ ...props.plan, ...fields });
  } else {
    await data.add(data.draft("medicineplan", new Date(), fields));
  }
  open.value = false;
}

async function remove() {
  if (!props.plan) return;
  await data.remove(props.plan.id);
  open.value = false;
}
</script>

<template>
  <SheetDialog
    v-model:open="open"
    :title="isEditing ? $t('medicine.titleEdit') : $t('medicine.titleNew')"
  >
    <div class="med">
      <label class="field">
        <span class="field__label">{{ $t("medicine.name") }}</span>
        <input v-model="name" type="text" :placeholder="$t('medicine.namePlaceholder')" />
      </label>

      <div class="field">
        <span class="field__label">{{ $t("medicine.perDay") }}</span>
        <div class="chips">
          <button
            v-for="option in TIMES_OPTIONS"
            :key="option ?? 'asNeeded'"
            type="button"
            class="chip"
            :class="{ 'chip--active': timesPerDay === option }"
            @click="timesPerDay = option"
          >
            {{ option === null ? $t("medicine.asNeeded") : $t("medicine.timesN", { n: option }) }}
          </button>
        </div>
        <p class="field__hint">
          {{ timesPerDay === null ? $t("medicine.asNeededHint") : $t("medicine.perDayHint") }}
        </p>
      </div>

      <div class="field">
        <span class="field__label">{{ $t("medicine.dose") }}</span>
        <div class="dose">
          <input
            v-model="amount"
            type="text"
            inputmode="decimal"
            class="dose__amount"
            :placeholder="$t('medicine.dosePlaceholder')"
          />
          <div class="segmented">
            <button
              v-for="option in MEDICINE_UNITS"
              :key="option"
              type="button"
              class="segmented__item"
              :class="{ 'segmented__item--active': unit === option }"
              @click="unit = option"
            >
              {{ $t(`medicine.unitLabel.${option}`) }}
            </button>
          </div>
        </div>
        <p class="field__hint">{{ $t("medicine.doseHint") }}</p>
      </div>

      <!-- Removing is not deleting: the doses given stay in the history, because they
           happened. Only the medicine stops being offered. -->
      <button v-if="isEditing" class="remove" type="button" @click="remove">
        {{ $t("medicine.remove") }}
      </button>
      <p v-if="isEditing" class="field__hint">{{ $t("medicine.removeHint") }}</p>
    </div>

    <template #actions>
      <button class="save" type="button" :disabled="!canSave" @click="save">
        {{ isEditing ? $t("medicine.saveEdit") : $t("common.save") }}
      </button>
    </template>
  </SheetDialog>
</template>

<style scoped>
.med {
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field__label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--bm-ink-soft);
}

.field__hint {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--bm-ink-soft);
}

.field input {
  width: 100%;
  min-height: 2.875rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface);
  color: var(--bm-ink);
  font: inherit;
  font-size: 1rem;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.chip {
  min-height: 2.5rem;
  padding: 0 0.85rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 62.5rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.chip--active {
  background: var(--bm-growth);
  border-color: transparent;
  color: #fff;
}

.dose {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.dose__amount {
  flex: 0 0 5.5rem;
  text-align: center;
}

.segmented {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.35rem;
}

.segmented__item {
  min-height: 2.875rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.segmented__item--active {
  background: var(--bm-growth);
  border-color: transparent;
  color: #fff;
}

.remove {
  min-height: 3rem;
  border: 1px solid color-mix(in srgb, var(--bm-photo) 50%, transparent);
  border-radius: 1.125rem;
  background: transparent;
  color: var(--bm-photo);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
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

.save:disabled {
  opacity: 0.5;
}
</style>
