<script setup lang="ts">
import { computed, ref } from "vue";
import { uuidv7, type Child } from "@babymonitor/shared";
import { useData } from "../stores/data.ts";
import ChildForm from "./ChildForm.vue";
import { useI18n } from "vue-i18n";
import { REGIONS, DEFAULT_REGION } from "../data/regions/index.ts";


const { t } = useI18n();
/**
 * One-time setup. Afterwards everything here can be changed in Settings — none of it
 * sits in the code or in the configuration, so the app is not tailored to one
 * particular child.
 */
const data = useData();

const form = ref<Partial<Child>>({
  name: "",
  sex: "female",
  birthDate: new Date().toISOString().slice(0, 10),
  dueDate: null,
  birthWeightG: null,
  birthLengthMm: null,
  birthHeadMm: null,
});

/**
 * Country for check-ups and vaccinations.
 *
 * Prefilled from what the server passes along during setup (see install.sh) — otherwise
 * "no appointments". Deliberately NOT guessed from the device language: someone using a
 * German-language app in South Tyrol would otherwise get German vaccination dates.
 */
const region = ref(data.defaultRegion || DEFAULT_REGION);

const canSave = computed(() => !!form.value.name?.trim() && !!form.value.birthDate);
const busy = ref(false);

async function save() {
  if (!canSave.value) return;
  busy.value = true;
  await data.saveChild({
    id: uuidv7(),
    name: form.value.name!.trim(),
    sex: form.value.sex ?? "female",
    birthDate: form.value.birthDate!,
    dueDate: form.value.dueDate || null,
    birthWeightG: form.value.birthWeightG ?? null,
    birthLengthMm: form.value.birthLengthMm ?? null,
    birthHeadMm: form.value.birthHeadMm ?? null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin",
    region: region.value,
    // The location is set later in Settings — the weather is an extra and has no
    // business in the setup screen.
    latitude: null,
    longitude: null,
    placeName: null,
    editedAt: new Date().toISOString(),
  });

  // Take the birth measurements as the first point of the growth curve — otherwise the
  // curve only starts at the first check-up and the first weeks are missing forever.
  if (form.value.birthWeightG || form.value.birthLengthMm || form.value.birthHeadMm) {
    await data.add(
      data.draft("growth", new Date(`${form.value.birthDate}T12:00:00`), {
        weightG: form.value.birthWeightG ?? null,
        lengthMm: form.value.birthLengthMm ?? null,
        headMm: form.value.birthHeadMm ?? null,
        note: t("setup.atBirth"),
      }),
    );
  }

  busy.value = false;
}
</script>

<template>
  <div class="setup">
    <div class="setup__card">
      <p class="setup__eyebrow">{{ $t("setup.eyebrow") }}</p>
      <h1 class="setup__title">{{ $t("setup.title") }}</h1>
      <p class="setup__lead">
        {{ $t("setup.intro") }}
      </p>

      <ChildForm v-model="form" />

      <button class="setup__submit" type="button" :disabled="!canSave || busy" @click="save">
        {{ busy ? $t("setup.busy") : $t("setup.submit") }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.setup {
  min-height: 100dvh;
  display: grid;
  place-items: start center;
  padding: 1.5rem 1rem 3rem;
}

.setup__card {
  width: 100%;
  max-width: 30rem;
  padding: 2rem 1.5rem;
  background: var(--bm-surface);
  border-radius: 1.75rem;
  box-shadow: var(--bm-shadow-card);
}

.setup__eyebrow {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--bm-ink-soft);
}

.setup__title {
  margin: 0.35rem 0 0;
  font-size: 1.9rem;
}

.setup__lead {
  margin: 0.5rem 0 1.75rem;
  color: var(--bm-ink-soft);
  line-height: 1.5;
}

.setup__submit {
  width: 100%;
  min-height: 3.25rem;
  margin-top: 2rem;
  border: none;
  border-radius: 1.125rem;
  background: var(--bm-feed);
  color: #2a2028;
  font: inherit;
  font-size: 1.05rem;
  font-weight: 600;
  cursor: pointer;
}

.setup__submit:disabled {
  opacity: 0.5;
}
</style>
