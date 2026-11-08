import { onUnmounted, ref, watch, type Ref } from "vue";

/**
 * A clock that only runs while something is open.
 *
 * "Last one 2 h 11 min ago" goes stale while a sheet sits open, and a sheet can sit
 * open for a while — somebody adding a night feed the next morning is reading, typing
 * and correcting. Half a minute is fine for a label that counts in minutes, and it
 * costs nothing while the sheet is closed, which is almost always.
 */
export function useTickingNow(active: Ref<boolean>, everyMs = 30_000) {
  const now = ref(new Date());
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  watch(
    active,
    (isActive) => {
      stop();
      if (!isActive) return;
      // Fresh on opening, so the first glance is never a stale number from last time.
      now.value = new Date();
      timer = setInterval(() => (now.value = new Date()), everyMs);
    },
    { immediate: true },
  );

  onUnmounted(stop);

  return now;
}
