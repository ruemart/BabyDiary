<script setup lang="ts">
import { computed, ref } from "vue";
import { localDateLabel, localDayKey, localTimeLabel } from "@babymonitor/shared";
import { useData } from "../stores/data.ts";
import type { LocalEntry } from "../db/local.ts";
import AddEntrySheet from "../components/AddEntrySheet.vue";

const data = useData();
const addOpen = ref(false);

const TYPE_LABEL: Record<string, string> = {
  feed: "Flasche",
  diaper: "Windel",
  sleep: "Schlaf",
  growth: "Wachstum",
  milestone: "Meilenstein",
  note: "Notiz",
  photo: "Foto",
};

const DIAPER_LABEL: Record<string, string> = {
  empty: "leer",
  wet: "feucht",
  soiled: "voll",
  both: "voll",
};

/** Nach lokalem Kalendertag gruppieren — nicht nach UTC, sonst rutschen Nachteinträge. */
const days = computed(() => {
  const groups = new Map<string, LocalEntry[]>();
  for (const entry of data.byTimeDesc) {
    const key = localDayKey(entry.startedAt, data.timezone);
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([key, entries]) => ({
    key,
    label: localDateLabel(`${key}T12:00:00Z`, data.timezone),
    entries,
    totalMl: entries.reduce((sum, e) => sum + (e.amountMl ?? 0), 0),
  }));
});

function describe(entry: LocalEntry): string {
  switch (entry.type) {
    case "feed":
      return `${entry.amountMl} ml`;
    case "diaper":
      return DIAPER_LABEL[entry.diaper ?? "empty"] ?? "";
    case "sleep":
      return entry.endedAt
        ? `bis ${localTimeLabel(entry.endedAt, data.timezone)}`
        : "läuft noch";
    case "growth":
      return [
        entry.weightG ? `${(entry.weightG / 1000).toFixed(3)} kg` : null,
        entry.lengthMm ? `${(entry.lengthMm / 10).toFixed(1)} cm` : null,
        entry.headMm ? `KU ${(entry.headMm / 10).toFixed(1)} cm` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "milestone":
      return entry.label ?? "";
    case "photo":
      return `Woche ${entry.lifeWeek}`;
    default:
      return "";
  }
}

async function remove(entry: LocalEntry) {
  await data.remove(entry.id);
}
</script>

<template>
  <div class="history">
    <header class="history__head">
      <h1>Verlauf</h1>
      <button class="history__add" type="button" @click="addOpen = true">Nachtragen</button>
    </header>

    <p v-if="days.length === 0" class="empty">
      Noch nichts eingetragen. Über „Nachtragen“ lassen sich auch vergangene Tage ergänzen.
    </p>

    <section v-for="day in days" :key="day.key" class="day">
      <div class="day__head">
        <h2>{{ day.label }}</h2>
        <span v-if="day.totalMl > 0" class="day__total bm-tabular">{{ day.totalMl }} ml</span>
      </div>

      <ul class="entries">
        <li v-for="entry in day.entries" :key="entry.id" class="entry">
          <span class="entry__time bm-tabular">
            {{ localTimeLabel(entry.startedAt, data.timezone) }}
          </span>
          <span class="entry__dot" :class="`entry__dot--${entry.type}`" aria-hidden="true" />
          <span class="entry__body">
            <span class="entry__type">{{ TYPE_LABEL[entry.type] }}</span>
            <span class="entry__detail">{{ describe(entry) }}</span>
            <span v-if="entry.note" class="entry__note">{{ entry.note }}</span>
          </span>
          <span class="entry__by">{{ entry.createdBy }}</span>
          <button
            class="entry__remove"
            type="button"
            :aria-label="`${TYPE_LABEL[entry.type]} um ${localTimeLabel(entry.startedAt, data.timezone)} löschen`"
            @click="remove(entry)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
            </svg>
          </button>
        </li>
      </ul>
    </section>

    <AddEntrySheet v-model:open="addOpen" />
  </div>
</template>

<style scoped>
.history {
  padding: 1.5rem 1rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.history__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.history__head h1 {
  font-size: 1.75rem;
}

.history__add {
  min-height: 2.5rem;
  padding: 0 0.9rem;
  border: none;
  border-radius: 62.5rem;
  background: var(--bm-feed);
  color: #2a2028;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.empty {
  margin: 0;
  padding: 2rem 1rem;
  text-align: center;
  color: var(--bm-ink-soft);
  line-height: 1.5;
}

.day__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.day__head h2 {
  font-size: 1.05rem;
}

.day__total {
  color: var(--bm-ink-soft);
  font-size: 0.9rem;
  font-weight: 600;
}

.entries {
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--bm-surface);
  border-radius: 1.25rem;
  box-shadow: var(--bm-shadow-card);
  overflow: hidden;
}

.entry {
  display: grid;
  grid-template-columns: auto auto 1fr auto auto;
  align-items: center;
  gap: 0.6rem;
  padding: 0.7rem 0.85rem;
}

.entry + .entry {
  border-top: 1px solid var(--bm-hairline);
}

.entry__time {
  font-size: 0.85rem;
  color: var(--bm-ink-soft);
  font-weight: 600;
}

.entry__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
}

.entry__dot--feed {
  background: var(--bm-feed);
}
.entry__dot--diaper {
  background: var(--bm-diaper);
}
.entry__dot--sleep {
  background: var(--bm-sleep);
}
.entry__dot--growth {
  background: var(--bm-growth);
}
.entry__dot--milestone,
.entry__dot--photo {
  background: var(--bm-photo);
}
.entry__dot--note {
  background: var(--bm-ink-soft);
}

.entry__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.entry__type {
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.entry__detail {
  font-weight: 600;
}

.entry__note {
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.entry__by {
  font-size: 0.75rem;
  color: var(--bm-ink-soft);
}

.entry__remove {
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--bm-ink-soft);
  cursor: pointer;
}

.entry__remove svg {
  width: 0.95rem;
  height: 0.95rem;
}
</style>
