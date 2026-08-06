<script setup lang="ts">
import { RouterLink } from "vue-router";

/**
 * Navigation at the bottom, not the top: on a phone the upper third of the screen is
 * out of the thumb's reach, and this app is operated one-handed while the other arm
 * holds the child.
 */
/**
 * Every icon must have a SHAPE of its own, not just a label of its own.
 *
 * "Weeks" and "Steps" were both a zigzag line differing only in the height of the
 * peaks — at 1.5 rem and in passing that is the same picture. Now they carry different
 * outlines: calendar against staircase, round against angular, horizontal against
 * ascending. That is also the difference that still carries in poor light and without
 * glasses.
 *
 * A `d` may contain several subpaths — so a single <path> still does.
 */
const items = [
    // Sonne: der heutige Tag. Vorher waren es drei Linien — dieselbe Form wie die
  // Verlaufsliste, und damit genau der Fehler, der bei Wochen und Schritten schon
  // einmal passiert ist.
  { to: "/", key: "nav.today", icon: "M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" },
  // Calendar page: the week as a period.
  { to: "/wochen", key: "nav.weeks", icon: "M4 7h16v13H4zM4 11h16M9 4v4M15 4v4" },
  /*
   * Liste mit Zeilen: der Verlauf.
   *
   * Steht hier statt der Meilensteine, und zwar nach Häufigkeit: Den Verlauf öffnet man
   * täglich — zum Nachsehen und zum Nachtragen —, einen Meilenstein hakt man alle paar
   * Wochen ab. Eine Leiste mit fünf Zielen muss die fünf häufigsten zeigen, sonst ist
   * sie Dekoration. Die Meilensteine sind weiterhin zwei Wege entfernt: über "Mehr"
   * und über die Detailkarte im Wochenband.
   *
   * Sechs Ziele wären die naheliegende Antwort gewesen, aber auf einem schmalen Gerät
   * bleiben dann 62 px je Ziel — unter der Grenze, ab der der Daumen zuverlässig trifft.
   */
  { to: "/verlauf", key: "nav.history", icon: "M4 7h16M4 12h16M4 17h10" },
  { to: "/kurven", key: "nav.charts", icon: "M4 19V5m0 14h16M8 15l3-4 3 3 4-6" },
  { to: "/einstellungen", key: "nav.more", icon: "M12 6h.01M12 12h.01M12 18h.01" },
] as const;
</script>

<template>
  <nav class="nav" :aria-label="$t('nav.main')">
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
      <span class="nav__label">{{ $t(item.key) }}</span>
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
  /* 44 px minimum height — below that the thumb hits unreliably. */
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
