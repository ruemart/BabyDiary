<script setup lang="ts">
import { ref, watch } from "vue";

/**
 * Eingabeblatt, das von unten hereinfährt.
 *
 * Bewusst ein natives <dialog> statt eines eigenen Overlays: Damit kommen
 * Fokusfalle, Escape-Taste, Inertisierung des Hintergrunds und die korrekte
 * Vorlese-Reihenfolge ohne eigenen Code — vier Dinge, die selbstgebaute Modale
 * fast immer falsch machen.
 *
 * Von unten, weil der obere Bildschirmrand einhändig nicht erreichbar ist.
 */
const open = defineModel<boolean>("open", { required: true });
defineProps<{ title: string }>();

const dialog = ref<HTMLDialogElement>();

/**
 * Die Einblendung wird erst im nächsten Bild zugeschaltet und danach wieder entfernt.
 *
 * Auf dem iPhone blieb die Animation auf ihrem ERSTEN Bild stehen — `translateY(12%)`
 * wirkte dauerhaft weiter. Bei einem 598 px hohen Blatt sind das 72 px: Die Unterkante
 * lag unter dem Bildschirmrand, sichtbar war nur der Titel, und der Speichern-Knopf war
 * unerreichbar. Ein stehengebliebenes `transform` macht das Blatt außerdem zum
 * Bezugsrahmen für alles Fixierte darin — daran ließ es sich nachweisen.
 *
 * Zwei Vorkehrungen: Die Animation startet erst, wenn das Blatt bereits sichtbar ist,
 * und sie hängt an einer eigenen Klasse, die am Ende wieder verschwindet. Damit kann ein
 * Fehlschlag nur noch bedeuten, dass es NICHT hereinfährt — nie mehr, dass es falsch
 * liegt.
 */
watch(open, (isOpen) => {
  const element = dialog.value;
  if (!element) return;

  if (isOpen && !element.open) {
    element.showModal();
    requestAnimationFrame(() => element.classList.add("sheet--entering"));
  }
  if (!isOpen && element.open) {
    element.classList.remove("sheet--entering");
    element.close();
  }
});

function onAnimationEnd() {
  dialog.value?.classList.remove("sheet--entering");
}

function onClose() {
  open.value = false;
}
</script>

<template>
  <dialog ref="dialog" class="sheet" @close="onClose" @cancel="onClose" @animationend="onAnimationEnd">
    <div class="sheet__grip" aria-hidden="true" />
    <header class="sheet__head">
      <h2>{{ title }}</h2>
      <button class="sheet__close" type="button" :aria-label="$t('common.close')" @click="onClose">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
        </svg>
      </button>
    </header>

    <div class="sheet__body">
      <slot />
    </div>

    <footer class="sheet__actions">
      <slot name="actions" />
    </footer>
  </dialog>
</template>

<style scoped>
/**
 * Geschlossen heißt unsichtbar — ausdrücklich, nicht nur laut Browser-Vorgabe.
 *
 * Vue vererbt die Scope-Kennung der Elternkomponente auf das Wurzelelement einer
 * Kindkomponente. Eine Regel wie `.sheet { display: flex }` im Elternteil trifft
 * damit auch diesen <dialog> und hebt das `display: none` der Browser-Vorgabe auf —
 * das Blatt liegt dann dauerhaft über der Seite und schluckt jeden Klick.
 *
 * Diese Regel hat höhere Spezifität als eine reine Klassenregel und gewinnt daher
 * gegen einen solchen Unfall.
 */
dialog.sheet:not([open]) {
  display: none;
}

/**
 * Offen: eine Spalte aus festem Kopf, scrollendem Inhalt und festem Fuß.
 *
 * Vorher scrollte das ganze Blatt am Stück — bei einem längeren Formular lag der
 * Speichern-Knopf damit unterhalb des Bildschirms, und man musste erst suchen, um
 * abzuschließen. Jetzt scrollt nur der Inhalt, der Knopf bleibt stehen.
 */
dialog.sheet[open] {
  display: flex;
  flex-direction: column;
}

.sheet {
  /* Am unteren Rand verankert, volle Breite, nach oben abgerundet. */
  margin: 0 0 0 auto;
  margin-block-start: auto;
  inset-inline: 0;
  width: 100%;
  max-width: 40rem;
  max-height: 90dvh;
  padding: 0.75rem 0 0;
  border: none;
  border-radius: 1.75rem 1.75rem 0 0;
  background: var(--bm-surface);
  color: var(--bm-ink);
  box-shadow: var(--bm-shadow-lift);
  /* Der Inhalt scrollt, nicht das Blatt. */
  overflow: hidden;
}

.sheet::backdrop {
  background: rgb(20 14 12 / 45%);
  backdrop-filter: blur(2px);
}

/* Nur solange die Klasse anliegt — die Ruhelage des Blattes ist immer die richtige. */
.sheet--entering {
  animation: sheet-in 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

@media (prefers-reduced-motion: reduce) {
  .sheet--entering {
    animation: none;
  }
}

@keyframes sheet-in {
  from {
    transform: translateY(12%);
    opacity: 0;
  }
}

.sheet__grip {
  flex: none;
  width: 2.25rem;
  height: 0.25rem;
  margin: 0 auto 0.75rem;
  border-radius: 62.5rem;
  background: var(--bm-hairline);
}

.sheet__head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.25rem 1rem;
}

.sheet__head h2 {
  font-size: 1.35rem;
}

.sheet__close {
  width: 2.5rem;
  height: 2.5rem;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 50%;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink-soft);
  cursor: pointer;
}

.sheet__close svg {
  width: 1.1rem;
  height: 1.1rem;
}

.sheet__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 1.25rem;
  /* Etwas Luft, damit das letzte Feld nicht am Fuß klebt. */
  padding-bottom: 1rem;
}

/**
 * Der Fuß bleibt stehen. Die Trennlinie und die leicht abgesetzte Fläche machen
 * sichtbar, dass darüber noch etwas weitergeht — sonst wirkt ein abgeschnittenes
 * Formular wie ein vollständiges.
 */
.sheet__actions:not(:empty) {
  flex: none;
  padding: 0.875rem 1.25rem calc(0.875rem + env(safe-area-inset-bottom));
  border-top: 1px solid var(--bm-hairline);
  background: var(--bm-surface);
}
</style>
