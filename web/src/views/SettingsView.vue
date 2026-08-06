<script setup lang="ts">
import { computed, ref } from "vue";
import { useToast } from "sit-onyx";
import type { Child } from "@milo/shared";
import { useData } from "../stores/data.ts";
import { appearance, setAppearance, type AppearanceSetting } from "../composables/useAppearance.ts";
import { confirmations, setConfirmations } from "../composables/useConfirmations.ts";
import { wipeLocal } from "../db/local.ts";
import ChildForm from "../components/ChildForm.vue";
import { onMounted } from "vue";
import { usePushNotifications } from "../composables/usePushNotifications.ts";
import { useI18n } from "vue-i18n";
import { LOCALES, setLocale } from "../i18n/index.ts";
import { REGIONS, regionByCode } from "../data/regions/index.ts";


const { t, locale } = useI18n();
const data = useData();
const toast = useToast();

const form = ref<Partial<Child>>({ ...(data.child ?? {}) });
const saving = ref(false);
const exporting = ref(false);

const APPEARANCES: { value: AppearanceSetting; key: string; hintKey: string }[] = [
  { value: "auto", key: "settings.appearanceAuto", hintKey: "settings.appearanceAutoHint" },
  { value: "day", key: "settings.appearanceLight", hintKey: "" },
  { value: "night", key: "settings.appearanceDark", hintKey: "" },
];

const photoCount = computed(() => data.photosByWeek.size);

const activeRegion = computed(() => regionByCode(form.value.region));

/* ── Benachrichtigungen ───────────────────────────────────────────────────── */

const push = usePushNotifications();
onMounted(() => void push.refresh());

const LEAD_OPTIONS = [0, 5, 10, 15, 30];

async function enablePush() {
  const error = await push.enable();
  if (error) {
    toast.show({ headline: t("settings.push.failed"), description: error, color: "warning", duration: 9000 });
    return;
  }
  if (push.state.value === "on") {
    toast.show({ headline: t("settings.push.enabled"), color: "success" });
  }
}

async function testPush() {
  const ok = await push.sendTest();
  toast.show({
    headline: ok ? t("settings.push.testSent") : t("settings.push.testFailed"),
    description: ok ? t("settings.push.testSentHint") : t("settings.push.testFailedHint"),
    color: ok ? "success" : "warning",
  });
}

async function setLead(minutes: number) {
  await push.saveSettings({ ...push.settings.value, leadMinutes: minutes });
}

async function toggleNight() {
  const quiet = push.settings.value.quietFromHour === null;
  await push.saveSettings({
    ...push.settings.value,
    quietFromHour: quiet ? 22 : null,
    quietToHour: quiet ? 6 : null,
  });
}

const childRejected = computed(() => data.invalidEntries.find((i) => i.id === "child"));

/* ── Location for the weather ─────────────────────────────────────────────── */

type Place = { name: string; latitude: number; longitude: number; admin?: string };

const placeQuery = ref("");
const placeResults = ref<Place[]>([]);
const searching = ref(false);

