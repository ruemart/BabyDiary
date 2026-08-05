<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { localDayKey, type EntryType } from "@babymonitor/shared";
import { useData } from "../stores/data.ts";
import type { LocalEntry } from "../db/local.ts";
import { vitaminHolderOn } from "../composables/useVitaminD.ts";
import { useUndo } from "../composables/useUndo.ts";
import SheetDialog from "./SheetDialog.vue";
import TimeField from "./TimeField.vue";
import AmountStepper from "./AmountStepper.vue";
import SpatUpToggle from "./SpatUpToggle.vue";
import VitaminDToggle from "./VitaminDToggle.vue";
import CmField from "./CmField.vue";

/**
 * Ein Blatt für Nachtragen UND Ändern.
 *
 * Der Schnellzugriff auf dem Startbildschirm deckt den Normalfall ab; hier landet alles
 * andere: vergessene Mahlzeiten, das Gewicht von der U-Untersuchung, der erste Zahn —
 * jeweils mit frei wählbarem Zeitpunkt.
 *
 * Dasselbe Blatt dient zum Bearbeiten bestehender Einträge. Das ist der allgemeine Weg,
 * um die Zeit einer Windel zu korrigieren: Die Ein-Tap-Erfassung setzt bewusst "jetzt",
 * weil jede Rückfrage den nächtlichen Fall verlangsamen würde — die Korrektur gehört
 * danach in den Verlauf, nicht in den Erfassungsweg.
 */
const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
  entry?: LocalEntry | null;
  /**
   * Vorbelegter Zeitpunkt beim Neuanlegen, als lokale ISO-Zeichenkette ohne Zone.
   *
   * Der Verlauf zeigt einen bestimmten Tag. Wer dort "Nachtragen" tippt, meint fast
   * immer genau diesen Tag — ihn erneut auswählen zu müssen wäre eine Rückfrage nach
   * etwas, das schon auf dem Bildschirm steht.
   */
  defaultAt?: string | null;
}>();

const data = useData();
const confirmWithUndo = useUndo();

const isEditing = computed(() => !!props.entry);

/**
 * Zuletzt nachgetragener Zeitpunkt, über das Schließen des Blattes hinaus gemerkt.
 *
 * Wer eine ganze Nacht nachträgt, wählt sonst sechsmal hintereinander dasselbe Datum.
 * Gemerkt wird nur ein Zeitpunkt, der spürbar in der Vergangenheit lag — nach einem
 * Eintrag "gerade eben" steht beim nächsten Öffnen wieder "jetzt", denn dann war es
 * kein Nachtragen.
 *
 * Modulweit statt im Speicher der Anwendung: Das ist eine Bedienhilfe für die nächsten
 * Minuten, kein Zustand, der einen Neustart überleben sollte.
 */
let lastBackdatedAt: Date | null = null;
const BACKDATE_MEMORY_MS = 45 * 60 * 1000;

/**
 * Nach Art gruppiert statt sieben gleichrangige Kacheln.
 *
 * Die Gruppen sind keine Kosmetik, sie benennen einen echten Unterschied: Die
 * ersten drei sind der Alltag und der Grund, warum man überhaupt nachträgt. Die
 * mittleren kommen selten. Die letzten beiden sind ZEITRÄUME — sie haben ein Ende
 * und verhalten sich anders als alles darüber.
 *
 * Nichts ist versteckt: Alles bleibt einen Tap entfernt, nur das Gewicht folgt der
 * Häufigkeit.
 */
const TYPE_GROUPS: { title: string; types: { value: EntryType; label: string }[] }[] = [
  {
    title: "Alltag",
    types: [
      { value: "feed", label: "Flasche" },
      { value: "diaper", label: "Windel" },
      { value: "sleep", label: "Schlaf" },
      { value: "bath", label: "Baden" },
    ],
  },
  {
    title: "Ab und zu",
    types: [
      { value: "growth", label: "Wachstum" },
      { value: "note", label: "Notiz" },
    ],
  },
  {
    title: "Zeitraum mit Anfang und Ende",
    types: [
      { value: "illness", label: "Krankheit" },
      { value: "absence", label: "Urlaub" },
    ],
  },
];

