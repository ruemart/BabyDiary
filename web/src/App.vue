<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import { OnyxToast } from "sit-onyx";
import { useData } from "./stores/data.ts";
import { checkSession } from "./sync.ts";
import BottomNav from "./components/BottomNav.vue";
import SetupWizard from "./components/SetupWizard.vue";

const data = useData();
const route = useRoute();
const router = useRouter();

const authenticated = ref<boolean | null>(null);
let syncTimer: ReturnType<typeof setInterval> | null = null;

/** Der Einladungsbildschirm bringt sein eigenes Layout mit. */
const isJoinRoute = computed(() => route.name === "start");

const needsSetup = computed(
  () => authenticated.value === true && data.ready && !data.child && !isJoinRoute.value,
);

const showShell = computed(
  () => authenticated.value === true && data.ready && !!data.child && !isJoinRoute.value,
);

onMounted(async () => {
  await data.load();

  const session = await checkSession();
  authenticated.value = session.authenticated;
  if (session.name && !data.deviceName) await data.setDeviceName(session.name);

  if (!session.authenticated && !isJoinRoute.value) {
    await router.replace({ name: "start" });
    return;
  }

  void data.pushNow();

  // Beim Zurückholen der App sofort abgleichen — dann sieht man die Einträge des
  // anderen Geräts direkt beim Aufwachen und nicht erst nach dem nächsten Timer.
  document.addEventListener("visibilitychange", onVisibility);
  syncTimer = setInterval(() => {
    if (!document.hidden) void data.pushNow();
  }, 30_000);
});

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
  display: grid;
  place-items: center;
  min-height: 100dvh;
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
