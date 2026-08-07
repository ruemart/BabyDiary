<script setup lang="ts">
import { ref, watch } from "vue";

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

watch(open, (isOpen) => {
  const element = dialog.value;
  if (!element) return;

  if (isOpen && !element.open) {
    /**
     * Three statements, in this order, and the order is the whole of it.
     *
     * The starting state goes on BEFORE the dialog becomes visible, so the first frame
     * ever painted is the one the slide starts from. Reading `offsetHeight` then forces
     * the browser to actually work out that state instead of collapsing the whole task
     * into its end result. Only afterwards does the class come off, and the transition
     * carries the sheet home from where it now stands.
     *
     * ON THE IPHONE THERE IS NO SLIDE. The sheet appears. Three mechanisms were tried
     * against a real device — a keyframe animation switched on two frames later, a
     * transition out of `@starting-style`, and this one — and only the first produced
     * motion there, in the form of a hop: it painted the sheet in its final place and
     * then yanked it down to the start, because switching on afterwards is what that
     * approach does. Chromium slides with what is here now, measured frame by frame;
     * iOS does not. Please do not spend a fourth round on it. The decision was to leave
     * it: appearing without motion is a decoration missing, and every attempt to force
     * the motion has so far cost the sheet's usability instead.
     *
     * Which is the reason for the shape of this code rather than an aside. It cannot
     * leave the sheet stranded: by the end of this task the class is off again, so the
     * resting state is in force whatever the transition does — and doing nothing at all
     * is precisely the iPhone's case. That is why the sheet is usable there.
     */
    element.classList.add("sheet--entering");
    element.showModal();
    void element.offsetHeight;
    element.classList.remove("sheet--entering");
  }
  if (!isOpen && element.open) element.close();
});

function onClose() {
  open.value = false;
}
</script>

<template>
  <dialog ref="dialog" class="sheet" @close="onClose" @cancel="onClose">
    <div class="sheet__panel">
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
    </div>
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
 * The dialog is the OVERLAY, the panel inside it is the sheet. Two elements instead of
 * one, because a single one has to be two things at once, and on the iPhone it was not.
 *
 * Before, the <dialog> was the sheet itself and left its geometry to the browser default
 * for dialogs: `height: fit-content`, anchored to the bottom edge by `margin-top: auto`.
 * Measuring the sheet's height then means measuring a column of flex children — and on
 * iOS that measurement came out far too small: only the grip, the title and the save
 * button were left, the form between them was pressed to a couple of pixels. Screenshot
 * from a real iPhone on iOS 26; in WebKit on the desktop and in Chromium it always looked
 * right, which is why three attempts before this one fixed the wrong thing.
 *
 * Now nothing has to be measured. The dialog covers the viewport at a size given in full,
 * and the panel is placed against its lower edge by the flex layout. The sheet's height
 * follows its content and is capped at 90% of a box whose height is already known.
 */
dialog.sheet[open] {
  position: fixed;
  inset: 0;
  /* Only matters if the dialog ever loses the top layer; the bar is at 20. */
  z-index: 30;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  max-width: none;
  height: 100%;
  max-height: none;
  margin: 0;
  padding: 0;
  border: none;
  /* The dimming stays on ::backdrop — the overlay itself only positions. */
  background: transparent;
  overflow: hidden;
}

.sheet::backdrop {
  background: rgb(20 14 12 / 45%);
  backdrop-filter: blur(2px);
}

/**
 * The sheet: fixed header, scrolling content, fixed footer.
 *
 * The whole sheet used to scroll as one piece — on a longer form that put the save
 * button below the screen, and you had to go looking to finish. Now only the content
 * scrolls and the button stays put.
 */
.sheet__panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 40rem;
  /* Of the overlay, whose height is stated above — no viewport unit in the load path. */
  max-height: 90%;
  padding-top: 0.75rem;
  border-radius: 1.75rem 1.75rem 0 0;
  background: var(--bm-surface);
  color: var(--bm-ink);
  box-shadow: var(--bm-shadow-lift);
  /* The content scrolls, not the sheet. */
  overflow: hidden;
}

/**
 * The sliding in — a transition, not a keyframe animation, and that difference is what
 * makes it safe.
 *
 * A transition always ends at the value declared here, so the sheet's resting place is
 * the correct one whether the transition runs, is interrupted, or never starts. A
 * keyframe animation holds its FIRST frame when it fails to advance, and that is how a
 * sheet ends up sitting below the screen edge — which is what happened on the iPhone,
 * twice. The failure mode is gone now rather than caught by a timer afterwards.
 *
 * The starting state is a class, applied and removed inside a single task; see the
 * component above for why it has to happen in that order.
 */
.sheet__panel {
  transition:
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 160ms ease-out;
}

.sheet--entering .sheet__panel {
  transform: translateY(12%);
  opacity: 0;
}

/**
 * No transition means the class goes on and off within one task without a frame in
 * between, so nothing of the starting state is ever shown — the sheet simply appears.
 */
@media (prefers-reduced-motion: reduce) {
  .sheet__panel {
    transition: none;
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

/**
 * `flex: 1 1 auto`, not `flex: 1` — and that single word is the actual bug.
 *
 * `flex: 1` is short for `1 1 0%`: the browser is told the content's own height is worth
 * nothing when the column is measured. For a box of a known height that is exactly right,
 * because the leftover space is then handed to this child. For a box that is measured
 * FROM its content — and the sheet is one — it is a circular statement, and the engines
 * do not resolve it alike. WebKit on iOS resolved it to nearly zero: the form disappeared
 * between the title and the save button.
 *
 * With `auto` the content counts towards the height, the sheet grows with the form, and
 * the cap above cuts it off. `min-height: 0` is what allows the cut — without it a flex
 * child refuses to go below its content — and from there on it scrolls.
 */
.sheet__body {
  flex: 1 1 auto;
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
