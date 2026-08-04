<script setup lang="ts">
import { computed, ref } from "vue";
import { useToast } from "sit-onyx";
import type { Child } from "@babymonitor/shared";
import { useData } from "../stores/data.ts";
import { appearance, setAppearance, type AppearanceSetting } from "../composables/useAppearance.ts";
import { wipeLocal } from "../db/local.ts";
import ChildForm from "../components/ChildForm.vue";
import { RouterLink } from "vue-router";

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

const childRejected = computed(() => data.invalidEntries.find((i) => i.id === "child"));

/* ── Ort für das Wetter ───────────────────────────────────────────────────── */

type Place = { name: string; latitude: number; longitude: number; admin?: string };

const placeQuery = ref("");
const placeResults = ref<Place[]>([]);
const searching = ref(false);

async function searchPlace() {
  const q = placeQuery.value.trim();
  if (q.length < 2) return;
  searching.value = true;
  try {
    const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`, {
      credentials: "same-origin",
      signal: AbortSignal.timeout(10_000),
    });
    placeResults.value = res.ok ? await res.json() : [];
  } catch {
    placeResults.value = [];
  } finally {
    searching.value = false;
  }
}

async function choosePlace(place: Place) {
  if (!data.child) return;
  await data.saveChild({
    ...data.child,
    latitude: place.latitude,
    longitude: place.longitude,
    placeName: place.admin ? `${place.name} (${place.admin})` : place.name,
    editedAt: new Date().toISOString(),
  });
  placeResults.value = [];
  placeQuery.value = "";
  toast.show({ headline: `Ort auf ${place.name} gesetzt`, color: "success" });
}

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
  // Der Hinweis verschwindet erst, wenn der Server die neuen Werte annimmt.
  await data.pushNow();
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

    <!-- Die Stammdaten werden vom Server abgelehnt. Der Hinweis gehört genau hierhin,
         wo sie sich auch korrigieren lassen — nicht in eine allgemeine Fehlerliste. -->
    <div v-if="childRejected" class="warning" role="alert">
      <p class="warning__title">Die Angaben zum Kind werden nicht übertragen</p>
      <p class="warning__text">
        Ein Wert liegt außerhalb des Erlaubten — meist die Geburtsgröße oder der
        Kopfumfang. Bitte in Zentimetern eintragen (z. B. 52) und speichern.
      </p>
      <p class="warning__reason">{{ childRejected.reason }}</p>
    </div>

    <!-- Ganz oben, weil man das im Laden nachschlägt und nicht suchen will. -->
    <nav class="shortcuts">
      <RouterLink to="/vorrat" class="shortcut">
        <span class="shortcut__label">Was wir kaufen</span>
        <span class="shortcut__hint">Milchnahrung, Windelgröße, Laden</span>
      </RouterLink>
      <RouterLink to="/reisen" class="shortcut">
        <span class="shortcut__label">Reisekarte</span>
        <span class="shortcut__hint">Wo sie schon überall war</span>
      </RouterLink>
      <RouterLink to="/verlauf" class="shortcut">
        <span class="shortcut__label">Verlauf</span>
        <span class="shortcut__hint">Alles ansehen, ändern und nachtragen</span>
      </RouterLink>
    </nav>

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
      <h2 class="card__title">Wetter</h2>
      <p class="card__lead">
        Mit einem Ort holt der Pi einmal täglich die Tagestemperatur und legt sie neben
        die Trinkmenge. Bei Hitze trinkt sie oft mehr — dann sieht man auch, warum.
        Es gehen nur Koordinaten hinaus, keine Daten über das Kind.
      </p>
      <p v-if="data.child?.placeName" class="card__lead">
        Aktuell: <strong>{{ data.child.placeName }}</strong>
      </p>
      <div class="place">
        <input
          v-model="placeQuery"
          type="text"
          placeholder="Ort oder Postleitzahl"
          @keyup.enter="searchPlace"
        />
        <button class="secondary" type="button" :disabled="searching" @click="searchPlace">
          {{ searching ? "Sucht …" : "Suchen" }}
        </button>
      </div>
      <ul v-if="placeResults.length" class="place__results">
        <li v-for="place in placeResults" :key="`${place.latitude},${place.longitude}`">
          <button type="button" @click="choosePlace(place)">
            {{ place.name }}<span v-if="place.admin">, {{ place.admin }}</span>
          </button>
        </li>
      </ul>
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

.shortcuts {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.shortcut {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.85rem 1.1rem;
  border-radius: 1.25rem;
  background: var(--bm-surface);
  box-shadow: var(--bm-shadow-card);
  color: inherit;
  text-decoration: none;
}

.shortcut__label {
  font-weight: 600;
}

.shortcut__hint {
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.warning {
  padding: 0.9rem 1rem;
  border: 1px solid color-mix(in srgb, var(--bm-photo) 45%, transparent);
  border-radius: 1.125rem;
  background: var(--bm-photo-soft);
}

.warning__title {
  margin: 0;
  font-weight: 600;
}

.warning__text {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
  line-height: 1.45;
  color: var(--bm-ink-soft);
}

.warning__reason {
  margin: 0.4rem 0 0;
  font-size: 0.75rem;
  color: var(--bm-ink-soft);
  word-break: break-word;
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

.place {
  display: flex;
  gap: 0.5rem;
}

.place input {
  flex: 1;
  min-width: 0;
  min-height: 2.875rem;
  padding: 0 0.75rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface);
  color: var(--bm-ink);
  font: inherit;
  font-size: 1rem;
}

.place .secondary {
  flex: none;
  padding-inline: 1rem;
}

.place__results {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  overflow: hidden;
}

.place__results li + li {
  border-top: 1px solid var(--bm-hairline);
}

.place__results button {
  width: 100%;
  padding: 0.7rem 0.9rem;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
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
