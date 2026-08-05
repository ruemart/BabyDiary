<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { lifeWeek as calcLifeWeek, localDayKey, type SupplyCategory } from "@babymonitor/shared";
import { useI18n } from "vue-i18n";
import { useData } from "../stores/data.ts";
import type { LocalEntry } from "../db/local.ts";
import SheetDialog from "../components/SheetDialog.vue";
import TimeField from "../components/TimeField.vue";
import { supplyPeriods, type SupplyPeriod } from "../utils/supplyPeriods.ts";
import { usePhotoUpload } from "../composables/usePhotoUpload.ts";

/**
 * What we buy — to look up at the shop.
 *
 * The NEWEST entry per category is the current one; all older ones are automatically the
 * switch history. That answers "since when size 3?" by itself, without keeping a second
 * record anywhere.
 *
 * For formula that history is the entire point: a brand change should not happen
 * casually, and if something does disagree with her, you want to know what and from when.
 */
const { t } = useI18n();
const data = useData();

const CATEGORIES: { value: SupplyCategory; key: string; hintKey: string; sizeKey: string }[] = [
  {
    value: "formula",
    key: "supply.formula",
    hintKey: "supply.formulaHint",
    sizeKey: "supply.formulaSize",
  },
  { value: "diaper", key: "supply.diapers", hintKey: "", sizeKey: "supply.diaperSize" },
  { value: "other", key: "supply.other", hintKey: "", sizeKey: "supply.otherSize" },
];

const supplies = computed(() =>
  data.byTimeDesc.filter((e) => e.type === "supply" && e.supplyCategory),
);

/**
 * Per category the chain of entries, newest first — with the period each one covers.
 *
 * Computed once rather than per call: otherwise the template asks again for every row,
 * and the current entry is simply the first of the chain.
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

/** All earlier entries, newest first. */
function history(category: SupplyCategory): SupplyPeriod<LocalEntry>[] {
  return periods(category).slice(1);
}

