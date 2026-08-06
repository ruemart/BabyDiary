<script setup lang="ts">
import { computed, ref } from "vue";
import { useData } from "../stores/data.ts";
import { useStats } from "../composables/useStats.ts";
import DailyVolumeChart from "../components/charts/DailyVolumeChart.vue";
import RhythmChart from "../components/charts/RhythmChart.vue";
import DiaperHeatmap from "../components/charts/DiaperHeatmap.vue";
import GrowthChart from "../components/charts/GrowthChart.vue";
import { ageInDays } from "@milo/shared";
import { zScore, zToPercentile, type GrowthMeasure } from "../data/who/index.ts";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

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

/** Convert measurements into the units of the WHO tables: grams → kg, mm → cm. */
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

/** The current percentile rank — the number people are asked about at the doctor's. */
const currentPercentile = computed(() => {
  const child = data.child;
  const last = growthPoints.value[growthPoints.value.length - 1];
  if (!child || !last) return null;
  const z = zScore(growthMeasure.value, child.sex, last.ageDays, last.value);
  return z === null ? null : Math.round(zToPercentile(z));
});

/** The comparison sentence has to match the measure — for length, "heavier" is simply wrong. */
const percentileComparison = computed(() =>
  growthMeasure.value === "weight" ? t("charts.lighter") : t("charts.shorter"),
);

const maxAgeDays = computed(() =>
  growthPoints.value.length ? growthPoints.value[growthPoints.value.length - 1]!.ageDays : 60,
);

const trendText = computed(() => {
  const trend = summary.value.trendPercent;
  if (trend === null) return null;
  if (Math.abs(trend) < 3) return t("charts.sameAsLastWeek");
  return trend > 0
    ? t("charts.moreThanLastWeek", { n: trend })
    : t("charts.lessThanLastWeek", { n: Math.abs(trend) });
});
</script>

<template>
  <div class="charts">
    <header class="charts__head">
      <h1>{{ $t("charts.title") }}</h1>
      <p class="charts__sub">{{ $t("charts.lastDays", { n: DAYS }) }}</p>
    </header>

    <p v-if="!hasFeeds" class="empty">
      {{ $t("charts.empty") }}
    </p>

    <template v-else>
      <!-- Key figures as tiles: for a single number a chart is the long way round. -->
      <section class="tiles" :aria-label="$t('charts.tiles')">
        <div class="tile">
          <p class="tile__label">{{ $t("charts.avgPerDay") }}</p>
          <p class="tile__value bm-tabular">
            {{ summary.avgMl ?? "–" }}<span class="tile__unit">ml</span>
          </p>
          <p v-if="trendText" class="tile__meta">{{ trendText }}</p>
        </div>

        <div class="tile">
          <p class="tile__label">{{ $t("charts.avgFeeds") }}</p>
          <p class="tile__value bm-tabular">
            {{ summary.avgFeeds ?? "–" }}<span class="tile__unit">{{ $t("charts.perDay") }}</span>
          </p>
        </div>

        <div class="tile">
          <p class="tile__label">{{ $t("charts.perKg") }}</p>
          <p class="tile__value bm-tabular">
            {{ summary.mlPerKg ?? "–" }}<span class="tile__unit">ml/kg</span>
          </p>
          <p class="tile__meta">
            {{
              summary.mlPerKg === null
                ? $t("charts.needsWeight")
                : $t("charts.showsGrowth")
            }}
          </p>
        </div>
      </section>

      <section class="card">
        <h2 class="card__title">{{ $t("charts.dailyVolume") }}</h2>
        <DailyVolumeChart :series="dailyTotals" />
      </section>

      <section class="card">
        <h2 class="card__title">{{ $t("charts.whenDrinking") }}</h2>
        <p class="card__lead">
          {{ $t("charts.rhythmLead") }}
        </p>
        <RhythmChart :points="rhythm" :days="DAYS" />
      </section>

      <section class="card">
        <h2 class="card__title">{{ $t("charts.diapersByHour") }}</h2>
        <DiaperHeatmap :rows="diaperGrid" />
      </section>
    </template>

    <section v-if="data.child" class="card">
      <div class="growth__head">
        <h2 class="card__title">{{ $t("charts.growth") }}</h2>
        <div class="toggle" role="group" :aria-label="$t('charts.measureAria')">
          <button
            type="button"
            :class="{ 'toggle__item--active': growthMeasure === 'weight' }"
            class="toggle__item"
            @click="growthMeasure = 'weight'"
          >
            {{ $t("charts.weight") }}
          </button>
          <button
            type="button"
            :class="{ 'toggle__item--active': growthMeasure === 'length' }"
            class="toggle__item"
            @click="growthMeasure = 'length'"
          >
            {{ $t("charts.length") }}
          </button>
        </div>
      </div>

      <p v-if="growthPoints.length === 0" class="card__lead">
        {{ $t("charts.noMeasurements") }}
      </p>

      <template v-else>
        <p v-if="currentPercentile !== null" class="growth__percentile">
          {{ $t("charts.percentile", { n: currentPercentile, comparison: percentileComparison }) }}
        </p>
        <GrowthChart
          :measure="growthMeasure"
          :sex="data.child.sex"
          :points="growthPoints"
          :max-age-days="maxAgeDays"
        />
        <p class="card__note">
          {{ $t("charts.percentileNote") }}
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
