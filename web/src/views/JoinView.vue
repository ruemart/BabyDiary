<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useData } from "../stores/data.ts";
import { checkSession, redeemInvite } from "../sync.ts";
import { useI18n } from "vue-i18n";


const { t } = useI18n();
/**
 * Einladungsbildschirm — der einzige Anmeldevorgang, den es gibt.
 *
 * Der Link enthält das Haushalts-Token (`/start?t=…`). Wer ihn einmal öffnet und seinen
 * Namen wählt, bekommt ein Cookie mit einem Jahr Laufzeit. Danach kommt hier nie wieder
 * jemand vorbei.
 */
const route = useRoute();
const router = useRouter();
const data = useData();

const token = ref((route.query["t"] as string | undefined) ?? "");
const name = ref("");
const busy = ref(false);
const error = ref("");

const SUGGESTIONS = ["Mama", "Papa"];

onMounted(async () => {
  const session = await checkSession();
  if (session.authenticated) await router.replace("/");
});

async function join() {
  error.value = "";
  if (!name.value.trim()) {
    error.value = t("join.needName");
    return;
  }
  if (!token.value.trim()) {
    error.value = t("join.incompleteLink");
    return;
  }

  busy.value = true;
  const ok = await redeemInvite(token.value.trim(), name.value.trim());
  busy.value = false;

  if (!ok) {
    error.value = t("join.wrongToken");
    return;
  }

  await data.setDeviceName(name.value.trim());
  await router.replace("/");
  // Neu laden, damit die App den Startvorgang mit gültiger Sitzung durchläuft.
  location.reload();
}
</script>

<template>
  <div class="join">
    <div class="join__card">
      <h1 class="join__title">{{ $t("join.title") }}</h1>
      <p class="join__lead">
        {{ $t("join.intro") }}
      </p>

      <fieldset class="who">
        <legend>{{ $t("join.who") }}</legend>
        <div class="who__options">
          <button
            v-for="option in SUGGESTIONS"
            :key="option"
            type="button"
            class="who__option"
            :class="{ 'who__option--active': name === option }"
            @click="name = option"
          >
            {{ option }}
          </button>
        </div>
        <label class="who__custom">
          <span>{{ $t("join.otherName") }}</span>
          <input v-model="name" type="text" autocomplete="off" :placeholder="$t('join.otherPlaceholder')" />
        </label>
      </fieldset>

      <label v-if="!route.query['t']" class="token">
        <span>{{ $t("join.code") }}</span>
        <input v-model="token" type="text" autocomplete="off" />
      </label>

      <p v-if="error" class="join__error" role="alert">{{ error }}</p>

      <button class="join__submit" type="button" :disabled="busy" @click="join">
        {{ busy ? $t("join.busy") : $t("join.submit") }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.join {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
}

.join__card {
  width: 100%;
  max-width: 26rem;
  padding: 2rem 1.5rem;
  background: var(--bm-surface);
  border-radius: 1.75rem;
  box-shadow: var(--bm-shadow-card);
}

.join__title {
  font-size: 2rem;
}

.join__lead {
  margin: 0.5rem 0 1.75rem;
  color: var(--bm-ink-soft);
  line-height: 1.5;
}

.who {
  border: none;
  padding: 0;
  margin: 0 0 1.25rem;
}

.who legend {
  padding: 0;
  margin-bottom: 0.6rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--bm-ink-soft);
}

.who__options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.who__option {
  min-height: 3rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 1rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.who__option--active {
  background: var(--bm-feed);
  border-color: transparent;
  color: #2a2028;
}

.who__custom,
.token {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-bottom: 1rem;
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
}

.who__custom input,
.token input {
  min-height: 2.75rem;
  padding: 0 0.75rem;
  border: 1px solid var(--bm-hairline);
  border-radius: 0.875rem;
  background: var(--bm-surface);
  color: var(--bm-ink);
  font: inherit;
  font-size: 1rem;
}

.join__error {
  margin: 0 0 1rem;
  padding: 0.6rem 0.75rem;
  border-radius: 0.75rem;
  background: color-mix(in srgb, #b5677a 15%, transparent);
  color: var(--bm-ink);
  font-size: 0.9rem;
}

.join__submit {
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

.join__submit:disabled {
  opacity: 0.6;
}
</style>
