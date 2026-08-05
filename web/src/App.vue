<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import { OnyxToast } from "sit-onyx";
import { useData } from "./stores/data.ts";
import { checkSession, fetchDefaultRegion } from "./sync.ts";
import { wipeLocal } from "./db/local.ts";
import BottomNav from "./components/BottomNav.vue";
import SetupWizard from "./components/SetupWizard.vue";

const data = useData();
const route = useRoute();
const router = useRouter();

const authenticated = ref<boolean | null>(null);
/**
 * Ob der erste Abgleich mit dem Server durch ist.
 *
 * Entscheidend für das ZWEITE Gerät: Dessen lokale Datenbank ist leer, die Kinddaten
 * liegen aber längst auf dem Server. Ohne dieses Flag würde dem zweiten Elternteil
 * der Einrichtungsdialog gezeigt und er müsste alles noch einmal eintippen — und
 * hätte am Ende ein zweites Kind in der Datenbank.
 */
const initialSyncDone = ref(false);
let syncTimer: ReturnType<typeof setInterval> | null = null;

/** Der Einladungsbildschirm bringt sein eigenes Layout mit. */
const isJoinRoute = computed(() => route.name === "start");

const needsSetup = computed(
  () =>
    authenticated.value === true &&
    data.ready &&
    initialSyncDone.value &&
    !data.child &&
    !isJoinRoute.value,
);

const showShell = computed(
  () => authenticated.value === true && data.ready && !!data.child && !isJoinRoute.value,
);

/**
 * Der Startvorgang darf nie ohne Ausweg hängen bleiben.
 *
 * Nach ein paar Sekunden erscheinen Schaltflächen zum Neuladen und zum Zurücksetzen
 * der lokalen Daten. Eine App, die sich im Ladepunkt aufhängt und den Menschen ohne
 * jede Handhabe zurücklässt, ist kaputt — egal aus welchem Grund sie hängt.
 */
const bootStalled = ref(false);
const bootError = ref<string | null>(null);
let stallTimer: ReturnType<typeof setTimeout> | null = null;

function reload() {
  location.reload();
}

async function resetLocalData() {
  await wipeLocal().catch(() => {});
  location.reload();
}

onMounted(async () => {
  stallTimer = setTimeout(() => (bootStalled.value = true), 6000);

  try {
    await boot();
  } catch (error) {
    // Sichtbar scheitern statt still hängen.
    bootError.value = error instanceof Error ? error.message : String(error);
    authenticated.value = authenticated.value ?? false;
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
  }
});

async function boot() {
  await data.load();

  const session = await checkSession();
  // Parallel wäre schöner, aber der Assistent braucht es erst nach dem Abgleich.
  data.defaultRegion = await fetchDefaultRegion();
  authenticated.value = session.authenticated;
  if (session.name && !data.deviceName) await data.setDeviceName(session.name);

  if (!session.authenticated) {
    // Ohne Sitzung wird NICHT abgeglichen. Vorher lief auf dem Einladungsbildschirm
    // trotzdem ein Sync-Versuch los, der zwangsläufig 401 bekam — ein sinnloser
    // Request, der die Konsole mit einem Fehler beschriftet und den Sync-Zustand
    // auf "nicht angemeldet" setzt, bevor sich überhaupt jemand anmelden konnte.
    if (!isJoinRoute.value) await router.replace({ name: "start" });
    return;
  }

  // Erst abgleichen, dann entscheiden, ob eingerichtet werden muss.
  await data.pushNow();
  initialSyncDone.value = true;

  // Beim Zurückholen der App sofort abgleichen — dann sieht man die Einträge des
  // anderen Geräts direkt beim Aufwachen und nicht erst nach dem nächsten Timer.
  document.addEventListener("visibilitychange", onVisibility);
  syncTimer = setInterval(() => {
    if (!document.hidden) void data.pushNow();
  }, 30_000);
}

onUnmounted(() => {
  document.removeEventListener("visibilitychange", onVisibility);
  if (syncTimer) clearInterval(syncTimer);
});

function onVisibility() {
  if (!document.hidden) void data.pushNow();
}
</script>

<template>
  <div class="app">
    <template v-if="authenticated === null">
      <div class="boot" role="status" aria-live="polite">
        <span class="boot__dot" />
        <div v-if="bootStalled || bootError" class="boot__rescue">
          <p class="boot__text">
            {{ bootError ? $t("boot.failed") : $t("boot.slow") }}
          </p>
          <p v-if="bootError" class="boot__detail">{{ bootError }}</p>
          <div class="boot__actions">
            <button class="boot__button" type="button" @click="reload">
              {{ $t("boot.reload") }}
            </button>
            <button class="boot__button boot__button--quiet" type="button" @click="resetLocalData">
              {{ $t("boot.reset") }}
            </button>
          </div>
          <p class="boot__note">
            {{ $t("boot.resetHint") }}
          </p>
        </div>
      </div>
    </template>

    <SetupWizard v-else-if="needsSetup" />

    <template v-else>
      <main class="app__content" :class="{ 'app__content--with-nav': showShell }">
        <RouterView />
      </main>
      <BottomNav v-if="showShell" />
    </template>

    <OnyxToast />
  </div>
</template>

<style scoped>
.app {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.app__content {
  flex: 1;
  width: 100%;
  max-width: 40rem;
  margin-inline: auto;
}

/* Platz für die Navigationsleiste plus die Home-Indicator-Zone auf iOS. */
.app__content--with-nav {
  padding-bottom: calc(4.75rem + env(safe-area-inset-bottom));
}

.boot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  min-height: 100dvh;
  padding: 1.5rem;
}

.boot__rescue {
  max-width: 22rem;
  text-align: center;
}

.boot__text {
  margin: 0 0 0.5rem;
  font-weight: 600;
}

.boot__detail {
  margin: 0 0 1rem;
  font-size: 0.8125rem;
  color: var(--bm-ink-soft);
  word-break: break-word;
}

.boot__actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.boot__button {
  min-height: 2.875rem;
  padding: 0 1rem;
  border: none;
  border-radius: 1rem;
  background: var(--bm-feed);
  color: #2a2028;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.boot__button--quiet {
  background: transparent;
  border: 1px solid var(--bm-hairline);
  color: var(--bm-ink-soft);
}

.boot__note {
  margin: 0.75rem 0 0;
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--bm-ink-soft);
}

.boot__dot {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  background: var(--bm-feed);
  animation: boot-pulse 1.4s ease-in-out infinite;
}

@keyframes boot-pulse {
  0%,
  100% {
    opacity: 0.25;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
