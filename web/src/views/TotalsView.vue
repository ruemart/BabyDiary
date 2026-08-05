<script setup lang="ts">
import { computed } from "vue";
import { useData } from "../stores/data.ts";
import { useTotals } from "../composables/useTotals.ts";
import { useI18n } from "vue-i18n";

const data = useData();
const { totals, records, byPerson } = useTotals(
  () => data.entries,
  () => data.timezone,
  () => data.child?.birthDate ?? null,
);

const hasData = computed(() => totals.value.feeds > 0 || totals.value.diapers > 0);
</script>

<template>
  <div class="totals">
    <header class="head">
      <h1>{{ $t("totals.title") }}</h1>
      <p class="head__sub">
        <template v-if="totals.ageDays !== null">
          {{ totals.ageDays }} Tage mit {{ data.child?.name }} ·
        </template>
        an {{ totals.daysTracked }} Tagen etwas festgehalten
      </p>
    </header>

    <p v-if="!hasData" class="empty">
      {{ $t("totals.empty") }}
    </p>

    <template v-else>
      <section class="grid" :aria-label="$t('totals.overall')">
        <div class="stat stat--wide">
          <p class="stat__value bm-tabular">{{ totals.totalLiters }}<span class="stat__unit">{{ $t("totals.liters") }}</span></p>
          <p class="stat__label">insgesamt getrunken</p>
        </div>
        <div class="stat">
          <p class="stat__value bm-tabular">{{ totals.feeds }}</p>
          <p class="stat__label">{{ $t("totals.bottles") }}</p>
        </div>
        <div class="stat">
          <p class="stat__value bm-tabular">{{ totals.diapers }}</p>
          <p class="stat__label">{{ $t("totals.diapers") }}</p>
        </div>
        <div class="stat">
          <p class="stat__value bm-tabular">{{ totals.sleepHours }}<span class="stat__unit">Std</span></p>
          <p class="stat__label">{{ $t("totals.sleepRecorded") }}</p>
        </div>
        <div class="stat">
          <p class="stat__value bm-tabular">{{ totals.photos }}</p>
          <p class="stat__label">{{ $t("totals.weekPhotos") }}</p>
        </div>
        <div class="stat">
          <p class="stat__value bm-tabular">{{ totals.baths }}</p>
          <p class="stat__label">{{ $t("totals.bathDays") }}</p>
        </div>
      </section>

      <section class="card">
        <h2 class="card__title">{{ $t("totals.avgPerDay") }}</h2>
        <ul class="rows">
          <li><span>{{ $t("totals.intake") }}</span><span class="bm-tabular">{{ totals.avgMlPerDay }} ml</span></li>
          <li><span>{{ $t("totals.feeds") }}</span><span class="bm-tabular">{{ totals.avgFeedsPerDay }}</span></li>
          <li><span>{{ $t("totals.diapers") }}</span><span class="bm-tabular">{{ totals.avgDiapersPerDay }}</span></li>
          <li><span>{{ $t("totals.perFeed") }}</span><span class="bm-tabular">{{ totals.avgMlPerFeed }} ml</span></li>
        </ul>
      </section>

      <section v-if="records.length" class="card">
        <h2 class="card__title">{{ $t("totals.records") }}</h2>
        <ul class="rows rows--records">
          <li v-for="record in records" :key="record.labelKey">
            <span>
              {{ $t(record.labelKey) }}
              <span v-if="record.detail" class="rows__detail">{{ record.detail }}</span>
            </span>
            <span class="bm-tabular rows__value">{{ record.value }}</span>
          </li>
        </ul>
      </section>

      <section v-if="byPerson.length > 1" class="card">
        <h2 class="card__title">{{ $t("totals.whoRecords") }}</h2>
        <ul class="rows">
          <li v-for="[name, count] in byPerson" :key="name">
            <span>{{ name }}</span>
            <span class="bm-tabular">{{ count }} Einträge</span>
          </li>
        </ul>
        <p class="card__note">Reine Spielerei — aber jemand fragt ja doch irgendwann.</p>
      </section>

      <section v-if="totals.milestones > 0" class="card">
        <h2 class="card__title">{{ $t("milestones.title") }}</h2>
        <p class="card__lead">
          {{ $t("totals.milestonesDone", { n: totals.milestones }, totals.milestones) }}
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.totals {
  padding: 1.5rem 1rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.head h1 {
  font-size: 1.75rem;
}

.head__sub {
  margin: 0.25rem 0 0;
  color: var(--bm-ink-soft);
  font-size: 0.95rem;
  line-height: 1.45;
}

.empty {
  margin: 0;
  padding: 2.5rem 1rem;
  text-align: center;
  color: var(--bm-ink-soft);
  line-height: 1.5;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}

.stat {
  background: var(--bm-surface);
  border-radius: 1.25rem;
  padding: 1rem;
  box-shadow: var(--bm-shadow-card);
}

/* The total is the number you show people — so it gets the full width. */
.stat--wide {
  grid-column: 1 / -1;
  background: var(--bm-feed-soft);
}

.stat__value {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  font-family: var(--bm-font-display);
  font-size: 2rem;
  font-weight: 600;
  line-height: 1.05;
}

.stat--wide .stat__value {
  font-size: 2.75rem;
}

.stat__unit {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--bm-ink-soft);
}

.stat__label {
  margin: 0.2rem 0 0;
  font-size: 0.8125rem;
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
  margin-bottom: 0.75rem;
}

.card__lead {
  margin: 0;
  color: var(--bm-ink-soft);
  font-size: 0.95rem;
}

.card__note {
  margin: 0.75rem 0 0;
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.rows li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.55rem 0;
}

.rows li + li {
  border-top: 1px solid var(--bm-hairline);
}

.rows__detail {
  display: block;
  font-size: 0.75rem;
  color: var(--bm-ink-soft);
}

.rows__value {
  font-weight: 600;
  white-space: nowrap;
}
</style>
