<script setup lang="ts">
import { computed, ref } from "vue";
import { localDateLabel, localDayKey, localTimeLabel } from "@babymonitor/shared";
import { useData } from "../stores/data.ts";
import type { LocalEntry } from "../db/local.ts";
import AddEntrySheet from "../components/AddEntrySheet.vue";

const data = useData();
const addOpen = ref(false);

/**
 * Änderungsblatt. Hierüber lässt sich unter anderem die Zeit einer Windel korrigieren:
 * Der Ein-Tap-Weg auf dem Startbildschirm setzt bewusst "jetzt", weil jede Rückfrage
 * dort den nächtlichen Fall verlangsamen würde — die Korrektur gehört hierher.
 */
const editing = ref<LocalEntry | null>(null);
const editOpen = ref(false);

function edit(entry: LocalEntry) {
  editing.value = entry;
  editOpen.value = true;
}

const TYPE_LABEL: Record<string, string> = {
  feed: "Flasche",
  diaper: "Windel",
  sleep: "Schlaf",
  growth: "Wachstum",
  milestone: "Meilenstein",
  note: "Notiz",
  photo: "Foto",
  illness: "Krankheit",
  absence: "Abwesenheit",
  supply: "Gekauft",
  bath: "Baden",
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
    // Ausgespucktes zählt nicht zur Tagessumme.
    totalMl: entries.reduce((sum, e) => sum + (e.spatUp ? 0 : (e.amountMl ?? 0)), 0),
  }));
});

function describe(entry: LocalEntry): string {
  switch (entry.type) {
    case "feed":
      return [
        `${entry.amountMl} ml`,
        entry.spatUp ? "ausgespuckt" : null,
        entry.vitaminD ? "Vitamin D" : null,
      ]
        .filter(Boolean)
        .join(" · ");
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
    case "illness":
      return [
        entry.label,
        entry.temperatureDc ? `${(entry.temperatureDc / 10).toFixed(1).replace(".", ",")} °C` : null,
        entry.endedAt ? null : "läuft noch",
      ]
        .filter(Boolean)
        .join(" · ");
    case "absence":
      return entry.label ?? "";
    case "supply":
      return [entry.label, entry.supplySize, entry.supplyShop && `bei ${entry.supplyShop}`]
        .filter(Boolean)
        .join(" · ");
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

    <!-- Einträge, die der Server dauerhaft ablehnt. Sie blockieren den Abgleich
         nicht mehr, brauchen aber eine Korrektur — sonst gehen sie stillschweigend
         nie auf das andere Gerät über. -->
    <div v-if="data.invalidEntries.length > 0" class="warning" role="alert">
      <p class="warning__title">
        {{ data.invalidEntries.length === 1 ? "Ein Eintrag konnte" : `${data.invalidEntries.length} Einträge konnten` }}
        nicht übertragen werden
      </p>
      <p class="warning__text">
        Die Werte liegen außerhalb des Erlaubten. Bitte den Eintrag antippen und
        korrigieren — danach wird er automatisch übertragen.
      </p>
      <p class="warning__reason">{{ data.invalidEntries[0]!.reason }}</p>
    </div>

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
          <!-- Die ganze Zeile ist die Schaltfläche zum Ändern; nur das Löschkreuz
               daneben liegt außerhalb. -->
          <button class="entry__open" type="button" @click="edit(entry)">
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
          </button>
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
    <AddEntrySheet v-model:open="editOpen" :entry="editing" />
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

.warning {
  padding: 0.9rem 1rem;
  border: 1px solid color-mix(in srgb, var(--bm-photo) 45%, transparent);
  border-radius: 1.125rem;
  background: var(--bm-photo-soft);
}

.warning__title {
  margin: 0;
  font-weight: 600;
}

.warning__text {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
  line-height: 1.45;
  color: var(--bm-ink-soft);
}

.warning__reason {
  margin: 0.4rem 0 0;
  font-size: 0.75rem;
  font-family: var(--onyx-font-family-mono, monospace);
  color: var(--bm-ink-soft);
  word-break: break-word;
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
  grid-template-columns: 1fr auto;
  align-items: center;
  padding-inline-end: 0.5rem;
}

/* Die Zeile selbst ist die Schaltfläche zum Ändern. */
.entry__open {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.7rem 0.35rem 0.7rem 0.85rem;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.entry__open:active {
  background: var(--bm-surface-sunk);
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
.entry__dot--illness {
  background: #b5677a;
}
.entry__dot--absence {
  background: var(--bm-sleep);
}
.entry__dot--supply {
  background: var(--bm-growth);
}
.entry__dot--bath {
  background: var(--bm-sleep);
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
