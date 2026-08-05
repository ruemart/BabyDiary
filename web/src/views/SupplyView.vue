<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { lifeWeek as calcLifeWeek, localDayKey, type SupplyCategory } from "@babymonitor/shared";
import { useData } from "../stores/data.ts";
import type { LocalEntry } from "../db/local.ts";
import SheetDialog from "../components/SheetDialog.vue";
import TimeField from "../components/TimeField.vue";
import { supplyPeriods, type SupplyPeriod } from "../utils/supplyPeriods.ts";

/**
 * Was wir kaufen — zum Nachschlagen im Laden.
 *
 * Der jeweils NEUESTE Eintrag je Kategorie ist der aktuelle Stand, alle älteren sind
 * automatisch die Wechsel-Historie. Dadurch beantwortet sich "seit wann Größe 3?"
 * von selbst, ohne dass irgendwo zusätzlich Buch geführt werden müsste.
 *
 * Bei Milchnahrung ist genau dieser Verlauf der Punkt: Ein Markenwechsel soll nicht
 * beiläufig passieren, und wenn doch etwas nicht bekommt, will man wissen, was und
 * ab wann.
 */
const data = useData();

const CATEGORIES: { value: SupplyCategory; label: string; hint: string; sizeLabel: string }[] = [
  {
    value: "formula",
    label: "Milchnahrung",
    hint: "Marke möglichst nicht ohne Grund wechseln.",
    sizeLabel: "Stufe (Pre, 1, 2 …)",
  },
  { value: "diaper", label: "Windeln", hint: "", sizeLabel: "Größe" },
  { value: "other", label: "Sonstiges", hint: "", sizeLabel: "Größe oder Menge" },
];

const supplies = computed(() =>
  data.byTimeDesc.filter((e) => e.type === "supply" && e.supplyCategory),
);

/**
 * Je Kategorie die Kette der Stände, neueste zuerst — mit Geltungszeitraum.
 *
 * Einmal berechnet statt pro Aufruf: Die Vorlage fragt sonst für jede Zeile erneut,
 * und der aktuelle Stand ist schlicht der erste Eintrag der Kette.
 */
const byCategory = computed(() => {
  const today = localDayKey(new Date(), data.timezone);
  const key = (iso: string) => localDayKey(iso, data.timezone);
  const map = new Map<SupplyCategory, SupplyPeriod<LocalEntry>[]>();
  for (const cat of CATEGORIES) {
    const entries = supplies.value.filter((e) => e.supplyCategory === cat.value);
    map.set(cat.value, supplyPeriods(entries, key, today));
  }
  return map;
});

function periods(category: SupplyCategory): SupplyPeriod<LocalEntry>[] {
  return byCategory.value.get(category) ?? [];
}

function current(category: SupplyCategory): LocalEntry | undefined {
  return periods(category)[0]?.entry;
}

/** Alle früheren Stände, neueste zuerst. */
function history(category: SupplyCategory): SupplyPeriod<LocalEntry>[] {
  return periods(category).slice(1);
}

/** „seit 17. Jul 2026 · 3 Wochen · Woche 11" — beim laufenden Stand. */
function since(period: SupplyPeriod<LocalEntry>): string {
  const parts = [period.rangeLabel, period.durationLabel].filter(Boolean);
  if (data.child) {
    parts.push(`Woche ${calcLifeWeek(data.child.birthDate, period.entry.startedAt, data.timezone)}`);
  }
  return parts.join(" · ");
}

function describe(entry: LocalEntry): string {
  return [entry.label, entry.supplySize].filter(Boolean).join(" · ");
}

/* ── Bearbeiten ───────────────────────────────────────────────────────────── */

const sheetOpen = ref(false);
const editing = ref<LocalEntry | null>(null);
const category = ref<SupplyCategory>("formula");
const product = ref("");
const size = ref("");
const shop = ref("");
const note = ref("");
const at = ref(new Date());

const categoryMeta = computed(
  () => CATEGORIES.find((c) => c.value === category.value) ?? CATEGORIES[0]!,
);

watch(sheetOpen, (open) => {
  if (!open) return;
  const existing = editing.value;
  if (existing) {
    category.value = existing.supplyCategory ?? "formula";
    product.value = existing.label ?? "";
    size.value = existing.supplySize ?? "";
    shop.value = existing.supplyShop ?? "";
    note.value = existing.note ?? "";
    at.value = new Date(existing.startedAt);
    return;
  }
  // Bei einem Wechsel das Bisherige vorbelegen — meist ändert sich nur die Größe.
  const previous = current(category.value);
  product.value = previous?.label ?? "";
  size.value = previous?.supplySize ?? "";
  shop.value = previous?.supplyShop ?? "";
  note.value = "";
  at.value = new Date();
});

