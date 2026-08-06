<script setup lang="ts">
import { RouterLink } from "vue-router";

/**
 * The remaining screens.
 *
 * The five slots in the bottom bar go to what is opened daily. Everything else is looked
 * up now and then — the supply list at the shop, the totals when someone asks how much
 * she drinks, the map after a trip — and lives here.
 *
 * Settings used to live on this same page, above and below these links. That put two
 * different kinds of thing in one list: places to go, and switches to flip. It read as a
 * drawer of leftovers, and the settings were the harder to find of the two because they
 * started halfway down. They now have their own screen, reached from the bottom of this
 * one, where a rarely-needed destination belongs.
 */
const DESTINATIONS = [
  { to: "/meilensteine", key: "milestones" },
  { to: "/zahlen", key: "totals" },
  { to: "/vorrat", key: "supply" },
  { to: "/reisen", key: "travel" },
] as const;
</script>

<template>
  <div class="more">
    <h1 class="more__title">{{ $t("nav.more") }}</h1>

    <nav class="shortcuts">
      <RouterLink v-for="d in DESTINATIONS" :key="d.to" :to="d.to" class="shortcut">
        <span class="shortcut__text">
          <span class="shortcut__label">{{ $t(`more.${d.key}`) }}</span>
          <span class="shortcut__hint">{{ $t(`more.${d.key}Hint`) }}</span>
        </span>
        <svg class="shortcut__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="m9 18 6-6-6-6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </RouterLink>
    </nav>

    <!-- Set apart, not just listed last: this is the one entry that leads to switches
         rather than to a screen you read. -->
    <RouterLink to="/einstellungen" class="shortcut shortcut--settings">
      <svg class="shortcut__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
        <circle cx="12" cy="12" r="3.2" />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 8.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="shortcut__text">
        <span class="shortcut__label">{{ $t("settings.title") }}</span>
        <span class="shortcut__hint">{{ $t("more.settingsHint") }}</span>
      </span>
      <svg class="shortcut__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="m9 18 6-6-6-6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </RouterLink>
  </div>
</template>

<style scoped>
.more {
  padding: 1.5rem 1rem 5.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.more__title {
  margin: 0;
  font-size: 1.75rem;
}

.shortcuts {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.shortcut {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  min-height: 3.5rem;
  padding: 0.85rem 1.1rem;
  border-radius: 1.25rem;
  background: var(--bm-surface);
  box-shadow: var(--bm-shadow-card);
  color: inherit;
  text-decoration: none;
}

.shortcut--settings {
  /* A gap plus a quieter surface — enough to read as "and then there is this", without
     a heading that would announce a section of one. */
  margin-top: 0.6rem;
  /* Top-aligned, because the hint wraps: centred, the gear ends up beside the second
     line and starts to look like it belongs to the hint rather than to the heading. */
  align-items: flex-start;
  background: var(--bm-surface-sunk);
  box-shadow: none;
  border: 1px solid var(--bm-hairline);
}

.shortcut__text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  flex: 1;
  min-width: 0;
}

.shortcut__label {
  font-weight: 600;
}

.shortcut__hint {
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.shortcut__icon {
  width: 1.35rem;
  height: 1.35rem;
  flex: none;
  margin-top: 0.1rem;
  color: var(--bm-ink-soft);
}

.shortcut__chevron {
  width: 1.1rem;
  height: 1.1rem;
  flex: none;
  align-self: center;
  color: var(--bm-ink-soft);
}
</style>
