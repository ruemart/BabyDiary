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

watch(open, (isOpen) => {
  const element = dialog.value;
  if (!element) return;
  if (isOpen && !element.open) element.showModal();
  if (!isOpen && element.open) element.close();
});

function onClose() {
  open.value = false;
}
</script>

<template>
  <dialog ref="dialog" class="sheet" @close="onClose" @cancel="onClose">
    <div class="sheet__grip" aria-hidden="true" />
    <header class="sheet__head">
      <h2>{{ title }}</h2>
      <button class="sheet__close" type="button" aria-label="Schließen" @click="onClose">
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
.sheet {
  /* Am unteren Rand verankert, volle Breite, nach oben abgerundet. */
  margin: 0 0 0 auto;
  margin-block-start: auto;
  inset-inline: 0;
  width: 100%;
  max-width: 40rem;
  max-height: 90dvh;
  padding: 0.75rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom));
  border: none;
  border-radius: 1.75rem 1.75rem 0 0;
  background: var(--bm-surface);
  color: var(--bm-ink);
  box-shadow: var(--bm-shadow-lift);
  overflow-y: auto;
}

.sheet::backdrop {
  background: rgb(20 14 12 / 45%);
  backdrop-filter: blur(2px);
}

.sheet[open] {
  animation: sheet-in 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes sheet-in {
  from {
    transform: translateY(12%);
    opacity: 0;
  }
}

.sheet__grip {
  width: 2.25rem;
  height: 0.25rem;
  margin: 0 auto 0.75rem;
  border-radius: 62.5rem;
  background: var(--bm-hairline);
}

.sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;
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

.sheet__actions:not(:empty) {
  margin-top: 1.5rem;
}
</style>
