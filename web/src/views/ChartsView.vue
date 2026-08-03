<script setup lang="ts">
import { computed } from "vue";
import { useData } from "../stores/data.ts";
import { useStats } from "../composables/useStats.ts";
import DailyVolumeChart from "../components/charts/DailyVolumeChart.vue";
import RhythmChart from "../components/charts/RhythmChart.vue";
import DiaperHeatmap from "../components/charts/DiaperHeatmap.vue";

const DAYS = 30;

const data = useData();
const { dailyTotals, rhythm, diaperGrid, summary } = useStats(
  () => data.entries,
  () => data.timezone,
  DAYS,
);

const hasFeeds = computed(() => rhythm.value.length > 0);

const trendText = computed(() => {
  const trend = summary.value.trendPercent;
  if (trend === null) return null;
  if (Math.abs(trend) < 3) return "etwa gleich wie letzte Woche";
  return trend > 0 ? `${trend} % mehr als letzte Woche` : `${Math.abs(trend)} % weniger als letzte Woche`;
});
</script>

<template>
  <div class="charts">
    <header class="charts__head">
      <h1>Kurven</h1>
      <p class="charts__sub">Die letzten {{ DAYS }} Tage</p>
    </header>

    <p v-if="!hasFeeds" class="empty">
      Sobald ein paar Mahlzeiten eingetragen sind, entstehen hier die Auswertungen.
    </p>

    <template v-else>
      <!-- Kennzahlen als Kacheln: Für eine einzelne Zahl ist ein Diagramm der Umweg. -->
      <section class="tiles" aria-label="Kennzahlen">
        <div class="tile">
          <p class="tile__label">Ø pro Tag</p>
          <p class="tile__value bm-tabular">
            {{ summary.avgMl ?? "–" }}<span class="tile__unit">ml</span>
          </p>
          <p v-if="trendText" class="tile__meta">{{ trendText }}</p>
        </div>

        <div class="tile">
          <p class="tile__label">Ø Mahlzeiten</p>
          <p class="tile__value bm-tabular">
            {{ summary.avgFeeds ?? "–" }}<span class="tile__unit">pro Tag</span>
          </p>
        </div>

        <div class="tile">
          <p class="tile__label">Je Kilogramm</p>
          <p class="tile__value bm-tabular">
            {{ summary.mlPerKg ?? "–" }}<span class="tile__unit">ml/kg</span>
          </p>
          <p class="tile__meta">
            {{
              summary.mlPerKg === null
                ? "Braucht einen Gewichtseintrag"
                : "Zeigt, ob die Menge mitwächst"
            }}
          </p>
        </div>
      </section>

      <section class="card">
        <h2 class="card__title">Trinkmenge pro Tag</h2>
        <DailyVolumeChart :series="dailyTotals" />
      </section>

      <section class="card">
        <h2 class="card__title">Wann getrunken wird</h2>
        <p class="card__lead">
          Ein Punkt je Mahlzeit, die Größe steht für die Menge. Mitternacht liegt oben
          und unten — so wird das nächtliche Band sichtbar, das mit den Monaten dünner wird.
        </p>
        <RhythmChart :points="rhythm" :days="DAYS" />
      </section>

      <section class="card">
        <h2 class="card__title">Windeln nach Stunde</h2>
        <DiaperHeatmap :rows="diaperGrid" />
      </section>
    </template>
  </div>
</template>

<style scoped>
.charts {
  padding: 1.5rem 1rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.charts__head h1 {
  font-size: 1.75rem;
}

.charts__sub {
  margin: 0.25rem 0 0;
  color: var(--bm-ink-soft);
  font-size: 0.95rem;
}

.empty {
  margin: 0;
  padding: 2.5rem 1rem;
  text-align: center;
  color: var(--bm-ink-soft);
  line-height: 1.5;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
  gap: 0.75rem;
}

.tile {
  background: var(--bm-surface);
  border-radius: 1.25rem;
  padding: 0.9rem 1rem;
  box-shadow: var(--bm-shadow-card);
}

.tile__label {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--bm-ink-soft);
}

.tile__value {
  margin: 0.2rem 0 0;
  font-family: var(--bm-font-display);
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.1;
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
}

.tile__unit {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--bm-ink-soft);
}

.tile__meta {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  line-height: 1.35;
  color: var(--bm-ink-soft);
}

.card {
  background: var(--bm-surface);
  border-radius: 1.5rem;
  padding: 1.25rem;
  box-shadow: var(--bm-shadow-card);
}

.card__title {
  font-size: 1.15rem;
  margin-bottom: 0.5rem;
}

.card__lead {
  margin: 0 0 1rem;
  color: var(--bm-ink-soft);
  font-size: 0.875rem;
  line-height: 1.5;
}
</style>
