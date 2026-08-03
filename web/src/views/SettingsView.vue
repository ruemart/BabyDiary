<script setup lang="ts">
import { computed, ref } from "vue";
import { useToast } from "sit-onyx";
import type { Child } from "@babymonitor/shared";
import { useData } from "../stores/data.ts";
import { appearance, setAppearance, type AppearanceSetting } from "../composables/useAppearance.ts";
import { wipeLocal } from "../db/local.ts";
import ChildForm from "../components/ChildForm.vue";

const data = useData();
const toast = useToast();

const form = ref<Partial<Child>>({ ...(data.child ?? {}) });
const saving = ref(false);
const exporting = ref(false);

const APPEARANCES: { value: AppearanceSetting; label: string; hint: string }[] = [
  { value: "auto", label: "Automatisch", hint: "abends dunkel, tagsüber hell" },
  { value: "day", label: "Immer hell", hint: "" },
  { value: "night", label: "Immer dunkel", hint: "" },
];

const photoCount = computed(() => data.photosByWeek.size);

async function save() {
  if (!data.child || !form.value.name?.trim() || !form.value.birthDate) return;
  saving.value = true;
  await data.saveChild({
    ...data.child,
    name: form.value.name.trim(),
    sex: form.value.sex ?? data.child.sex,
    birthDate: form.value.birthDate,
    dueDate: form.value.dueDate || null,
    birthWeightG: form.value.birthWeightG ?? null,
    birthLengthMm: form.value.birthLengthMm ?? null,
    birthHeadMm: form.value.birthHeadMm ?? null,
    timezone: form.value.timezone ?? data.child.timezone,
    editedAt: new Date().toISOString(),
  });
  saving.value = false;
  toast.show({ headline: "Gespeichert", color: "success" });
}

async function downloadTimelapse() {
  exporting.value = true;
  try {
    const response = await fetch("/api/photos/timelapse", { credentials: "same-origin" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      toast.show({
        headline: "Zeitraffer nicht möglich",
        description:
          body.error === "not_enough_photos"
            ? "Dafür braucht es mindestens zwei Wochenfotos."
            : "Der Server konnte das Video nicht erzeugen.",
        color: "warning",
        duration: 8000,
      });
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${data.child?.name ?? "baby"}-zeitraffer.mp4`;
    link.click();
    URL.revokeObjectURL(url);
  } finally {
    exporting.value = false;
  }
}

async function signOut() {
  // Nur dieses Gerät zurücksetzen. Die Daten auf dem Server bleiben unangetastet —
  // das andere Handy und alle Einträge sind davon nicht betroffen.
  await wipeLocal();
  document.cookie = "bm_session=; Max-Age=0; path=/";
  location.href = "/start";
}
</script>

<template>
  <div class="settings">
    <h1 class="settings__title">Einstellungen</h1>

    <section class="card">
      <h2 class="card__title">Kind</h2>
      <ChildForm v-model="form" />
      <button class="primary" type="button" :disabled="saving" @click="save">
        {{ saving ? "Wird gespeichert …" : "Änderungen speichern" }}
      </button>
    </section>

    <section class="card">
      <h2 class="card__title">Darstellung</h2>
      <p class="card__lead">
        Nachts schaltet die App auf ein warmes, gedämpftes Erscheinungsbild — helles,
        blaustichiges Licht um drei Uhr macht das Wiedereinschlafen unnötig schwer.
      </p>
      <div class="options">
        <button
          v-for="option in APPEARANCES"
          :key="option.value"
          type="button"
          class="option"
          :class="{ 'option--active': appearance === option.value }"
          @click="setAppearance(option.value)"
        >
          <span class="option__label">{{ option.label }}</span>
          <span v-if="option.hint" class="option__hint">{{ option.hint }}</span>
        </button>
      </div>
    </section>

    <section class="card">
      <h2 class="card__title">Wochenfotos</h2>
      <p class="card__lead">
        {{ photoCount }} {{ photoCount === 1 ? "Foto" : "Fotos" }} gesammelt. Aus den
        Wochenfotos macht der Server ein Video in Reihenfolge der Wochen.
      </p>
      <button class="secondary" type="button" :disabled="exporting || photoCount < 2" @click="downloadTimelapse">
        {{ exporting ? "Wird erzeugt …" : "Zeitraffer herunterladen" }}
      </button>
    </section>

    <section class="card">
      <h2 class="card__title">Dieses Gerät</h2>
      <p class="card__lead">
        Einträge werden als <strong>{{ data.deviceName || "Wir" }}</strong> gespeichert.
      </p>
      <button class="danger" type="button" @click="signOut">Von diesem Gerät abmelden</button>
      <p class="card__note">
        Löscht nur die lokale Kopie auf diesem Telefon. Alle Einträge bleiben auf dem
        Server und auf dem anderen Gerät erhalten.
      </p>
    </section>
  </div>
</template>

<style scoped>
.settings {
  padding: 1.5rem 1rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.settings__title {
  font-size: 1.75rem;
}

.card {
  background: var(--bm-surface);
  border-radius: 1.5rem;
  padding: 1.25rem;
  box-shadow: var(--bm-shadow-card);
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.card__title {
  font-size: 1.15rem;
}

.card__lead {
  margin: 0;
  color: var(--bm-ink-soft);
  font-size: 0.9rem;
  line-height: 1.5;
}

.card__note {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--bm-ink-soft);
}

.options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  min-height: 3rem;
  padding: 0.6rem 0.9rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.option--active {
  border-color: var(--bm-feed);
  background: var(--bm-feed-soft);
}

.option__label {
  font-weight: 600;
}

.option__hint {
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.primary,
.secondary,
.danger {
  min-height: 3rem;
  border-radius: 1.125rem;
  border: 1px solid transparent;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.primary {
  background: var(--bm-feed);
  color: #2a2028;
}

.secondary {
  background: var(--bm-surface-sunk);
  border-color: var(--bm-hairline);
  color: var(--bm-ink);
}

.danger {
  background: transparent;
  border-color: color-mix(in srgb, var(--bm-photo) 50%, transparent);
  color: var(--bm-photo);
}

.primary:disabled,
.secondary:disabled {
  opacity: 0.5;
}
</style>