async function searchPlace() {
  const q = placeQuery.value.trim();
  if (q.length < 2) return;
  searching.value = true;
  try {
    const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`, {
      credentials: "same-origin",
      signal: AbortSignal.timeout(10_000),
    });
    placeResults.value = res.ok ? await res.json() : [];
  } catch {
    placeResults.value = [];
  } finally {
    searching.value = false;
  }
}

async function choosePlace(place: Place) {
  if (!data.child) return;
  await data.saveChild({
    ...data.child,
    latitude: place.latitude,
    longitude: place.longitude,
    placeName: place.admin ? `${place.name} (${place.admin})` : place.name,
    editedAt: new Date().toISOString(),
  });
  placeResults.value = [];
  placeQuery.value = "";
  toast.show({ headline: t("settings.placeSet", { name: place.name }), color: "success" });
}

async function save() {
  if (!data.child || !form.value.name?.trim() || !form.value.birthDate) return;
  saving.value = true;
  await data.saveChild({
    ...data.child,
    name: form.value.name.trim(),
    sex: form.value.sex ?? data.child.sex,
    birthDate: form.value.birthDate,
    dueDate: form.value.dueDate || null,
    birthWeightG: form.value.birthWeightG ?? null,
    birthLengthMm: form.value.birthLengthMm ?? null,
    birthHeadMm: form.value.birthHeadMm ?? null,
    timezone: form.value.timezone ?? data.child.timezone,
    editedAt: new Date().toISOString(),
  });
  saving.value = false;
  // The warning only disappears once the server accepts the new values.
  await data.pushNow();
  toast.show({ headline: t("settings.saved"), color: "success" });
}

async function downloadTimelapse() {
  exporting.value = true;
  try {
    const response = await fetch("/api/photos/timelapse", { credentials: "same-origin" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      toast.show({
        headline: t("settings.timelapseFailed"),
        description:
          body.error === "not_enough_photos"
            ? t("settings.timelapseTooFew")
            : t("settings.timelapseServer"),
        color: "warning",
        duration: 8000,
      });
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${data.child?.name ?? "baby"}-zeitraffer.mp4`;
    link.click();
    URL.revokeObjectURL(url);
  } finally {
    exporting.value = false;
  }
}

async function signOut() {
  // Reset this device only. The data on the server stays untouched — the other phone
  // and all entries are unaffected.
  await wipeLocal();
  document.cookie = "bm_session=; Max-Age=0; path=/";
  location.href = "/start";
}
</script>

