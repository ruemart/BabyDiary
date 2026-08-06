<script setup lang="ts">
import { computed } from "vue";
import { useData } from "../stores/data.ts";
import { useI18n } from "vue-i18n";


const { t } = useI18n();
const data = useData();

/**
 * The week of life is the identity an infant is tracked under — parents and paediatric
 * practices count in weeks during the first year, not in months. So it stands here
 * instead of a date.
 */
const weekLabel = computed(() => t("common.weekN", { n: data.currentWeek }));

const syncLabel = computed(() => {
  if (data.pending > 0 && data.syncState === "offline") return t("sync.pendingOffline", { n: data.pending });
  if (data.syncState === "offline") return t("sync.offline");
  if (data.syncState === "syncing") return t("sync.syncing");
  if (data.syncState === "unauthorized") return t("sync.unauthorized");
  if (data.syncState === "error") return t("sync.error");
  if (data.pending > 0) return t("sync.waiting", { n: data.pending });
  return null;
});
</script>

<template>
  <header class="header">
    <div>
      <h1 class="header__week">{{ weekLabel }}</h1>
      <p class="header__name">{{ data.child?.name }}</p>
    </div>
    <!-- Only shown when there is something to say. A permanent "all fine" would be pure
         noise in a place that should stay quiet. -->
    <span v-if="syncLabel" class="header__sync">{{ syncLabel }}</span>
  </header>
</template>

<style scoped>
.header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.5rem 0 0.25rem;
}

.header__week {
  font-size: 1.75rem;
  line-height: 1.1;
}

.header__name {
  margin: 0.1rem 0 0;
  color: var(--bm-ink-soft);
  font-size: 0.95rem;
}

.header__sync {
  flex: none;
  padding: 0.25rem 0.6rem;
  border-radius: 62.5rem;
  background: var(--bm-surface-sunk);
  color: var(--bm-ink-soft);
  font-size: 0.75rem;
  font-weight: 500;
}
</style>
