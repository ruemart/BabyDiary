<script setup lang="ts">
import { RouterLink } from "vue-router";

/**
 * Navigation unten, nicht oben: Auf dem Handy liegt das obere Bildschirmdrittel
 * außerhalb der Reichweite des Daumens, und diese App wird einhändig bedient,
 * während der andere Arm das Kind hält.
 */
const items = [
  { to: "/", label: "Heute", icon: "M4 12h16M4 6h16M4 18h10" },
  { to: "/wochen", label: "Wochen", icon: "M3 12h4l3-7 4 14 3-7h4" },
  { to: "/meilensteine", label: "Schritte", icon: "M5 12h4l2-5 2 10 2-5h4" },
  { to: "/kurven", label: "Kurven", icon: "M4 19V5m0 14h16M8 15l3-4 3 3 4-6" },
  { to: "/einstellungen", label: "Mehr", icon: "M12 6h.01M12 12h.01M12 18h.01" },
] as const;
</script>

<template>
  <nav class="nav" aria-label="Hauptnavigation">
    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="nav__item"
      active-class="nav__item--active"
    >
      <svg
        class="nav__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path :d="item.icon" />
      </svg>
      <span class="nav__label">{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.nav {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.25rem;
  padding: 0.5rem 0.5rem calc(0.5rem + env(safe-area-inset-bottom));
  background: color-mix(in srgb, var(--bm-surface) 88%, transparent);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--bm-hairline);
}

.nav__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  padding: 0.4rem 0.25rem;
  border-radius: 0.875rem;
  color: var(--bm-ink-soft);
  text-decoration: none;
  font-size: 0.6875rem;
  font-weight: 500;
  /* 44 px Mindesthöhe — darunter trifft der Daumen unzuverlässig. */
  min-height: 2.75rem;
  transition: color 160ms ease, background-color 160ms ease;
}

.nav__item--active {
  color: var(--bm-ink);
  background: var(--bm-feed-soft);
}

.nav__icon {
  width: 1.35rem;
  height: 1.35rem;
}

.nav__label {
  letter-spacing: 0.01em;
}
</style>
