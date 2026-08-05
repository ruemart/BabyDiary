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
 * Whether the first sync with the server has completed.
 *
 * Crucial for the SECOND device: its local database is empty while the child's details
 * have long been on the server. Without this flag the second parent would be shown the
 * setup screen and would have to type everything in again — and would end up with a
 * second child in the database.
 */
const initialSyncDone = ref(false);
let syncTimer: ReturnType<typeof setInterval> | null = null;

/** The invite screen brings its own layout. */
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
 * The boot sequence must never hang without a way out.
 *
 * After a few seconds, buttons appear to reload and to reset the local data. An app that
 * hangs on the loading dot and leaves the person with no handle at all is broken — no
 * matter why it is hanging.
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
    // Fail visibly rather than hang silently.
    bootError.value = error instanceof Error ? error.message : String(error);
    authenticated.value = authenticated.value ?? false;
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
  }
});

async function boot() {
  await data.load();

  const session = await checkSession();
  // In parallel would be nicer, but the setup screen only needs it after the sync.
  data.defaultRegion = await fetchDefaultRegion();
  authenticated.value = session.authenticated;
  if (session.name && !data.deviceName) await data.setDeviceName(session.name);

  if (!session.authenticated) {
    // Without a session there is NO sync. Previously the invite screen still kicked off
    // a sync attempt that inevitably got a 401 — a pointless request that labels the
    // console with an error and sets the sync state to "not signed in" before anyone
    // could even sign in.
    if (!isJoinRoute.value) await router.replace({ name: "start" });
    return;
  }

  // Sync first, then decide whether setup is needed.
  await data.pushNow();
  initialSyncDone.value = true;

  // Sync immediately when the app comes back — that way you see the other device's
  // entries right on waking rather than after the next timer tick.
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

/* Room for the navigation bar plus the home indicator zone on iOS. */
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
