<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  calendarDateLabel,
  lifeWeek as calcLifeWeek,
  localDayKey,
  type SupplyCategory,
} from "@babymonitor/shared";
import { useData } from "../stores/data.ts";
import type { LocalEntry } from "../db/local.ts";
import SheetDialog from "../components/SheetDialog.vue";
import TimeField from "../components/TimeField.vue";

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

/** Aktueller Stand je Kategorie = der neueste Eintrag. */
function current(category: SupplyCategory): LocalEntry | undefined {
  return supplies.value.find((e) => e.supplyCategory === category);
}

/** Alle früheren Stände, neueste zuerst. */
function history(category: SupplyCategory): LocalEntry[] {
  return supplies.value.filter((e) => e.supplyCategory === category).slice(1);
}

function since(entry: LocalEntry): string {
  if (!data.child) return "";
  const day = localDayKey(entry.startedAt, data.timezone);
  const week = calcLifeWeek(data.child.birthDate, entry.startedAt, data.timezone);
  return `seit ${calendarDateLabel(day)} · Woche ${week}`;
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
      <div class="card__head">
        <h2 class="card__title">{{ cat.label }}</h2>
        <button class="card__action" type="button" @click="startNew(cat.value)">
          {{ current(cat.value) ? "Gewechselt" : "Eintragen" }}
        </button>
      </div>

      <template v-if="current(cat.value)">
        <button class="current" type="button" @click="startEdit(current(cat.value)!)">
          <span class="current__value">{{ describe(current(cat.value)!) }}</span>
          <span v-if="current(cat.value)!.supplyShop" class="current__shop">
            bei {{ current(cat.value)!.supplyShop }}
          </span>
          <span class="current__since">{{ since(current(cat.value)!) }}</span>
          <span v-if="current(cat.value)!.note" class="current__note">
            {{ current(cat.value)!.note }}
          </span>
        </button>

        <details v-if="history(cat.value).length" class="history">
          <summary>Vorher ({{ history(cat.value).length }})</summary>
          <ul>
            <li v-for="old in history(cat.value)" :key="old.id">
              <button type="button" @click="startEdit(old)">
                <span>{{ describe(old) }}</span>
                <span class="history__since">{{ since(old) }}</span>
              </button>
            </li>
          </ul>
        </details>
      </template>

      <p v-else class="card__empty">
        Noch nichts hinterlegt.<span v-if="cat.hint"> {{ cat.hint }}</span>
      </p>
    </section>

    <SheetDialog
      v-model:open="sheetOpen"
      :title="editing ? 'Eintrag ändern' : `${categoryMeta.label} eintragen`"
    >
      <div class="form">
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

.card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.6rem;
}

.card__title {
  font-size: 1.15rem;
}

.card__action {
  min-height: 2.25rem;
  padding: 0 0.8rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 62.5rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
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
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
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
