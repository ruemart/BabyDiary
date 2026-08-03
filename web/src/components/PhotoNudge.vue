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
    <p class="nudge__text">Foto für Woche {{ data.currentWeek }} fehlt noch</p>
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
/* Bewusst die leiseste Zeile auf dem Bildschirm.
   Der laute Platz gehört dem Flasche-Knopf; eine Erinnerung, die lauter ist als die
   Hauptaktion, macht aus einem schönen Vorhaben ein Pflichtprogramm. */
.nudge {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  border-radius: 1rem;
  background: transparent;
}

.nudge__ring {
  width: 2rem;
  height: 2rem;
  flex: none;
  display: grid;
  place-items: center;
  border: 1.5px dashed color-mix(in srgb, var(--bm-photo) 45%, transparent);
  border-radius: 50%;
  color: color-mix(in srgb, var(--bm-photo) 85%, transparent);
  font-family: var(--bm-font-display);
  font-size: 0.8125rem;
  font-weight: 600;
}

.nudge__text {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: var(--bm-ink-soft);
  font-size: 0.9rem;
}

.nudge__action {
  flex: none;
  min-height: 2.25rem;
  padding: 0 0.85rem;
  border: 1px solid color-mix(in srgb, var(--bm-photo) 40%, transparent);
  border-radius: 62.5rem;
  background: transparent;
  color: var(--bm-photo);
  font: inherit;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
}

.nudge__action:disabled {
  opacity: 0.6;
}

.nudge__input {
  display: none;
}
</style>
