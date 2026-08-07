<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { localDayKey, type EntryType } from "@milo/shared";
import { useData } from "../stores/data.ts";
import type { LocalEntry } from "../db/local.ts";
import { vitaminHolderOn } from "../composables/useVitaminD.ts";
import { useUndo } from "../composables/useUndo.ts";
import { entryFields, PERIOD_TYPES } from "../utils/entryFields.ts";
import SheetDialog from "./SheetDialog.vue";
import TimeField from "./TimeField.vue";
import AmountStepper from "./AmountStepper.vue";
import FlagToggle from "./FlagToggle.vue";
import CmField from "./CmField.vue";
import { useI18n } from "vue-i18n";


const { t } = useI18n();
/**
 * One sheet for adding past entries AND editing.
 *
 * The quick actions on the home screen cover the normal case; everything else lands
 * here: forgotten feeds, the weight from the check-up, the first tooth — each with a
 * freely chosen moment.
 *
 * The same sheet edits existing entries. That is the general way to correct the time of
 * a nappy: the one-tap capture deliberately sets "now", because any prompt would slow
 * down the night-time case — the correction belongs afterwards in the history, not in
 * the capture path.
 */
const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
  entry?: LocalEntry | null;
  /**
   * Prefilled moment when creating, as a local ISO string without a zone.
   *
   * The history shows one particular day. Someone tapping "add entry" there almost
   * always means that day — having to choose it again would be a prompt for something
   * already on the screen.
   */
  defaultAt?: string | null;
}>();

const data = useData();
const confirmWithUndo = useUndo();

const isEditing = computed(() => !!props.entry);

/**
 * The last backdated moment, remembered across closing the sheet.
 *
 * Someone catching up on a whole night otherwise picks the same date six times in a
 * row. Only a moment noticeably in the past is remembered — after an entry made "just
 * now", the next open shows "now" again, because that was not catching up.
 *
 * Module-wide rather than in the app store: this is an aid for the next few minutes,
 * not state that should survive a restart.
 */
let lastBackdatedAt: Date | null = null;
const BACKDATE_MEMORY_MS = 45 * 60 * 1000;

/**
 * Grouped by kind instead of seven equal tiles.
 *
 * The groups are not cosmetic, they name a real difference: the first three are the
 * everyday things and the reason you add entries at all. The middle ones are rare. The
 * last two are PERIODS — they have an end and behave differently from everything above.
 *
 * Nothing is hidden: everything stays one tap away, only the weight follows frequency.
 */
const TYPE_GROUPS: { titleKey: string; types: { value: EntryType; key: string }[] }[] = [
  {
    titleKey: "add.group.everyday",
    types: [
      { value: "feed", key: "entry.feed" },
      { value: "diaper", key: "entry.diaper" },
      { value: "sleep", key: "entry.sleep" },
      { value: "bath", key: "entry.bath" },
    ],
  },
  {
    titleKey: "add.group.occasional",
    types: [
      { value: "growth", key: "entry.growth" },
      { value: "note", key: "entry.note" },
    ],
  },
  {
    titleKey: "add.group.period",
    types: [
      { value: "illness", key: "entry.illness" },
      { value: "absence", key: "add.absence" },
    ],
  },
];

/** Common illnesses to tap — free text stays possible all the same. */
const ILLNESS_PRESETS = [
  "illness.cold",
  "illness.fever",
  "illness.stomach",
  "illness.teething",
  "illness.vaccineReaction",
];
const ABSENCE_KINDS = [
  "absence.holiday",
  "absence.parentalLeave",
  "absence.cure",
  "absence.hospital",
];

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
const colicDrops = ref(false);

/**
 * Does ANOTHER feed on the SAME DAY already carry the vitamin D?
 *
 * What counts is the day of the entry, not today — when adding yesterday's feed the tick
 * must remain settable for yesterday. The entry's own tick does not count, otherwise a
 * tick once set could never be removed again.
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
 * Whether the end is already known.
 *
 * NO by default: a period is recorded when it begins — asking for the waking time while
 * the child is falling asleep is exactly the prompt that prevents an entry. While it
 * runs it appears under "Currently running" and is ended there with one tap.
 */
const hasEnd = ref(false);

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
    colicDrops.value = existing.colicDrops === true;
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
  // The day on screen takes precedence over the last remembered moment: it is visibly
  // there, the remembered one is not.
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
  colicDrops.value = false;
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
      // Without an end the sleep counts as running — the normal case when creating.
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

/** Everything the sheet holds, handed to the rule that decides what the type keeps. */
function fields() {
  return entryFields({
    type: type.value,
    amountMl: amountMl.value,
    spatUp: spatUp.value,
    vitaminD: vitaminD.value,
    colicDrops: colicDrops.value,
    diaper: diaper.value,
    hasEnd: hasEnd.value,
    endAt: endAt.value,
    temperatureDc: temperatureDc.value,
    place: place.value,
    weightG: weightG.value,
    lengthMm: lengthMm.value,
    headMm: headMm.value,
    label: label.value,
    note: note.value,
  });
}

async function save() {
  if (!canSave.value) return;

  const existing = props.entry;
  if (existing) {
    // Id, author and week of life stay — only what the sheet holds gets changed.
    await data.update({
      ...existing,
      type: type.value,
      startedAt: at.value.toISOString(),
      ...fields(),
    });
    open.value = false;
    return;
  }

  // Only remember it when something really was backdated.
  lastBackdatedAt =
    Date.now() - at.value.getTime() > BACKDATE_MEMORY_MS ? new Date(at.value) : null;

  const entry = data.draft(type.value, at.value, fields());
  await data.add(entry);
  open.value = false;
  confirmWithUndo(t("add.saved"), entry.id);
}
</script>

