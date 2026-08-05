<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import {
  calendarDateLabel,
  lifeWeek as calcLifeWeek,
  localDayKey,
} from "@babymonitor/shared";
import { useData } from "../stores/data.ts";
import { WORLD_PATH, WORLD_VIEWBOX, projectToMap } from "../data/world.ts";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

/**
 * Reisekarte: wo wir mit ihr schon waren.
 *
 * Speist sich aus den Abwesenheits-Einträgen, die ohnehin schon einen Ort haben —
 * kein zweites Erfassen. Der Wohnort kommt als Ausgangspunkt dazu.
 *
 * Die Karte ist eine eingebaute SVG-Datei, kein Kartendienst: Sie funktioniert
 * offline, verrät keine Standorte nach außen, und es gibt keine Kachel-Adresse,
 * die in drei Jahren tot ist.
 */
const data = useData();
const router = useRouter();

const selected = ref<string | null>(null);

type Trip = {
  id: string;
  label: string;
  kind: string;
  x: number;
  y: number;
  week: number;
  from: string;
  to: string | null;
  isHome: boolean;
};

const trips = computed<Trip[]>(() => {
  const child = data.child;
  if (!child) return [];

  const result: Trip[] = [];

  if (child.latitude !== null && child.longitude !== null) {
    const p = projectToMap(child.latitude, child.longitude);
    result.push({
      id: "home",
      label: child.placeName ?? t("travel.home"),
      kind: t("travel.home"),
      x: p.x,
      y: p.y,
      week: 0,
      from: child.birthDate,
      to: null,
      isHome: true,
    });
  }

  for (const entry of data.entries) {
    if (entry.type !== "absence") continue;
    if (entry.latitude === null || entry.longitude === null) continue;
    const p = projectToMap(entry.latitude, entry.longitude);
    result.push({
      id: entry.id,
      label: entry.placeName ?? entry.label ?? t("travel.away"),
      kind: entry.label ?? t("travel.trip"),
      x: p.x,
      y: p.y,
      week: calcLifeWeek(child.birthDate, entry.startedAt, data.timezone),
      from: localDayKey(entry.startedAt, data.timezone),
      to: entry.endedAt ? localDayKey(entry.endedAt, data.timezone) : null,
      isHome: false,
    });
  }

  return result.sort((a, b) => a.week - b.week);
});

const journeys = computed(() => trips.value.filter((t) => !t.isHome));

/**
 * Ausschnitt so wählen, dass alle Orte hineinpassen.
 *
 * Eine ganze Weltkarte mit drei Punkten in Süddeutschland wäre unlesbar. Die
 * Mindestspanne verhindert umgekehrt, dass ein einzelner Ort auf Straßenniveau
 * gezoomt wird, wo dann gar nichts mehr zu erkennen ist.
 */
const viewBox = computed(() => {
  const points = trips.value;
  if (points.length === 0) return `0 0 ${WORLD_VIEWBOX.width} ${WORLD_VIEWBOX.height}`;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minSpanX = 90;
  const minSpanY = 45;

  let x0 = Math.min(...xs);
  let x1 = Math.max(...xs);
  let y0 = Math.min(...ys);
  let y1 = Math.max(...ys);

  const padX = Math.max((x1 - x0) * 0.4, minSpanX / 2);
  const padY = Math.max((y1 - y0) * 0.4, minSpanY / 2);
  x0 -= padX;
  x1 += padX;
  y0 -= padY;
  y1 += padY;

  // Seitenverhältnis der Anzeige halten, sonst verzerrt der Ausschnitt die Karte.
  const targetRatio = 4 / 3;
  const width = x1 - x0;
  const height = y1 - y0;
  if (width / height < targetRatio) {
    const extra = (height * targetRatio - width) / 2;
    x0 -= extra;
    x1 += extra;
  } else {
    const extra = (width / targetRatio - height) / 2;
    y0 -= extra;
    y1 += extra;
  }

  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  return `${x0} ${y0} ${Math.min(WORLD_VIEWBOX.width - x0, x1 - x0)} ${Math.min(WORLD_VIEWBOX.height - y0, y1 - y0)}`;
});

/**
 * Punktgröße gegen den Zoom rechnen.
 *
 * Der Ausschnitt wird an die besuchten Orte angepasst, also skaliert alles darin mit.
 * Ohne Gegenrechnung wird aus einem Punkt bei einem einzelnen Reiseziel ein Fleck,
 * der halb Norddeutschland verdeckt.
 */
const dotRadius = computed(() => {
  const width = Number(viewBox.value.split(" ")[2]);
  return Math.max(1.2, (width / WORLD_VIEWBOX.width) * 6);
});

/** Verbindungslinie in Reihenfolge der Reisen — der zurückgelegte Weg. */
const routeLine = computed(() => {
  if (trips.value.length < 2) return "";
  return trips.value.map((t, i) => `${i === 0 ? "M" : "L"}${t.x} ${t.y}`).join("");
});