<template>
  <div class="settings">
    <h1 class="settings__title">{{ $t("settings.title") }}</h1>

    <!-- The child's details are rejected by the server. The note belongs exactly here,
         where they can also be corrected — not in a general error list. -->
    <div v-if="childRejected" class="warning" role="alert">
      <p class="warning__title">{{ $t("settings.childRejected.title") }}</p>
      <p class="warning__text">
        {{ $t("settings.childRejected.text") }}
      </p>
      <p class="warning__reason">{{ childRejected.reason }}</p>
    </div>

    <section class="card">
      <h2 class="card__title">{{ $t("settings.child") }}</h2>
      <ChildForm v-model="form" />
      <button class="primary" type="button" :disabled="saving" @click="save">
        {{ saving ? $t("settings.saving") : $t("settings.saveChanges") }}
      </button>
    </section>

    <!-- Country: decides which check-ups and vaccinations the timeline shows. -->
    <section class="card">
      <h2 class="card__title">{{ $t("region.label") }}</h2>
      <p class="card__lead">{{ $t("region.lead") }}</p>
      <div class="options">
        <button
          v-for="r in REGIONS"
          :key="r.code"
          type="button"
          class="option"
          :class="{ 'option--active': form.region === r.code }"
          @click="form.region = r.code"
        >
          <span class="option__label">{{ r.name }}</span>
        </button>
      </div>
      <!-- The note sits WHERE the choice is made, not in the documentation: only Germany
           has been checked against the official source. -->
      <p v-if="!activeRegion.verified && activeRegion.code !== 'none'" class="card__note">
        {{ $t("region.unverified") }}
      </p>
      <p v-else-if="activeRegion.code === 'none'" class="card__note">
        {{ $t("region.noneHint") }}
      </p>
      <p v-if="activeRegion.sources.vaccinations" class="card__note">
        {{ $t("region.source", { source: activeRegion.sources.vaccinations }) }}
      </p>
    </section>

    <!-- Language before appearance: someone looking at the app in a foreign language
         searches for this first — and finds the rest only once it is right. -->
    <section class="card">
      <h2 class="card__title">{{ $t("settings.language") }}</h2>
      <p class="card__lead">{{ $t("settings.languageLead") }}</p>
      <div class="options">
        <button
          v-for="option in LOCALES"
          :key="option.code"
          type="button"
          class="option"
          :class="{ 'option--active': locale === option.code }"
          @click="setLocale(option.code)"
        >
          <!-- The name of each language is written IN that language. "Deutsch" is recognised
               even by someone currently looking at the app in English. -->
          <span class="option__label">{{ option.label }}</span>
        </button>
      </div>
    </section>

    <section class="card">
      <h2 class="card__title">{{ $t("settings.appearance") }}</h2>
      <p class="card__lead">
        {{ $t("settings.appearanceLead") }}
      </p>
      <div class="options">
        <button
          v-for="option in APPEARANCES"
          :key="option.value"
          type="button"
          class="option"
          :class="{ 'option--active': appearance === option.value }"
          @click="setAppearance(option.value)"
        >
          <span class="option__label">{{ $t(option.key) }}</span>
          <span v-if="option.hintKey" class="option__hint">{{ $t(option.hintKey) }}</span>
        </button>
      </div>
    </section>

    <section class="card">
      <h2 class="card__title">{{ $t("settings.confirmations") }}</h2>
      <p class="card__lead">{{ $t("settings.confirmationsLead") }}</p>
      <div class="options">
        <button
          type="button"
          class="option"
          :class="{ 'option--active': confirmations }"
          @click="setConfirmations(true)"
        >
          <span class="option__label">{{ $t("settings.confirmationsOn") }}</span>
          <span class="option__hint">{{ $t("settings.confirmationsOnHint") }}</span>
        </button>
        <button
          type="button"
          class="option"
          :class="{ 'option--active': !confirmations }"
          @click="setConfirmations(false)"
        >
          <span class="option__label">{{ $t("settings.confirmationsOff") }}</span>
          <span class="option__hint">{{ $t("settings.confirmationsOffHint") }}</span>
        </button>
      </div>
    </section>

    <section v-if="push.state.value !== 'unsupported'" class="card">
      <h2 class="card__title">{{ $t("settings.push.title") }}</h2>

      <p v-if="push.state.value === 'needs-install'" class="card__lead">
        {{ $t("settings.push.needsInstall") }}
      </p>

      <p v-else-if="push.state.value === 'server-disabled'" class="card__lead">
        {{ $t("settings.push.serverDisabled") }}
      </p>

      <p v-else-if="push.state.value === 'denied'" class="card__lead">
        {{ $t("settings.push.denied") }}
      </p>

      <template v-else>
        <p class="card__lead">
          {{ $t("settings.push.lead", { name: data.child?.name ?? $t("settings.push.hers") }) }}
        </p>

        <button
          v-if="push.state.value === 'off'"
          class="primary"
          type="button"
          :disabled="push.busy.value"
          @click="enablePush"
        >
          {{ push.busy.value ? $t("settings.push.busy") : $t("settings.push.enable") }}
        </button>

        <template v-else>
          <div class="field">
            <span class="field__label">{{ $t("settings.push.leadTime") }}</span>
            <div class="leads">
              <button
                v-for="minutes in LEAD_OPTIONS"
                :key="minutes"
                type="button"
                class="lead"
                :class="{ 'lead--active': push.settings.value.leadMinutes === minutes }"
                @click="setLead(minutes)"
              >
                {{ minutes === 0 ? $t("settings.push.onTime") : $t("settings.push.minutes", { n: minutes }) }}
              </button>
            </div>
          </div>

          <button
            type="button"
            class="option"
            :class="{ 'option--active': push.settings.value.quietFromHour === null }"
            @click="toggleNight"
          >
            <span class="option__label">
              {{ push.settings.value.quietFromHour === null ? $t("settings.push.alsoAtNight") : $t("settings.push.quietAtNight") }}
            </span>
            <span class="option__hint">
              {{
                push.settings.value.quietFromHour === null
                  ? $t("settings.push.alsoAtNightHint")
                  : $t("settings.push.quietAtNightHint")
              }}
            </span>
          </button>

          <div class="push-actions">
            <button class="secondary" type="button" @click="testPush">{{ $t("settings.push.test") }}</button>
            <button class="danger" type="button" :disabled="push.busy.value" @click="push.disable">
              {{ $t("settings.push.off") }}
            </button>
          </div>
        </template>

        <p class="card__note">
          {{ $t("settings.push.note") }}
        </p>
      </template>
    </section>

    <section class="card">
      <h2 class="card__title">{{ $t("settings.weather") }}</h2>
      <p class="card__lead">
        {{ $t("settings.weatherLead") }}
      </p>
      <p v-if="data.child?.placeName" class="card__lead">
        {{ $t("settings.weatherCurrent", { place: data.child.placeName }) }}
      </p>
      <div class="place">
        <input
          v-model="placeQuery"
          type="text"
          :placeholder="$t('settings.placePlaceholder')"
          @keyup.enter="searchPlace"
        />
        <button class="secondary" type="button" :disabled="searching" @click="searchPlace">
          {{ searching ? $t("settings.searching") : $t("settings.search") }}
        </button>
      </div>
      <ul v-if="placeResults.length" class="place__results">
        <li v-for="place in placeResults" :key="`${place.latitude},${place.longitude}`">
          <button type="button" @click="choosePlace(place)">
            {{ place.name }}<span v-if="place.admin">, {{ place.admin }}</span>
          </button>
        </li>
      </ul>
    </section>

    <section class="card">
      <h2 class="card__title">{{ $t("settings.photos") }}</h2>
      <p class="card__lead">
        {{ $t("settings.photosLead", { n: photoCount }, photoCount) }} {{ $t("settings.photosLead2") }}
      </p>
      <button class="secondary" type="button" :disabled="exporting || photoCount < 2" @click="downloadTimelapse">
        {{ exporting ? $t("settings.timelapseBusy") : $t("settings.timelapse") }}
      </button>
    </section>

    <section class="card">
      <h2 class="card__title">{{ $t("settings.device") }}</h2>
      <p class="card__lead">
        {{ $t("settings.deviceLead", { name: data.deviceName || $t("settings.deviceUs") }) }}
      </p>
      <button class="danger" type="button" @click="signOut">{{ $t("settings.signOut") }}</button>
      <p class="card__note">
        {{ $t("settings.signOutNote") }}
      </p>
    </section>
  </div>
