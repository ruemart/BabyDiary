<script setup lang="ts">
import { computed, ref } from "vue";
import { calendarDateLabel, lifeWeek as calcLifeWeek, localDayKey } from "@babymonitor/shared";
import { useData } from "../stores/data.ts";
import { AREA_LABEL, MILESTONES, MILESTONE_NOTE, type Milestone } from "../data/milestones.ts";
import SheetDialog from "../components/SheetDialog.vue";
import TimeField from "../components/TimeField.vue";

/**
 * Abhakliste statt Freitext.
 *
 * Dieselben Einträge, die im Wochenband als Erwartung erscheinen, stehen hier zum
 * Abhaken. Es gibt nur EINE Liste — man soll nicht wissen müssen, welche Meilensteine
 * es gibt, um sie eintragen zu können.
 */
const data = useData();

const sheetOpen = ref(false);
const selected = ref<Milestone | null>(null);
const at = ref(new Date());

/** Erreichte Meilensteine, nach Schlüssel. */
const achieved = computed(() => {
  const map = new Map<string, { id: string; startedAt: string }>();
  for (const e of data.entries) {
    if (e.type === "milestone" && e.milestoneKey) {
      map.set(e.milestoneKey, { id: e.id, startedAt: e.startedAt });
    }
  }
  return map;
});

const currentWeek = computed(() => data.currentWeek);

type Row = Milestone & {
  done: { id: string; startedAt: string } | undefined;
  /** Woche, in der es tatsächlich passiert ist. */
  doneWeek: number | null;
  status: "done" | "due" | "upcoming";
};

const rows = computed<Row[]>(() =>
  MILESTONES.map((m) => {
    const done = achieved.value.get(m.key);
    const doneWeek =
      done && data.child
        ? calcLifeWeek(data.child.birthDate, done.startedAt, data.timezone)
        : null;
    return {
      ...m,
      done,
      doneWeek,
      status: done ? "done" : currentWeek.value >= m.fromWeek ? "due" : "upcoming",
    };
  }),
);

const doneCount = computed(() => rows.value.filter((r) => r.status === "done").length);

/** Was jetzt dran sein könnte — steht oben, der Rest darunter. */
const dueRows = computed(() => rows.value.filter((r) => r.status === "due"));
const doneRows = computed(() =>
  rows.value.filter((r) => r.status === "done").sort((a, b) => (a.doneWeek ?? 0) - (b.doneWeek ?? 0)),
);
const upcomingRows = computed(() => rows.value.filter((r) => r.status === "upcoming"));

function open(row: Row) {
  selected.value = row;
  at.value = row.done ? new Date(row.done.startedAt) : new Date();
  sheetOpen.value = true;
}

async function save() {
  const milestone = selected.value;
  if (!milestone) return;

  const existing = achieved.value.get(milestone.key);
  if (existing) {
    const entry = data.entries.find((e) => e.id === existing.id);
    if (entry) await data.update({ ...entry, startedAt: at.value.toISOString() });
  } else {
    await data.add(
      data.draft("milestone", at.value, {
        milestoneKey: milestone.key,
        label: milestone.label,
      }),
    );
  }
  sheetOpen.value = false;
}

async function undo() {
  const milestone = selected.value;
  const existing = milestone ? achieved.value.get(milestone.key) : undefined;
  if (existing) await data.remove(existing.id);
  sheetOpen.value = false;
}

function windowLabel(m: Milestone): string {
  return `Woche ${m.fromWeek}–${m.toWeek}`;
}

function doneLabel(row: Row): string {
  if (!row.done || !data.child) return "";
  const day = localDayKey(row.done.startedAt, data.timezone);
  return `Woche ${row.doneWeek} · ${calendarDateLabel(day)}`;
}
</script>