/** "since 17 Jul 2026 · 3 weeks · week 11" — for the current entry. */
function since(period: SupplyPeriod<LocalEntry>): string {
  const parts = [period.rangeLabel, period.durationLabel].filter(Boolean);
  if (data.child) {
    parts.push(t("common.weekN", { n: calcLifeWeek(data.child.birthDate, period.entry.startedAt, data.timezone) }));
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

/* ── Photo of the packaging ───────────────────────────────────────────────── */

/**
 * At the shop a picture says more than "Aptamil Pronutra Pre".
 *
 * Shelves are full of near-identical packs of the same brand differing in a single
 * digit — and that digit is the important one. With a photo of the pack you compare
 * picture with shelf instead of memory with shelf.
 *
 * Uploading is the only path in this app that needs the network. If it fails the entry
 * is saved anyway — without a picture it is still useful.
 */
const { uploadPhoto, busy: photoBusy } = usePhotoUpload();
const mediaId = ref<string | null>(null);
/** Instant preview from the local file, before the server has even answered. */
const localPreview = ref<string | null>(null);

function releasePreview() {
  if (localPreview.value) URL.revokeObjectURL(localPreview.value);
  localPreview.value = null;
}

const previewSrc = computed(() => {
  if (localPreview.value) return localPreview.value;
  return mediaId.value ? `/api/media/${mediaId.value}` : null;
});

async function pickPhoto(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  releasePreview();
  localPreview.value = URL.createObjectURL(file);

  const id = await uploadPhoto(file);
  if (id) mediaId.value = id;
  else releasePreview();
}

function dropPhoto() {
  releasePreview();
  mediaId.value = null;
}

/**
 * The previous entry's photo — offered for reuse, not reused silently.
 *
 * On a stage change the pack looks almost the same, only one digit differs. That digit
 * is the important one. Carried over automatically you would eventually have a photo
 * showing the wrong number — which would be worse than none. One tap is the right price
 * for "yes, the same pack".
 */
const previousMediaId = computed(() =>
  editing.value ? null : (current(category.value)?.mediaId ?? null),
);

function reusePreviousPhoto() {
  releasePreview();
  mediaId.value = previousMediaId.value;
}

/**
 * Enlarged view. Always holds a COMPLETE image source, never half a media id — otherwise
 * every call site has to know whether a path still belongs in front of it.
 */
const zoomed = ref<string | null>(null);

const categoryMeta = computed(
  () => CATEGORIES.find((c) => c.value === category.value) ?? CATEGORIES[0]!,
);

watch(sheetOpen, (open) => {
  if (!open) {
    // The preview URL points at a blob in memory. Without releasing it, it stays
    // there until the page is reloaded.
    if (zoomed.value === localPreview.value) zoomed.value = null;
    releasePreview();
    return;
  }
  const existing = editing.value;
  if (existing) {
    category.value = existing.supplyCategory ?? "formula";
    product.value = existing.label ?? "";
    size.value = existing.supplySize ?? "";
    shop.value = existing.supplyShop ?? "";
    note.value = existing.note ?? "";
    at.value = new Date(existing.startedAt);
    releasePreview();
    mediaId.value = existing.mediaId;
    return;
  }
  // On a switch, prefill with the previous one — usually only the size changes.
  const previous = current(category.value);
  product.value = previous?.label ?? "";
  size.value = previous?.supplySize ?? "";
  shop.value = previous?.supplyShop ?? "";
  note.value = "";
  at.value = new Date();
  releasePreview();
  // The photo is NOT carried over from the previous entry: a switch is usually exactly
  // the other pack, and a wrong photo is worse than none.
  mediaId.value = null;
});

function startNew(next: SupplyCategory) {
  editing.value = null;
  category.value = next;
  sheetOpen.value = true;
}

/**
 * Turn a correction into a switch after all.
 *
 * The way out for someone who took the wrong path: the values typed in stay, only the
 * existing entry is left alone and a new one is created. Without this button you would
 * have to close the sheet and type everything again.
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
    mediaId: mediaId.value,
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
      <h1>{{ $t("supply.title") }}</h1>
      <p class="head__sub">{{ $t("supply.lead") }}</p>
    </header>

    <section v-for="cat in CATEGORIES" :key="cat.value" class="card">
      <h2 class="card__title">{{ $t(cat.key) }}</h2>

      <template v-if="periods(cat.value).length">
        <!-- The current entry is display only. Tapping it used to OVERWRITE the entry —
             the most obvious grab was precisely the one that destroys the history.
             Both paths are now named underneath. -->
        <div class="current">
          <!-- The picture sits next to the details, not under them: at the shop you look at
               it first and only read the name to confirm. -->
          <button
            v-if="periods(cat.value)[0]!.entry.mediaId"
            class="thumb"
            type="button"
            :aria-label="`Foto der Verpackung vergrößern: ${describe(periods(cat.value)[0]!.entry)}`"
            @click="zoomed = `/api/media/${periods(cat.value)[0]!.entry.mediaId}`"
          >
            <img :src="`/api/media/${periods(cat.value)[0]!.entry.mediaId}`" alt="" />
          </button>

          <div class="current__text">
            <span class="current__value">{{ describe(periods(cat.value)[0]!.entry) }}</span>
            <span v-if="periods(cat.value)[0]!.entry.supplyShop" class="current__shop">
              bei {{ periods(cat.value)[0]!.entry.supplyShop }}
            </span>
            <span class="current__since">{{ since(periods(cat.value)[0]!) }}</span>
            <span v-if="periods(cat.value)[0]!.entry.note" class="current__note">
              {{ periods(cat.value)[0]!.entry.note }}
            </span>
          </div>
        </div>

        <div class="deeds">
          <button class="deeds__main" type="button" @click="startNew(cat.value)">
            {{ $t("supply.changed") }}
          </button>
          <button class="deeds__minor" type="button" @click="startEdit(current(cat.value)!)">
            {{ $t("supply.correct") }}
          </button>
        </div>

        <!-- Collapsed: what is being bought right now is the question at the shop. The
             history is needed rarely — but then precisely. -->
        <details v-if="history(cat.value).length" class="history">
          <summary>{{ $t("supply.earlier", { n: history(cat.value).length }) }}</summary>
          <ul>
            <li v-for="old in history(cat.value)" :key="old.entry.id">
              <button type="button" @click="startEdit(old.entry)">
                <img
                  v-if="old.entry.mediaId"
                  class="history__thumb"
                  :src="`/api/media/${old.entry.mediaId}`"
                  alt=""
                />
                <span class="history__text">
                  <span class="history__value">{{ describe(old.entry) }}</span>
                  <span class="history__since">{{ [old.rangeLabel, old.durationLabel].filter(Boolean).join(" · ") }}</span>
                </span>
              </button>
            </li>
          </ul>
        </details>
      </template>

      <template v-else>
        <p class="card__empty">
          {{ $t("supply.nothingYet") }}<span v-if="cat.hintKey"> {{ $t(cat.hintKey) }}</span>
        </p>
        <div class="deeds">
          <button class="deeds__main" type="button" @click="startNew(cat.value)">
            {{ $t("supply.record") }}
          </button>
        </div>
      </template>
    </section>

    <SheetDialog
      v-model:open="sheetOpen"
      :title="editing ? $t('supply.titleEdit') : $t('supply.titleNew', { category: $t(categoryMeta.key) })"
    >
      <div class="form">
        <!-- Says before you type what the button will do at the end. Exactly this
             distinction was lost before. -->
        <p class="explain">
          <template v-if="editing">
            {{ $t("supply.explainEdit") }}
          </template>
          <template v-else>
            {{ $t("supply.explainNew") }}
          </template>
        </p>

        <button v-if="editing" class="convert" type="button" @click="convertToChange">
          {{ $t("supply.convert") }}
        </button>

        <div v-if="!editing" class="field">
          <span class="field__label">{{ $t("supply.category") }}</span>
          <div class="segmented">
            <button
              v-for="cat in CATEGORIES"
              :key="cat.value"
              type="button"
              class="segmented__item"
              :class="{ 'segmented__item--active': category === cat.value }"
              @click="category = cat.value"
            >
              {{ $t(cat.key) }}
            </button>
          </div>
        </div>

        <label class="field">
          <span class="field__label">{{ $t("supply.product") }}</span>
          <input v-model="product" type="text" placeholder="z. B. Aptamil Pronutra" />
        </label>

        <label class="field">
          <span class="field__label">{{ $t(categoryMeta.sizeKey) }}</span>
          <input v-model="size" type="text" placeholder="z. B. Größe 3" />
        </label>

        <div class="field">
          <span class="field__label">{{ $t("supply.photo") }}</span>
          <div class="photo">
            <button
              v-if="previewSrc"
              class="photo__preview"
              type="button"
              :aria-label="$t('supply.photoZoom')"
              @click="zoomed = previewSrc"
            >
              <img :src="previewSrc" alt="" />
            </button>

            <div class="photo__deeds">
              <!-- Without `capture`: this also allows picking an image from the gallery, for
                   instance the one from the last shopping trip. -->
              <label class="photo__pick">
                <input type="file" accept="image/*" @change="pickPhoto" />
                <span>{{ photoBusy ? $t("supply.photoUploading") : previewSrc ? $t("supply.photoOther") : $t("supply.photoTake") }}</span>
              </label>
              <button
                v-if="!previewSrc && previousMediaId"
                class="photo__reuse"
                type="button"
                @click="reusePreviousPhoto"
              >
                {{ $t("supply.photoReuse") }}
              </button>
              <button v-if="previewSrc" class="photo__drop" type="button" @click="dropPhoto">
                {{ $t("supply.photoRemove") }}
              </button>
            </div>
          </div>
          <p class="field__hint">{{ $t("supply.photoHint") }}</p>
        </div>

        <label class="field">
          <span class="field__label">{{ $t("supply.shop") }}</span>
          <input v-model="shop" type="text" :placeholder="$t('supply.shopPlaceholder')" />
        </label>

        <div class="field">
          <span class="field__label">{{ $t("supply.since") }}</span>
          <TimeField v-model="at" />
        </div>

        <label class="field">
          <span class="field__label">{{ $t("common.noteLabel") }}</span>
          <textarea v-model="note" rows="2" :placeholder="$t('supply.notePlaceholder')" />
        </label>
      </div>

      <template #actions>
        <div class="actions">
          <button class="save" type="button" :disabled="!canSave" @click="save">
            {{ $t("common.save") }}
          </button>
          <button v-if="editing" class="remove" type="button" @click="remove">{{ $t("common.delete") }}</button>
        </div>
      </template>
    </SheetDialog>

    <!-- Enlarged view. A 3 rem image does not answer the question at the shelf. -->
    <div v-if="zoomed" class="zoom" role="dialog" :aria-label="$t('supply.photoDialog')" @click="zoomed = null">
      <img :src="zoomed" :alt="$t('supply.photoAlt')" />
      <button class="zoom__close" type="button" :aria-label="$t('common.close')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
        </svg>
      </button>
    </div>
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
  align-items: flex-start;
  gap: 0.85rem;
}

.current__text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

/* ── Photo of the packaging ──────────────────────────────────────────────── */

.thumb {
  position: relative;
  flex: none;
  width: 4.5rem;
  height: 4.5rem;
  padding: 0;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface-sunk);
  overflow: hidden;
  cursor: pointer;
}

.thumb img {
  /* Stretched absolutely instead of by percentage: a percentage height can be
     indefinite and then falls back to the image's own height — see WeekRibbon.vue. */
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.history__thumb {
  flex: none;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.5rem;
  object-fit: cover;
  border: 1px solid var(--bm-hairline);
}

.photo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.photo__preview {
  position: relative;
  flex: none;
  width: 4.5rem;
  height: 4.5rem;
  padding: 0;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface-sunk);
  overflow: hidden;
  cursor: pointer;
}

.photo__preview img {
  /* Stretched absolutely instead of by percentage: a percentage height can be
     indefinite and then falls back to the image's own height — see WeekRibbon.vue. */
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.photo__deeds {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.photo__pick {
  display: inline-flex;
  align-items: center;
  min-height: 2.5rem;
  padding: 0 0.9rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 62.5rem;
  background: var(--bm-surface-sunk);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.photo__pick input {
  display: none;
}

.photo__reuse {
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

.photo__drop {
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

.field__hint {
  margin: 0;
  color: var(--bm-ink-soft);
  font-size: 0.8125rem;
  line-height: 1.4;
}

.zoom {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(20 16 18 / 88%);
}

.zoom img {
  max-width: 100%;
  max-height: 100%;
  border-radius: 0.75rem;
}

.zoom__close {
  position: absolute;
  top: 1rem;
  inset-inline-end: 1rem;
  width: 2.75rem;
  height: 2.75rem;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 50%;
  background: rgb(255 255 255 / 15%);
  color: #fff;
  cursor: pointer;
}

.zoom__close svg {
  width: 1.25rem;
  height: 1.25rem;
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

/* Switching is the action it almost always is — so it gets the surface area.
   Correcting stays reachable but steps back. */
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
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.history__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
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