/** Häufige Krankheiten zum Antippen — Freitext bleibt trotzdem möglich. */
const ILLNESS_PRESETS = ["Erkältung", "Fieber", "Magen-Darm", "Zahnen", "Impfreaktion"];
const ABSENCE_KINDS = ["Urlaub", "Elternzeit", "Kur", "Krankenhaus"];

const type = ref<EntryType>("feed");
const at = ref(new Date());
const endAt = ref<Date>(new Date());
const amountMl = ref(120);
const diaper = ref<"empty" | "wet" | "soiled">("wet");
const weightG = ref<number | null>(null);
const lengthMm = ref<number | null>(null);
const headMm = ref<number | null>(null);
const label = ref("");
const note = ref("");
const spatUp = ref(false);
const vitaminD = ref(false);

/**
 * Hängt an einer ANDEREN Mahlzeit DESSELBEN TAGES schon das Vitamin D?
 *
 * Maßgeblich ist der Tag des Eintrags, nicht heute — beim Nachtragen von gestern muss
 * das Häkchen für gestern setzbar bleiben. Der eigene Eintrag zählt nicht mit, sonst
 * ließe sich ein einmal gesetzter Haken nie wieder entfernen.
 */
const vitaminAlreadyThatDay = computed(() => {
  const holder = vitaminHolderOn(
    data.entries,
    data.timezone,
    localDayKey(at.value, data.timezone),
  );
  return !!holder && holder.id !== props.entry?.id;
});
const temperatureDc = ref<number | null>(null);

/**
 * Ob das Ende schon feststeht.
 *
 * Standardmäßig NEIN: Einen Zeitraum trägt man ein, wenn er beginnt — beim Einschlafen
 * nach dem Aufwachzeitpunkt zu fragen ist genau die Rückfrage, die eine Eingabe
 * verhindert. Läuft der Eintrag, taucht er unter "Läuft gerade" auf und wird dort mit
 * einem Tap beendet.
 */
const hasEnd = ref(false);
const PERIOD_TYPES = new Set<EntryType>(["sleep", "illness", "absence"]);

/* ── Ort bei Abwesenheiten ────────────────────────────────────────────────── */

type Place = { name: string; latitude: number; longitude: number; admin?: string };

const place = ref<{ latitude: number; longitude: number; placeName: string } | null>(null);
const placeQuery = ref("");
const placeResults = ref<Place[]>([]);
const placeSearching = ref(false);

