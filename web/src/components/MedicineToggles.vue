<script setup lang="ts">
import { computed } from "vue";
import { localDayKey } from "@babydiary/shared";
import { useData } from "../stores/data.ts";
import { dayQuotaUsed, dosesOnDay } from "../composables/useMedicine.ts";
import { useDose } from "../i18n/format.ts";
import FlagToggle from "./FlagToggle.vue";
import { useI18n } from "vue-i18n";

/**
 * A tick per medicine, for the bottle sheets.
 *
 * The everyday case is still that the drops go into the bottle — which is why they are
 * recorded here, in the moment they happen, and not on a screen of their own that would
 * have to be visited afterwards. What used to be two fixed ticks (vitamin D and the
 * drops) is now one per medicine set up, and nothing at all while the list is empty.
 *
 * The component only ANSWERS which medicines are ticked; the doses are written by the
 * store when the feed is saved, because before that there is nothing for them to hang
 * off.
 */
const { t } = useI18n();

const selected = defineModel<string[]>({ required: true });
const props = defineProps<{
  /** The moment of the feed — the quota is asked about THAT day, not about today. */
  at: Date;
  /** The feed being edited, so its own doses do not lock its own ticks. */
  feedId?: string | null;
}>();

const data = useData();
const dose = useDose();

const rows = computed(() => {
  const day = localDayKey(props.at, data.timezone);

  return data.medicines.map((plan) => {
    const givenThatDay = dosesOnDay(data.entries, data.timezone, day, plan.id).filter(
      (d) => !props.feedId || d.withEntryId !== props.feedId,
    ).length;

    return {
      plan,
      /** The dose, so nobody has to remember how many drops it was. */
      hint: dose(plan.medicineAmount, plan.medicineUnit) ?? "",
      /**
       * Locked once the day's quota is used up elsewhere. A second tick would then be
       * either a slip or a double dose — the same guard vitamin D always had, now
       * derived from the medicine's own "times a day" instead of hard-coded to one.
       */
      locked: dayQuotaUsed(data.entries, data.timezone, day, plan, props.feedId ?? null),
      lockedHint: t("medicine.lockedFull", { n: givenThatDay }),
    };
  });
});

function toggle(id: string, on: boolean) {
  selected.value = on
    ? [...selected.value, id]
    : selected.value.filter((entry) => entry !== id);
}
</script>

<template>
  <FlagToggle
    v-for="row in rows"
    :key="row.plan.id"
    :model-value="selected.includes(row.plan.id)"
    :label="row.plan.label ?? ''"
    :hint="row.hint"
    :locked="row.locked"
    :locked-hint="row.lockedHint"
    @update:model-value="toggle(row.plan.id, $event)"
  />
</template>