function startNew(next: SupplyCategory) {
  editing.value = null;
  category.value = next;
  sheetOpen.value = true;
}

/**
 * Aus einer Korrektur doch einen Wechsel machen.
 *
 * Der Ausweg für den Fall, dass jemand den falschen Weg erwischt hat: Die eingegebenen
 * Werte bleiben stehen, nur der bestehende Eintrag wird in Ruhe gelassen und ein neuer
 * angelegt. Ohne diesen Knopf müsste man das Blatt schließen und alles neu tippen.
 */
function convertToChange() {
  editing.value = null;
  at.value = new Date();
}

function startEdit(entry: LocalEntry) {
  editing.value = entry;
  sheetOpen.value = true;
}

const canSave = computed(() => !!product.value.trim() || !!size.value.trim());

async function save() {
  if (!canSave.value) return;
  const fields = {
    supplyCategory: category.value,
    supplySize: size.value.trim() || null,
    supplyShop: shop.value.trim() || null,
    label: product.value.trim() || null,
    note: note.value.trim() || null,
  };

  if (editing.value) {
    await data.update({ ...editing.value, startedAt: at.value.toISOString(), ...fields });
  } else {
    await data.add(data.draft("supply", at.value, fields));
  }
  sheetOpen.value = false;
}

async function remove() {
  if (editing.value) await data.remove(editing.value.id);
  sheetOpen.value = false;
}
</script>

<template>
  <div class="supply">
    <header class="head">
      <h1>Was wir kaufen</h1>
      <p class="head__sub">Damit man es im Laden nicht aus dem Kopf können muss.</p>
    </header>

    <section v-for="cat in CATEGORIES" :key="cat.value" class="card">
      <h2 class="card__title">{{ cat.label }}</h2>

      <template v-if="periods(cat.value).length">
        <!-- Der aktuelle Stand ist reine Anzeige. Ihn anzutippen hat früher den
             Eintrag ÜBERSCHRIEBEN — der naheliegendste Griff war ausgerechnet der,
             der die Historie zerstört. Beide Wege stehen jetzt benannt darunter. -->
        <div class="current">
          <span class="current__value">{{ describe(periods(cat.value)[0]!.entry) }}</span>
          <span v-if="periods(cat.value)[0]!.entry.supplyShop" class="current__shop">
            bei {{ periods(cat.value)[0]!.entry.supplyShop }}
          </span>
          <span class="current__since">{{ since(periods(cat.value)[0]!) }}</span>
          <span v-if="periods(cat.value)[0]!.entry.note" class="current__note">
            {{ periods(cat.value)[0]!.entry.note }}
          </span>
        </div>

        <div class="deeds">
          <button class="deeds__main" type="button" @click="startNew(cat.value)">
            Gewechselt
          </button>
          <button class="deeds__minor" type="button" @click="startEdit(current(cat.value)!)">
            Angaben korrigieren
          </button>
        </div>

        <!-- Zugeklappt: Was gerade gekauft wird, ist die Frage im Laden. Die Historie
             braucht man selten — aber dann genau. -->
        <details v-if="history(cat.value).length" class="history">
          <summary>Frühere Stände ({{ history(cat.value).length }})</summary>
          <ul>
            <li v-for="old in history(cat.value)" :key="old.entry.id">
              <button type="button" @click="startEdit(old.entry)">
                <span class="history__value">{{ describe(old.entry) }}</span>
                <span class="history__since">{{ [old.rangeLabel, old.durationLabel].filter(Boolean).join(" · ") }}</span>
              </button>
            </li>
          </ul>
        </details>
      </template>

      <template v-else>
        <p class="card__empty">
          Noch nichts hinterlegt.<span v-if="cat.hint"> {{ cat.hint }}</span>
        </p>
        <div class="deeds">
          <button class="deeds__main" type="button" @click="startNew(cat.value)">
            Eintragen
          </button>
        </div>
      </template>
    </section>

    <SheetDialog
      v-model:open="sheetOpen"
      :title="editing ? 'Eintrag ändern' : `${categoryMeta.label} eintragen`"
    >
      <div class="form">
        <!-- Sagt vor dem Tippen, was der Knopf am Ende tut. Genau diese Unterscheidung
             ist vorher untergegangen. -->
        <p class="explain">
          <template v-if="editing">
            Korrigiert nur diesen Eintrag — für einen echten Wechsel gehört ein neuer
            Stand angelegt, sonst geht der bisherige verloren.
          </template>
          <template v-else>
            Wird als neuer Stand gespeichert. Der bisherige bleibt als Historie erhalten.
          </template>
        </p>

        <button v-if="editing" class="convert" type="button" @click="convertToChange">
          Doch ein Wechsel? Als neuen Stand anlegen
        </button>

        <div v-if="!editing" class="field">
          <span class="field__label">Kategorie</span>
          <div class="segmented">
            <button
              v-for="cat in CATEGORIES"
              :key="cat.value"
              type="button"
              class="segmented__item"
              :class="{ 'segmented__item--active': category === cat.value }"
              @click="category = cat.value"
            >
              {{ cat.label }}
            </button>
          </div>
        </div>

        <label class="field">
          <span class="field__label">Marke oder Produkt</span>
          <input v-model="product" type="text" placeholder="z. B. Aptamil Pronutra" />
        </label>

        <label class="field">
          <span class="field__label">{{ categoryMeta.sizeLabel }}</span>
          <input v-model="size" type="text" placeholder="z. B. Größe 3" />
        </label>

        <label class="field">
          <span class="field__label">Wo gekauft</span>
          <input v-model="shop" type="text" placeholder="z. B. dm, Rossmann, Apotheke" />
        </label>

        <div class="field">
          <span class="field__label">Seit wann</span>
          <TimeField v-model="at" />
        </div>

        <label class="field">
          <span class="field__label">Notiz (optional)</span>
          <textarea v-model="note" rows="2" placeholder="z. B. verträgt sie gut" />
        </label>
      </div>

      <template #actions>
        <div class="actions">
          <button class="save" type="button" :disabled="!canSave" @click="save">
            Speichern
          </button>
          <button v-if="editing" class="remove" type="button" @click="remove">Löschen</button>
        </div>
      </template>
    </SheetDialog>
  </div>