</template>

<style scoped>
.settings {
  padding: 1.5rem 1rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
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
  color: var(--bm-ink-soft);
  word-break: break-word;
}

.settings__title {
  font-size: 1.75rem;
}

.card {
  background: var(--bm-surface);
  border-radius: 1.5rem;
  padding: 1.25rem;
  box-shadow: var(--bm-shadow-card);
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.card__title {
  font-size: 1.15rem;
}

.card__lead {
  margin: 0;
  color: var(--bm-ink-soft);
  font-size: 0.9rem;
  line-height: 1.5;
}

.card__note {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--bm-ink-soft);
}

.leads {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.35rem;
}

.lead {
  min-height: 2.5rem;
  padding: 0 0.25rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
}

.lead--active {
  background: var(--bm-feed);
  border-color: transparent;
  color: #2a2028;
}

.push-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
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

.place {
  display: flex;
  gap: 0.5rem;
}

.place input {
  flex: 1;
  min-width: 0;
  min-height: 2.875rem;
  padding: 0 0.75rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface);
  color: var(--bm-ink);
  font: inherit;
  font-size: 1rem;
}

.place .secondary {
  flex: none;
  padding-inline: 1rem;
}

.place__results {
  list-style: none;
  margin: 0;
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
  padding: 0.7rem 0.9rem;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  min-height: 3rem;
  padding: 0.6rem 0.9rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.option--active {
  border-color: var(--bm-feed);
  background: var(--bm-feed-soft);
}

.option__label {
  font-weight: 600;
}

.option__hint {
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.primary,
.secondary,
.danger {
  min-height: 3rem;
  border-radius: 1.125rem;
  border: 1px solid transparent;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.primary {
  background: var(--bm-feed);
  color: #2a2028;
}

.secondary {
  background: var(--bm-surface-sunk);
  border-color: var(--bm-hairline);
  color: var(--bm-ink);
}

.danger {
  background: transparent;
  border-color: color-mix(in srgb, var(--bm-photo) 50%, transparent);
  color: var(--bm-photo);
}

.primary:disabled,
.secondary:disabled {
  opacity: 0.5;
}
</style>