const selectedTrip = computed(() => trips.value.find((t) => t.id === selected.value) ?? null);

function periodLabel(trip: Trip): string {
  if (trip.isHome) return t("travel.startingPoint");
  const from = calendarDateLabel(trip.from);
  return trip.to && trip.to !== trip.from ? `${from} – ${calendarDateLabel(trip.to)}` : from;
}

function jumpToWeek(week: number) {
  void router.push({ path: "/wochen", query: { woche: String(week) } });
}
</script>

<template>
  <div class="travel">
    <header class="head">
      <h1>{{ $t("travel.title") }}</h1>
      <p class="head__sub">
        {{
          journeys.length === 0
            ? $t("travel.none")
            : journeys.length === 1
              ? $t("travel.one")
              : `${journeys.length} Orte, an denen sie schon war.`
        }}
      </p>
    </header>

    <div class="map-card">
      <svg :viewBox="viewBox" class="map" role="img" :aria-label="$t('travel.mapAria')">
        <path :d="WORLD_PATH" class="map__land" />
        <path v-if="routeLine" :d="routeLine" class="map__route" />
        <g v-for="trip in trips" :key="trip.id">
          <circle
            :cx="trip.x"
            :cy="trip.y"
            :r="selected === trip.id ? dotRadius * 1.4 : dotRadius"
            class="map__dot"
            :class="{ 'map__dot--home': trip.isHome, 'map__dot--active': selected === trip.id }"
            @click="selected = trip.id"
          />
        </g>
      </svg>
    </div>

    <p v-if="journeys.length === 0" class="empty">
      {{ $t("travel.note") }}
    </p>

    <ul v-else class="list">
      <li v-for="trip in trips" :key="trip.id">
        <button
          class="item"
          :class="{ 'item--active': selected === trip.id }"
          type="button"
          @click="selected = trip.id"
        >
          <span class="item__dot" :class="{ 'item__dot--home': trip.isHome }" aria-hidden="true" />
          <span class="item__body">
            <span class="item__label">{{ trip.label }}</span>
            <span class="item__meta">
              {{ trip.isHome ? trip.kind : `${trip.kind} · Woche ${trip.week}` }}
              · {{ periodLabel(trip) }}
            </span>
          </span>
          <button
            v-if="!trip.isHome"
            class="item__jump"
            type="button"
            @click.stop="jumpToWeek(trip.week)"
          >
            {{ $t("travel.toWeek") }}
          </button>
        </button>
      </li>
    </ul>

    <p v-if="selectedTrip && !selectedTrip.isHome" class="hint">
      In Woche {{ selectedTrip.week }} wart ihr in {{ selectedTrip.label }}.
    </p>
  </div>
</template>

<style scoped>
.travel {
  padding: 1.5rem 1rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.head h1 {
  font-size: 1.75rem;
}

.head__sub {
  margin: 0.25rem 0 0;
  color: var(--bm-ink-soft);
  font-size: 0.95rem;
}

.map-card {
  background: var(--bm-surface);
  border-radius: 1.5rem;
  padding: 0.75rem;
  box-shadow: var(--bm-shadow-card);
}

.map {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 1rem;
  background: var(--bm-surface-sunk);
}

.map__land {
  fill: color-mix(in srgb, var(--bm-growth) 16%, transparent);
  stroke: color-mix(in srgb, var(--bm-growth) 35%, transparent);
  stroke-width: 0.4;
  vector-effect: non-scaling-stroke;
}

/* Der zurückgelegte Weg in Reihenfolge der Reisen. */
.map__route {
  fill: none;
  stroke: var(--bm-photo);
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
  stroke-linejoin: round;
  opacity: 0.7;
  vector-effect: non-scaling-stroke;
}

.map__dot {
  fill: var(--bm-photo);
  stroke: var(--bm-surface);
  stroke-width: 1.5;
  cursor: pointer;
  vector-effect: non-scaling-stroke;
  transition: r 140ms ease;
}

.map__dot--home {
  fill: var(--bm-feed);
}

.map__dot--active {
  stroke-width: 2.5;
}

.empty {
  margin: 0;
  padding: 1rem;
  color: var(--bm-ink-soft);
  font-size: 0.9rem;
  line-height: 1.5;
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
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.8rem 1rem;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.item--active {
  background: var(--bm-photo-soft);
}

.item__dot {
  width: 0.6rem;
  height: 0.6rem;
  flex: none;
  border-radius: 50%;
  background: var(--bm-photo);
}

.item__dot--home {
  background: var(--bm-feed);
}

.item__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.item__label {
  font-weight: 600;
}

.item__meta {
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.item__jump {
  flex: none;
  min-height: 2.25rem;
  padding: 0 0.7rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 62.5rem;
  background: var(--bm-surface);
  color: var(--bm-ink-soft);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}

.hint {
  margin: 0;
  font-size: 0.875rem;
  color: var(--bm-ink-soft);
}
</style>