</template>

<style scoped>
.supply {
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
}

.card {
  background: var(--bm-surface);
  border-radius: 1.5rem;
  padding: 1.1rem 1.25rem 1.25rem;
  box-shadow: var(--bm-shadow-card);
}

.card__title {
  font-size: 1.15rem;
  margin-bottom: 0.6rem;
}

.card__empty {
  margin: 0;
  color: var(--bm-ink-soft);
  font-size: 0.9rem;
  line-height: 1.45;
}

.current {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.current__value {
  font-family: var(--bm-font-display);
  font-size: 1.3rem;
  font-weight: 600;
}

.current__shop,
.current__since {
  font-size: 0.85rem;
  color: var(--bm-ink-soft);
}

.current__note {
  margin-top: 0.25rem;
  font-size: 0.85rem;
  color: var(--bm-ink-soft);
}

/* Der Wechsel ist die Handlung, die es fast immer ist — also bekommt er die Fläche.
   Das Korrigieren bleibt erreichbar, tritt aber zurück. */
.deeds {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.9rem;
}

.deeds__main {
  min-height: 2.75rem;
  padding: 0 1.1rem;
  border: none;
  border-radius: 62.5rem;
  background: var(--bm-feed);
  color: #2a2028;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.deeds__minor {
  border: none;
  background: none;
  padding: 0;
  color: var(--bm-ink-soft);
  font: inherit;
  font-size: 0.85rem;
  text-decoration: underline;
  text-underline-offset: 0.2em;
  cursor: pointer;
}

.explain {
  margin: 0;
  padding: 0.7rem 0.85rem;
  border-radius: 0.875rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink-soft);
  font-size: 0.85rem;
  line-height: 1.45;
}

.convert {
  min-height: 2.5rem;
  padding: 0 0.9rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 62.5rem;
  background: var(--bm-surface);
  color: var(--bm-ink);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.history__value {
  font-weight: 600;
}

.history {
  margin-top: 0.875rem;
  border-top: 1px solid var(--bm-hairline);
  padding-top: 0.6rem;
}

.history summary {
  font-size: 0.85rem;
  color: var(--bm-ink-soft);
  cursor: pointer;
}

.history ul {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.history button {
  display: flex;
  flex-direction: column;
  width: 100%;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.history__since {
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
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

.segmented {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.4rem;
}

.segmented__item {
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

.segmented__item--active {
  background: var(--bm-growth);
  border-color: transparent;
  color: #fff;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
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

.remove {
  width: 100%;
  min-height: 2.75rem;
  border: 1px solid color-mix(in srgb, var(--bm-photo) 50%, transparent);
  border-radius: 1.125rem;
  background: transparent;
  color: var(--bm-photo);
  font: inherit;
  cursor: pointer;
}
</style>
