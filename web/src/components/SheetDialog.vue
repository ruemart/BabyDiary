<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";

/**
 * An input sheet that slides in from the bottom.
 *
 * Deliberately a native <dialog> rather than a home-made overlay: that brings the focus
 * trap, the escape key, inerting the background and the correct screen-reader order
 * without any code of our own — four things hand-built modals almost always get wrong.
 *
 * From the bottom, because the top edge of the screen cannot be reached one-handed.
 */
const open = defineModel<boolean>("open", { required: true });
defineProps<{ title: string }>();

const dialog = ref<HTMLDialogElement>();

/**
 * The entry animation is switched on a couple of frames later and taken off again
 * afterwards — by `animationend` if it runs, by the clock if it does not.
 *
 * On the iPhone the animation stayed on its FIRST frame: `translateY(12%)` kept applying.
 * On a 598 px tall sheet that is 72 px — the bottom edge sat below the screen, only the
 * title was visible, and the save button was out of reach. A stuck `transform` also makes
 * the sheet the containing block for anything fixed inside it, which is how it was proven.
 *
 * The first attempt at a fix hung the animation off a class of its own and took it off in
 * `animationend`. That was right in intent and wrong in mechanism: when the animation
 * never progresses past frame one, `animationend` never fires either, so the class — and
 * the transform — stayed forever. Measured in WebKit, it broke in two runs out of three.
 *
 * What actually cures it is waiting TWO frames instead of one before starting: measured
 * in WebKit, three runs out of three then come out clean even with the backstop below
 * turned off, so the animation really does run to its end rather than being tidied up
 * afterwards.
 *
 * The timer stays anyway. It costs nothing, and the failure it covers is the difference
 * between a sheet that appears without sliding — which nobody notices at three in the
 * morning — and one that cannot be used at all.
 */
const SETTLE_AFTER_MS = 400; // the animation lasts 220

let settleTimer: ReturnType<typeof setTimeout> | undefined;

function stopEntering() {
  clearTimeout(settleTimer);
  settleTimer = undefined;
  dialog.value?.classList.remove("sheet--entering");
}

watch(open, (isOpen) => {
  const element = dialog.value;
  if (!element) return;

  if (isOpen && !element.open) {
    element.showModal();
    // Two frames, not one: `showModal` moves the element into the top layer, and starting
    // an animation in the same frame as that promotion is what WebKit chokes on.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        element.classList.add("sheet--entering");
        settleTimer = setTimeout(stopEntering, SETTLE_AFTER_MS);
      }),
    );
  }
  if (!isOpen && element.open) {
    stopEntering();
    element.close();
  }
});

onUnmounted(stopEntering);

/** `animationend` bubbles — a field animating inside the sheet must not end this one. */
function onAnimationEnd(event: AnimationEvent) {
  if (event.target === dialog.value) stopEntering();
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
 * Closed means invisible — stated explicitly, not just by browser default.
 *
 * Vue passes the parent component's scope id onto the root element of a child component.
 * A rule like `.sheet { display: flex }` in the parent therefore also hits this <dialog>
 * and cancels the browser default's `display: none` — the sheet then sits permanently
 * over the page and swallows every click.
 *
 * This rule has higher specificity than a plain class rule and so wins against such an
 * accident.
 */
dialog.sheet:not([open]) {
  display: none;
}

/**
 * Open: a column of fixed header, scrolling content and fixed footer.
 *
 * The whole sheet used to scroll as one piece — on a longer form that put the save
 * button below the screen, and you had to go looking to finish. Now only the content
 * scrolls and the button stays put.
 */
dialog.sheet[open] {
  display: flex;
  flex-direction: column;
}

.sheet {
  /* Anchored at the bottom edge, full width, rounded at the top. */
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
  /* The content scrolls, not the sheet. */
  overflow: hidden;
}

.sheet::backdrop {
  background: rgb(20 14 12 / 45%);
  backdrop-filter: blur(2px);
}

/* Only while the class is applied — the sheet's resting position is always correct. */
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
  /* A little air so the last field does not stick to the footer. */
  padding-bottom: 1rem;
}

/**
 * The footer stays put. The dividing line and the slightly offset surface make it
 * visible that something continues above — otherwise a cut-off form looks complete.
 */
.sheet__actions:not(:empty) {
  flex: none;
  padding: 0.875rem 1.25rem calc(0.875rem + env(safe-area-inset-bottom));
  border-top: 1px solid var(--bm-hairline);
  background: var(--bm-surface);
}
</style>
