<script setup lang="ts">
import { computed, ref } from "vue";
import { useData } from "../stores/data.ts";
import { useStats } from "../composables/useStats.ts";
import DailyVolumeChart from "../components/charts/DailyVolumeChart.vue";
import RhythmChart from "../components/charts/RhythmChart.vue";
import DiaperHeatmap from "../components/charts/DiaperHeatmap.vue";
import GrowthChart from "../components/charts/GrowthChart.vue";
import { ageInDays } from "@babymonitor/shared";
import { zScore, zToPercentile, type GrowthMeasure } from "../data/who/index.ts";

const DAYS = 30;

const data = useData();
const { dailyTotals, rhythm, diaperGrid, summary } = useStats(
  () => data.entries,
  () => data.timezone,
  DAYS,
);

const hasFeeds = computed(() => rhythm.value.length > 0);

/* ── Wachstum ─────────────────────────────────────────────────────────────── */

const growthMeasure = ref<GrowthMeasure>("weight");

/** Messwerte in die Einheiten der WHO-Tabellen umrechnen: Gramm → kg, mm → cm. */
const growthPoints = computed(() => {
  const child = data.child;
  if (!child) return [];
  return data.entries
    .filter((e) => e.type === "growth")
    .map((e) => {
      const raw = growthMeasure.value === "weight" ? e.weightG : e.lengthMm;
      if (raw === null) return null;
      return {
        ageDays: ageInDays(child.birthDate, e.startedAt, data.timezone),
        value: growthMeasure.value === "weight" ? raw / 1000 : raw / 10,
      };
    })
    .filter((p): p is { ageDays: number; value: number } => p !== null)
    .sort((a, b) => a.ageDays - b.ageDays);
});

/** Der aktuelle Perzentilrang — die Zahl, nach der beim Kinderarzt gefragt wird. */
const currentPercentile = computed(() => {
  const child = data.child;
  const last = growthPoints.value[growthPoints.value.length - 1];
  if (!child || !last) return null;
  const z = zScore(growthMeasure.value, child.sex, last.ageDays, last.value);
  return z === null ? null : Math.round(zToPercentile(z));
});

const maxAgeDays = computed(() =>
  growthPoints.value.length ? growthPoints.value[growthPoints.value.length - 1]!.ageDays : 60,
);

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

    <section v-if="data.child" class="card">
      <div class="growth__head">
        <h2 class="card__title">Wachstum</h2>
        <div class="toggle" role="group" aria-label="Messgröße">
          <button
            type="button"
            :class="{ 'toggle__item--active': growthMeasure === 'weight' }"
            class="toggle__item"
            @click="growthMeasure = 'weight'"
          >
            Gewicht
          </button>
          <button
            type="button"
            :class="{ 'toggle__item--active': growthMeasure === 'length' }"
            class="toggle__item"
            @click="growthMeasure = 'length'"
          >
            Länge
          </button>
        </div>
      </div>

      <p v-if="growthPoints.length === 0" class="card__lead">
        Noch keine Messwerte. Über „Verlauf → Nachtragen“ lassen sich Gewicht und Länge
        eintragen — etwa die Werte von der letzten U-Untersuchung.
      </p>

      <template v-else>
        <p v-if="currentPercentile !== null" class="growth__percentile">
          Aktuell auf <strong>Perzentil {{ currentPercentile }}</strong> —
          {{ currentPercentile }} von 100 gleichaltrigen Kindern sind leichter oder
          gleich schwer.
        </p>
        <GrowthChart
          :measure="growthMeasure"
          :sex="data.child.sex"
          :points="growthPoints"
          :max-age-days="maxAgeDays"
        />
        <p class="card__note">
          Entscheidend ist nicht der einzelne Wert, sondern ob die Kurve ihrem Band folgt.
          Ein Kind auf Perzentil 20 ist gesund, solange es auf Perzentil 20 bleibt.
        </p>
      </template>
    </section>
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

.card__note {
  margin: 0.75rem 0 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--bm-ink-soft);
}

.growth__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.growth__percentile {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
  line-height: 1.45;
}

.toggle {
  display: flex;
  gap: 0.25rem;
  padding: 0.2rem;
  border-radius: 62.5rem;
  background: var(--bm-surface-sunk);
}

.toggle__item {
  min-height: 2rem;
  padding: 0 0.75rem;
  border: none;
  border-radius: 62.5rem;
  background: transparent;
  color: var(--bm-ink-soft);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.toggle__item--active {
  background: var(--bm-surface);
  color: var(--bm-ink);
  box-shadow: var(--bm-shadow-card);
}
</style>
