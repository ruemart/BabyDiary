<script setup lang="ts">
import { ref } from "vue";
import { useData } from "../stores/data.ts";
import { usePhotoUpload } from "../composables/usePhotoUpload.ts";

/**
 * Erinnerung an das Wochenfoto.
 *
 * Bewusst zurückhaltend: kein rotes Abzeichen, keine Push-Nachricht, kein Zähler über
 * verpasste Wochen. Das hier ist ein schönes Vorhaben, kein Pflichtprogramm — und eine
 * App, die Eltern eines Neugeborenen ein schlechtes Gewissen macht, wird zu Recht
 * gelöscht. Sie verschwindet still, sobald das Foto da ist.
 */
const data = useData();
const { savePhoto, busy } = usePhotoUpload();
const input = ref<HTMLInputElement>();

async function onPick(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) await savePhoto(file, data.currentWeek);
  if (input.value) input.value.value = "";
}
</script>

<template>
  <div class="nudge">
    <div class="nudge__ring" aria-hidden="true">
      <span class="bm-tabular">{{ data.currentWeek }}</span>
    </div>
    <div class="nudge__text">
      <p class="nudge__title">Für diese Woche fehlt noch ein Foto</p>
      <p class="nudge__sub">Ein Bild pro Woche ergibt später einen schönen Zeitraffer.</p>
    </div>
    <button class="nudge__action" type="button" :disabled="busy" @click="input?.click()">
      {{ busy ? "Lädt …" : "Aufnehmen" }}
    </button>
    <!-- capture="user" öffnet auf dem Handy direkt die Kamera statt der Galerie. -->
    <input
      ref="input"
      class="nudge__input"
      type="file"
      accept="image/*"
      capture="user"
      @change="onPick"
    />
  </div>
</template>

<style scoped>
.nudge {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.875rem 1rem;
  border: 1px dashed color-mix(in srgb, var(--bm-photo) 45%, transparent);
  border-radius: 1.25rem;
  background: var(--bm-photo-soft);
}

.nudge__ring {
  width: 2.75rem;
  height: 2.75rem;
  flex: none;
  display: grid;
  place-items: center;
  border: 2px dashed color-mix(in srgb, var(--bm-photo) 55%, transparent);
  border-radius: 50%;
  color: var(--bm-photo);
  font-family: var(--bm-font-display);
  font-weight: 600;
}

.nudge__text {
  flex: 1;
  min-width: 0;
}

.nudge__title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.nudge__sub {
  margin: 0.1rem 0 0;
  color: var(--bm-ink-soft);
  font-size: 0.8125rem;
}

.nudge__action {
  flex: none;
  min-height: 2.5rem;
  padding: 0 0.9rem;
  border: none;
  border-radius: 62.5rem;
  background: var(--bm-photo);
  color: #fff;
  font: inherit;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
}

.nudge__action:disabled {
  opacity: 0.6;
}

.nudge__input {
  display: none;
}
</style>