async function searchPlace() {
  const q = placeQuery.value.trim();
  if (q.length < 2) return;
  placeSearching.value = true;
  try {
    const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`, {
      credentials: "same-origin",
      signal: AbortSignal.timeout(10_000),
    });
    placeResults.value = res.ok ? await res.json() : [];
  } catch {
    placeResults.value = [];
  } finally {
    placeSearching.value = false;
  }
}

function choosePlace(p: Place) {
  place.value = {
    latitude: p.latitude,
    longitude: p.longitude,
    placeName: p.admin ? `${p.name} (${p.admin})` : p.name,
  };
  placeResults.value = [];
  placeQuery.value = "";
}

watch(open, (isOpen) => {
  if (!isOpen) return;

  const existing = props.entry;
  if (existing) {
    type.value = existing.type;
    at.value = new Date(existing.startedAt);
    endAt.value = existing.endedAt ? new Date(existing.endedAt) : new Date();
    amountMl.value = existing.amountMl ?? data.suggestedAmountMl;
    diaper.value = (existing.diaper === "both" ? "soiled" : existing.diaper) ?? "wet";
    weightG.value = existing.weightG;
    lengthMm.value = existing.lengthMm;
    headMm.value = existing.headMm;
    label.value = existing.label ?? "";
    note.value = existing.note ?? "";
    spatUp.value = existing.spatUp === true;
    vitaminD.value = existing.vitaminD === true;
    temperatureDc.value = existing.temperatureDc;
    hasEnd.value = existing.endedAt !== null;
    place.value =
      existing.latitude !== null && existing.longitude !== null
        ? {
            latitude: existing.latitude,
            longitude: existing.longitude,
            placeName: existing.placeName ?? "",
          }
        : null;
    return;
  }

  type.value = "feed";
  // Der angezeigte Tag hat Vorrang vor dem zuletzt gemerkten Zeitpunkt: Er steht
  // sichtbar auf dem Bildschirm, das Gemerkte nicht.
  at.value = props.defaultAt ? new Date(props.defaultAt) : (lastBackdatedAt ?? new Date());
  endAt.value = new Date(at.value.getTime() + 30 * 60_000);
  amountMl.value = data.suggestedAmountMl;
  diaper.value = "wet";
  weightG.value = null;
  lengthMm.value = null;
  headMm.value = null;
  label.value = "";
  note.value = "";
  spatUp.value = false;
  vitaminD.value = false;
  temperatureDc.value = null;
  hasEnd.value = false;
  place.value = null;
  placeQuery.value = "";
  placeResults.value = [];
});

const canSave = computed(() => {
  switch (type.value) {
    case "feed":
      return amountMl.value >= 0;
    case "growth":
      return weightG.value !== null || lengthMm.value !== null || headMm.value !== null;
    case "note":
      return note.value.trim().length > 0;
    case "sleep":
      // Ohne Ende gilt der Schlaf als laufend — das ist der Normalfall beim Anlegen.
      return !hasEnd.value || endAt.value.getTime() > at.value.getTime();
    case "illness":
    case "absence":
      return (
        label.value.trim().length > 0 &&
        (!hasEnd.value || endAt.value.getTime() > at.value.getTime())
      );
    default:
      return true;
  }
});

/** "38,5" -> 385 Zehntelgrad. Komma, weil deutsche Tastatur. */
function tempFrom(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 10);
}

function num(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

/** Die typabhängigen Felder — beim Anlegen wie beim Ändern identisch. */
function fields() {
  return {
    amountMl: type.value === "feed" ? amountMl.value : null,
    spatUp: type.value === "feed" ? spatUp.value : false,
    vitaminD: type.value === "feed" ? vitaminD.value : false,
    diaper: type.value === "diaper" ? diaper.value : null,
    endedAt:
      PERIOD_TYPES.has(type.value) && hasEnd.value ? endAt.value.toISOString() : null,
    temperatureDc: type.value === "illness" ? temperatureDc.value : null,
    latitude: type.value === "absence" ? (place.value?.latitude ?? null) : null,
    longitude: type.value === "absence" ? (place.value?.longitude ?? null) : null,
    placeName: type.value === "absence" ? (place.value?.placeName ?? null) : null,
    weightG: type.value === "growth" ? weightG.value : null,
    lengthMm: type.value === "growth" ? lengthMm.value : null,
    headMm: type.value === "growth" ? headMm.value : null,
    label:
      type.value === "illness" || type.value === "absence" ? label.value.trim() : null,
    note: note.value.trim() || null,
  };
}

async function save() {
  if (!canSave.value) return;

  const existing = props.entry;
  if (existing) {
    // Id, Anleger und Lebenswoche bleiben — geändert wird nur, was im Blatt steht.
    await data.update({
      ...existing,
      type: type.value,
      startedAt: at.value.toISOString(),
      ...fields(),
    });
    open.value = false;
    return;
  }

  // Nur merken, wenn wirklich nachgetragen wurde.
  lastBackdatedAt =
    Date.now() - at.value.getTime() > BACKDATE_MEMORY_MS ? new Date(at.value) : null;

  const entry = data.draft(type.value, at.value, fields());
  await data.add(entry);
  open.value = false;
  confirmWithUndo("Eintrag nachgetragen", entry.id);
}
</script>

<template>
  <SheetDialog v-model:open="open" :title="isEditing ? 'Eintrag ändern' : 'Eintrag nachtragen'">
    <div class="add">
      <div v-if="!isEditing" class="types">
        <div
          v-for="group in TYPE_GROUPS"
          :key="group.title"
          class="types__group"
          role="group"
          :aria-label="group.title"
        >
          <p class="types__title">{{ group.title }}</p>
          <div class="types__row" :style="{ '--cols': group.types.length }">
            <button
              v-for="option in group.types"
              :key="option.value"
              type="button"
              class="types__item"
              :class="{ 'types__item--active': type === option.value }"
              @click="type = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="type === 'feed'" class="field">
        <span class="field__label">Menge</span>
        <AmountStepper v-model="amountMl" />
        <SpatUpToggle v-model="spatUp" />
        <VitaminDToggle v-model="vitaminD" :already-given-that-day="vitaminAlreadyThatDay" />
      </div>

      <template v-else-if="type === 'diaper'">
        <div class="field">
          <span class="field__label">Zustand</span>
          <div class="segmented">
            <button
              v-for="option in [
                { value: 'empty', label: 'Leer' },
                { value: 'wet', label: 'Feucht' },
                { value: 'soiled', label: 'Voll' },
              ]"
              :key="option.value"
              type="button"
              class="segmented__item"
              :class="{ 'segmented__item--active': diaper === option.value }"
              @click="diaper = option.value as 'empty' | 'wet' | 'soiled'"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </template>

      <template v-else-if="type === 'growth'">
        <div class="grid">
          <label class="field">
            <span class="field__label">Gewicht</span>
            <span class="field__group">
              <input :value="weightG ?? ''" type="number" inputmode="numeric" @input="weightG = num(($event.target as HTMLInputElement).value)" />
              <span class="field__unit">g</span>
            </span>
          </label>
          <CmField v-model="lengthMm" label="Länge" />
        </div>
        <CmField v-model="headMm" label="Kopfumfang" />
      </template>

      <template v-else-if="type === 'illness'">
        <div class="field">
          <span class="field__label">Was ist los?</span>
          <div class="chips">
            <button
              v-for="preset in ILLNESS_PRESETS"
              :key="preset"
              type="button"
              class="chip"
              :class="{ 'chip--active': label === preset }"
              @click="label = preset"
            >
              {{ preset }}
            </button>
          </div>
          <input v-model="label" type="text" placeholder="oder eigene Angabe" />
        </div>
        <label class="field">
          <span class="field__label">Höchste gemessene Temperatur (optional)</span>
          <span class="field__group">
            <input
              :value="temperatureDc === null ? '' : String(temperatureDc / 10).replace('.', ',')"
              type="text"
              inputmode="decimal"
              placeholder="z. B. 38,5"
              @input="temperatureDc = tempFrom(($event.target as HTMLInputElement).value)"
            />
            <span class="field__unit">°C</span>
          </span>
        </label>
      </template>

      <template v-else-if="type === 'absence'">
        <div class="field">
          <span class="field__label">Art</span>
          <div class="chips">
            <button
              v-for="kind in ABSENCE_KINDS"
              :key="kind"
              type="button"
              class="chip"
              :class="{ 'chip--active': label === kind }"
              @click="label = kind"
            >
              {{ kind }}
            </button>
          </div>
          <input v-model="label" type="text" placeholder="oder eigene Angabe" />
        </div>

        <div class="field">
          <span class="field__label">Wo? (optional)</span>
          <!-- Damit für diese Tage das Wetter am Urlaubsort gilt statt zu Hause.
               Ein Eintrag statt einer täglichen Ortsangabe. -->
          <p v-if="place" class="place__chosen">
            {{ place.placeName }}
            <button type="button" class="place__clear" @click="place = null">ändern</button>
          </p>
          <template v-else>
            <div class="place">
              <input
                v-model="placeQuery"
                type="text"
                placeholder="Ort, PLZ oder Land"
                @keyup.enter="searchPlace"
              />
              <button type="button" class="place__go" :disabled="placeSearching" @click="searchPlace">
                {{ placeSearching ? "…" : "Suchen" }}
              </button>
            </div>
            <ul v-if="placeResults.length" class="place__results">
              <li v-for="result in placeResults" :key="`${result.latitude},${result.longitude}`">
                <button type="button" @click="choosePlace(result)">
                  {{ result.name }}<span v-if="result.admin">, {{ result.admin }}</span>
                </button>
              </li>
            </ul>
          </template>
        </div>
      </template>

      <!-- Ein Zeitraum darf in der Zukunft beginnen: Einen Urlaub trägt man vorher ein. -->
      <TimeField v-model="at" :allow-future="type === 'absence'" />

      <div v-if="PERIOD_TYPES.has(type)" class="field">
        <button
          type="button"
          class="ends"
          :class="{ 'ends--on': hasEnd }"
          role="switch"
          :aria-checked="hasEnd"
          @click="hasEnd = !hasEnd"
        >
          <span class="ends__box" aria-hidden="true">
            <svg v-if="hasEnd" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="m5 12 5 5L19 7" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <span class="ends__text">
            <span class="ends__label">Ende ist schon bekannt</span>
            <span class="ends__hint">
              {{ hasEnd ? "Zeitpunkt unten wählen" : "Läuft noch — später mit einem Tap beenden" }}
            </span>
          </span>
        </button>
      </div>

      <div v-if="PERIOD_TYPES.has(type) && hasEnd" class="field">
        <span class="field__label">Ende</span>
        <TimeField v-model="endAt" allow-future />
      </div>

      <label class="field">
        <span class="field__label">
          {{ type === "note" ? "Notiz" : "Notiz (optional)" }}
        </span>
        <textarea v-model="note" rows="2" />
      </label>
    </div>

    <template #actions>
      <button class="save" type="button" :disabled="!canSave" @click="save">
        {{ isEditing ? "Änderung speichern" : "Speichern" }}
      </button>
    </template>
  </SheetDialog>
</template>

<style scoped>
.add {
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
}

.types {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.types__title {
  margin: 0 0 0.3rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--bm-ink-soft);
}

.types__row {
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  gap: 0.4rem;
}

.types__item {
  min-height: 2.75rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.types__item--active {
  background: var(--bm-feed);
  border-color: transparent;
  color: #2a2028;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field__label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--bm-ink-soft);
}

.field__group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.field__unit {
  color: var(--bm-ink-soft);
  font-size: 0.9rem;
}

.field input,
.field textarea {
  width: 100%;
  min-height: 2.875rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface);
  color: var(--bm-ink);
  font: inherit;
  font-size: 1rem;
}

.ends {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  min-height: 3.25rem;
  padding: 0.6rem 0.9rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 1.125rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.ends--on {
  border-color: color-mix(in srgb, var(--bm-sleep) 55%, transparent);
  background: var(--bm-sleep-soft);
}

.ends__box {
  width: 1.5rem;
  height: 1.5rem;
  flex: none;
  display: grid;
  place-items: center;
  border: 2px solid var(--bm-hairline);
  border-radius: 0.5rem;
  background: var(--bm-surface);
  color: #fff;
}

.ends--on .ends__box {
  background: var(--bm-sleep);
  border-color: var(--bm-sleep);
}

.ends__box svg {
  width: 0.9rem;
  height: 0.9rem;
}

.ends__text {
  display: flex;
  flex-direction: column;
}

.ends__label {
  font-weight: 600;
}

.ends__hint {
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.4rem;
}

.chip {
  min-height: 2.25rem;
  padding: 0 0.75rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 62.5rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}

.chip--active {
  background: var(--bm-growth);
  border-color: transparent;
  color: #fff;
}

.place {
  display: flex;
  gap: 0.5rem;
}

.place input {
  flex: 1;
  min-width: 0;
}

.place__go {
  flex: none;
  min-height: 2.875rem;
  padding-inline: 0.9rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font: inherit;
  cursor: pointer;
}

.place__chosen {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface-sunk);
  font-weight: 600;
}

.place__clear {
  border: none;
  background: none;
  color: var(--bm-ink-soft);
  font: inherit;
  font-size: 0.8125rem;
  text-decoration: underline;
  cursor: pointer;
}

.place__results {
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  overflow: hidden;
}

.place__results li + li {
  border-top: 1px solid var(--bm-hairline);
}

.place__results button {
  width: 100%;
  padding: 0.6rem 0.8rem;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.segmented {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.segmented__item {
  min-height: 2.875rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.segmented__item--active {
  background: var(--bm-diaper);
  border-color: transparent;
  color: #fff;
}

.save {
  width: 100%;
  min-height: 3.25rem;
  border: none;
  border-radius: 1.125rem;
  background: var(--bm-feed);
  color: #2a2028;
  font: inherit;
  font-size: 1.05rem;
  font-weight: 600;
  cursor: pointer;
}

.save:disabled {
  opacity: 0.5;
}
</style>