<template>
  <div class="milestones">
    <header class="head">
      <h1>Meilensteine</h1>
      <p class="head__sub">
        {{ doneCount }} von {{ rows.length }} abgehakt
      </p>
    </header>

    <section v-if="dueRows.length" class="group">
      <h2 class="group__title">Könnte jetzt dran sein</h2>
      <ul class="list">
        <li v-for="row in dueRows" :key="row.key">
          <button class="item" type="button" @click="open(row)">
            <span class="item__box" aria-hidden="true" />
            <span class="item__body">
              <span class="item__label">{{ row.label }}</span>
              <span class="item__meta">
                {{ AREA_LABEL[row.area] }} · {{ windowLabel(row) }}
                <span v-if="row.source === 'who'" class="item__who">WHO</span>
              </span>
              <span v-if="row.hint" class="item__hint">{{ row.hint }}</span>
            </span>
          </button>
        </li>
      </ul>
    </section>

    <section v-if="doneRows.length" class="group">
      <h2 class="group__title">Kann sie schon</h2>
      <ul class="list">
        <li v-for="row in doneRows" :key="row.key">
          <button class="item item--done" type="button" @click="open(row)">
            <span class="item__box item__box--checked" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <path d="m5 12 5 5L19 7" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <span class="item__body">
              <span class="item__label">{{ row.label }}</span>
              <span class="item__meta">seit {{ doneLabel(row) }}</span>
            </span>
          </button>
        </li>
      </ul>
    </section>

    <section v-if="upcomingRows.length" class="group">
      <h2 class="group__title">Kommt später</h2>
      <ul class="list">
        <li v-for="row in upcomingRows" :key="row.key">
          <button class="item item--future" type="button" @click="open(row)">
            <span class="item__box" aria-hidden="true" />
            <span class="item__body">
              <span class="item__label">{{ row.label }}</span>
              <span class="item__meta">
                {{ AREA_LABEL[row.area] }} · {{ windowLabel(row) }}
                <span v-if="row.source === 'who'" class="item__who">WHO</span>
              </span>
            </span>
          </button>
        </li>
      </ul>
    </section>

    <p class="note">{{ MILESTONE_NOTE }}</p>

    <SheetDialog v-model:open="sheetOpen" :title="selected?.label ?? 'Meilenstein'">
      <div class="ms-sheet">
        <p v-if="selected" class="ms-sheet__window">
          Üblich in {{ windowLabel(selected) }}<span v-if="selected.source === 'who'"> (WHO)</span>
        </p>
        <p v-if="selected?.hint" class="ms-sheet__hint">{{ selected.hint }}</p>
        <p class="ms-sheet__label">Seit wann?</p>
        <TimeField v-model="at" />
      </div>

      <template #actions>
        <div class="ms-sheet__actions">
          <button class="save" type="button" @click="save">
            {{ selected && achieved.get(selected.key) ? "Datum ändern" : "Abhaken" }}
          </button>
          <button
            v-if="selected && achieved.get(selected.key)"
            class="undo"
            type="button"
            @click="undo"
          >
            Haken entfernen
          </button>
        </div>
      </template>
    </SheetDialog>
  </div>
</template>

<style scoped>
.milestones {
  padding: 1.5rem 1rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.head h1 {
  font-size: 1.75rem;
}

.head__sub {
  margin: 0.25rem 0 0;
  color: var(--bm-ink-soft);
  font-size: 0.95rem;
}

.group__title {
  font-size: 1rem;
  margin-bottom: 0.5rem;
  color: var(--bm-ink-soft);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--bm-surface);
  border-radius: 1.25rem;
  box-shadow: var(--bm-shadow-card);
  overflow: hidden;
}

.list li + li {
  border-top: 1px solid var(--bm-hairline);
}

.item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  width: 100%;
  padding: 0.85rem 1rem;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.item--future {
  opacity: 0.6;
}

.item__box {
  width: 1.4rem;
  height: 1.4rem;
  flex: none;
  margin-top: 0.1rem;
  display: grid;
  place-items: center;
  border: 2px solid var(--bm-hairline);
  border-radius: 0.5rem;
  color: #fff;
}

.item__box--checked {
  background: var(--bm-photo);
  border-color: var(--bm-photo);
}

.item__box svg {
  width: 0.85rem;
  height: 0.85rem;
}

.item__body {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.item__label {
  font-weight: 600;
}

.item--done .item__label {
  color: var(--bm-ink);
}

.item__meta {
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.item__who {
  margin-inline-start: 0.35rem;
  padding: 0.05rem 0.35rem;
  border-radius: 62.5rem;
  background: var(--bm-surface-sunk);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.item__hint {
  margin-top: 0.15rem;
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--bm-ink-soft);
}

.note {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--bm-ink-soft);
}

.ms-sheet {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.ms-sheet__window {
  margin: 0;
  font-size: 0.875rem;
  color: var(--bm-ink-soft);
}

.ms-sheet__hint {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.45;
  color: var(--bm-ink-soft);
}

.ms-sheet__label {
  margin: 0.75rem 0 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--bm-ink-soft);
}

.ms-sheet__actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.save {
  width: 100%;
  min-height: 3.25rem;
  border: none;
  border-radius: 1.125rem;
  background: var(--bm-photo);
  color: #fff;
  font: inherit;
  font-size: 1.05rem;
  font-weight: 600;
  cursor: pointer;
}

.undo {
  width: 100%;
  min-height: 2.75rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 1.125rem;
  background: transparent;
  color: var(--bm-ink-soft);
  font: inherit;
  cursor: pointer;
}
</style>