<template>
  <SheetDialog v-model:open="open" :title="isEditing ? $t('add.titleEdit') : $t('add.titleNew')">
    <div class="add">
      <div v-if="!isEditing" class="types">
        <div
          v-for="group in TYPE_GROUPS"
          :key="group.titleKey"
          class="types__group"
          role="group"
          :aria-label="$t(group.titleKey)"
        >
          <p class="types__title">{{ $t(group.titleKey) }}</p>
          <div class="types__row" :style="{ '--cols': group.types.length }">
            <button
              v-for="option in group.types"
              :key="option.value"
              type="button"
              class="types__item"
              :class="{ 'types__item--active': type === option.value }"
              @click="type = option.value"
            >
              {{ $t(option.key) }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="type === 'feed'" class="field">
        <span class="field__label">{{ $t("add.amount") }}</span>
        <AmountStepper v-model="amountMl" />
        <FlagToggle
          v-model="spatUp"
          :label="$t('feed.spatUp.label')"
          :hint="$t('feed.spatUp.hint')"
        />
        <FlagToggle
          v-model="vitaminD"
          :label="$t('feed.vitaminD.label')"
          :hint="$t('feed.vitaminD.hint')"
          :locked="vitaminAlreadyThatDay"
          :locked-hint="$t('feed.vitaminD.hintLocked')"
        />
        <FlagToggle
          v-model="colicDrops"
          :label="$t('feed.colicDrops.label')"
          :hint="$t('feed.colicDrops.hint')"
        />
      </div>

      <template v-else-if="type === 'diaper'">
        <div class="field">
          <span class="field__label">{{ $t("add.condition") }}</span>
          <div class="segmented">
            <button
              v-for="option in [
                { value: 'empty', key: 'today.diaperButton.empty' },
                { value: 'wet', key: 'today.diaperButton.wet' },
                { value: 'soiled', key: 'today.diaperButton.soiled' },
              ]"
              :key="option.value"
              type="button"
              class="segmented__item"
              :class="{ 'segmented__item--active': diaper === option.value }"
              @click="diaper = option.value as 'empty' | 'wet' | 'soiled'"
            >
              {{ $t(option.key) }}
            </button>
          </div>
        </div>
      </template>

      <template v-else-if="type === 'growth'">
        <div class="grid">
          <label class="field">
            <span class="field__label">{{ $t("add.weight") }}</span>
            <span class="field__group">
              <input :value="weightG ?? ''" type="number" inputmode="numeric" @input="weightG = num(($event.target as HTMLInputElement).value)" />
              <span class="field__unit">g</span>
            </span>
          </label>
          <CmField v-model="lengthMm" :label="$t('add.length')" />
        </div>
        <CmField v-model="headMm" :label="$t('add.head')" />
      </template>

      <template v-else-if="type === 'illness'">
        <div class="field">
          <span class="field__label">{{ $t("add.whatsWrong") }}</span>
          <div class="chips">
            <button
              v-for="preset in ILLNESS_PRESETS"
              :key="preset"
              type="button"
              class="chip"
              :class="{ 'chip--active': label === $t(preset) }"
              @click="label = $t(preset)"
            >
              {{ $t(preset) }}
            </button>
          </div>
          <input v-model="label" type="text" :placeholder="$t('add.ownEntry')" />
        </div>
        <label class="field">
          <span class="field__label">{{ $t("add.temperature") }}</span>
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
          <span class="field__label">{{ $t("add.kind") }}</span>
          <div class="chips">
            <button
              v-for="kind in ABSENCE_KINDS"
              :key="kind"
              type="button"
              class="chip"
              :class="{ 'chip--active': label === $t(kind) }"
              @click="label = $t(kind)"
            >
              {{ $t(kind) }}
            </button>
          </div>
          <input v-model="label" type="text" :placeholder="$t('add.ownEntry')" />
        </div>

        <div class="field">
          <span class="field__label">{{ $t("add.where") }}</span>
          <!-- So the weather for those days comes from the holiday location instead of home.
               One entry instead of a daily location. -->
          <p v-if="place" class="place__chosen">
            {{ place.placeName }}
            <button type="button" class="place__clear" @click="place = null">{{ $t("add.changePlace") }}</button>
          </p>
          <template v-else>
            <div class="place">
              <input
                v-model="placeQuery"
                type="text"
                :placeholder="$t('add.placePlaceholder')"
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

      <!-- A period may start in the future: a holiday gets recorded beforehand. -->
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
            <span class="ends__label">{{ $t("add.endKnown") }}</span>
            <span class="ends__hint">
              {{ hasEnd ? $t("add.endPickBelow") : $t("add.stillRunning") }}
            </span>
          </span>
        </button>
      </div>

      <div v-if="PERIOD_TYPES.has(type) && hasEnd" class="field">
        <span class="field__label">{{ $t("add.end") }}</span>
        <TimeField v-model="endAt" allow-future />
      </div>

      <label class="field">
        <span class="field__label">
          {{ type === "note" ? $t("entry.note") : $t("common.noteLabel") }}
        </span>
        <textarea v-model="note" rows="2" />
      </label>
    </div>

    <template #actions>
      <button class="save" type="button" :disabled="!canSave" @click="save">
        {{ isEditing ? $t("add.saveEdit") : $t("common.save") }}
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
