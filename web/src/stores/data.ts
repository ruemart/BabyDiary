import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import {
  lifeWeek as calcLifeWeek,
  uuidv7,
  type Child,
  type Entry,
  type EntryType,
  type InvalidEntry,
} from "@babymonitor/shared";
import {
  META_CHILD_ID,
  META_DEVICE_NAME,
  getLocalChild,
  getMeta,
  listEntries,
  outboxCount,
  saveEntry,
  saveLocalChild,
  setMeta,
  softDeleteEntry,
  type LocalEntry,
} from "../db/local.ts";
import { sync, type SyncState } from "../sync.ts";
import { DIAPER_GUARD_MS, classifyDiaperTap } from "./diaperGuard.ts";

export type DiaperResult = { action: "created" | "corrected" | "duplicate"; id: string };

export const useData = defineStore("data", () => {
  const entries = shallowRef<LocalEntry[]>([]);
  const child = ref<Child | null>(null);
  const deviceName = ref<string>("");
  /** The server's suggestion for the country — only used during setup. */
  const defaultRegion = ref<string>("");
  const syncState = ref<SyncState>("idle");
  const pending = ref(0);
  const ready = ref(false);
  /** Entries permanently rejected by the server — they need correcting by hand. */
  const invalidEntries = ref<InvalidEntry[]>([]);

  const timezone = computed(() => child.value?.timezone ?? "Europe/Berlin");

  /** All entries, newest first. The basis for the status line and the history. */
  const byTimeDesc = computed(() =>
    [...entries.value].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
  );

  function lastOf(type: EntryType): LocalEntry | undefined {
    return byTimeDesc.value.find((e) => e.type === type);
  }

  const lastFeed = computed(() => lastOf("feed"));
  const lastDiaper = computed(() => lastOf("diaper"));

  /** A sleep without an end is currently running. */
  const activeSleep = computed(() =>
    byTimeDesc.value.find((e) => e.type === "sleep" && e.endedAt === null),
  );

  /**
   * Prefill for the ml field: the median of the last seven feeds.
   * Median rather than mean, because a single tiny bottle drags the mean noticeably and
   * the prefill would then have to be corrected every time.
   */
  const suggestedAmountMl = computed(() => {
    const recent = byTimeDesc.value
      .filter((e) => e.type === "feed" && e.amountMl !== null)
      .slice(0, 7)
      .map((e) => e.amountMl!)
      .sort((a, b) => a - b);
    if (recent.length === 0) return 90;
    const mid = Math.floor(recent.length / 2);
    const median =
      recent.length % 2 === 0 ? (recent[mid - 1]! + recent[mid]!) / 2 : recent[mid]!;
    return Math.round(median / 10) * 10;
  });

  /** The current week of life — the identity the app runs the child under. */
  const currentWeek = computed(() =>
    child.value ? calcLifeWeek(child.value.birthDate, new Date(), timezone.value) : 0,
  );

  const photosByWeek = computed(() => {
    const map = new Map<number, LocalEntry>();
    for (const e of entries.value) {
      if (e.type === "photo" && e.lifeWeek !== null) map.set(e.lifeWeek, e);
    }
    return map;
  });

  const currentWeekHasPhoto = computed(() => photosByWeek.value.has(currentWeek.value));

  /* ── Loading and writing ──────────────────────────────────────────────────── */

  async function load(): Promise<void> {
    const [rows, storedChild, name] = await Promise.all([
      listEntries(),
      getLocalChild(),
      getMeta(META_DEVICE_NAME),
    ]);
    entries.value = rows;
    child.value = storedChild;
    deviceName.value = name ?? "";
    pending.value = await outboxCount();
    ready.value = true;
  }

  /** Builds a complete entry from the type-specific fields. */
  function draft(type: EntryType, at: Date, fields: Partial<Entry> = {}): Entry {
    const now = new Date().toISOString();
    return {
      id: uuidv7(),
      childId: child.value?.id ?? "default",
      type,
      startedAt: at.toISOString(),
      endedAt: null,
      amountMl: null,
      spatUp: false,
      vitaminD: false,
      colicDrops: false,
      diaper: null,
      weightG: null,
      lengthMm: null,
      headMm: null,
      label: null,
      milestoneKey: null,
      temperatureDc: null,
      latitude: null,
      longitude: null,
      placeName: null,
      supplyCategory: null,
      supplySize: null,
      supplyShop: null,
      lifeWeek: null,
      mediaId: null,
      note: null,
      createdBy: deviceName.value || "Wir",
      editedAt: now,
      deleted: false,
      ...fields,
    };
  }

  async function add(entry: Entry): Promise<void> {
    await saveEntry(entry);
    await load();
    void pushSoon();
  }

  async function update(entry: Entry): Promise<void> {
    // Reset `editedAt`: it decides which version wins when syncing.
    await saveEntry({ ...entry, editedAt: new Date().toISOString() });
    await load();
    void pushSoon();
  }

  async function remove(id: string): Promise<void> {
    await softDeleteEntry(id);
    await load();
    void pushSoon();
  }

  /**
   * Record a nappy, with a guard against double taps.
   *
   * The distinction between a slip and a correction lives in `classifyDiaperTap` and is
   * tested there. Both are reported back visibly and stay reversible through the
   * history — a silent guard that swallows inputs would be worse than the problem it
   * solves.
   */
  async function logDiaper(kind: "empty" | "wet" | "soiled"): Promise<DiaperResult> {
    const recent = byTimeDesc.value.find(
      (e) => e.type === "diaper" && Date.now() - Date.parse(e.startedAt) < DIAPER_GUARD_MS,
    );
    const decision = classifyDiaperTap(recent, kind);

    if (decision.action === "duplicate") return { action: "duplicate", id: decision.id };

    if (decision.action === "correct") {
      await update({ ...recent!, diaper: kind });
      return { action: "corrected", id: decision.id };
    }

    const entry = draft("diaper", new Date(), { diaper: kind });
    await add(entry);
    return { action: "created", id: entry.id };
  }

  async function saveChild(next: Child): Promise<void> {
    await saveLocalChild({ ...next, editedAt: new Date().toISOString() });
    child.value = await getLocalChild();
    void pushSoon();
  }

  async function setDeviceName(name: string): Promise<void> {
    deviceName.value = name;
    await setMeta(META_DEVICE_NAME, name);
  }

  /* ── Triggering a sync ────────────────────────────────────────────────────── */

  let timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Collect briefly, then send. Recording three nappies in a row triggers one request
   * instead of three.
   */
  function pushSoon(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void pushNow(), 800);
  }

  async function pushNow(): Promise<void> {
    /**
     * "bootstrap" is not an error but the path for a freshly invited device: it does not
     * know the childId yet, the server resolves it from the existing record and sends
     * the child and the entries back.
     */
    const id = child.value?.id ?? (await getMeta(META_CHILD_ID)) ?? "bootstrap";

    syncState.value = "syncing";
    const outcome = await sync(id);
    syncState.value = outcome.state;
    // Pass rejected entries through for display: they are out of the outbox and need
    // correcting by hand — that must not happen silently.
    if (outcome.state === "idle") {
      // After a successful round the list is authoritative again: whatever is no longer
      // reported has been accepted. Otherwise the warning would sit there forever even
      // though the correction went through long ago.
      invalidEntries.value = outcome.invalid;
    }
    if (outcome.pulled > 0) await load();
    pending.value = await outboxCount();
  }

  return {
    entries,
    byTimeDesc,
    child,
    deviceName,
    defaultRegion,
    timezone,
    syncState,
    pending,
    ready,
    invalidEntries,
    lastFeed,
    lastDiaper,
    activeSleep,
    suggestedAmountMl,
    currentWeek,
    photosByWeek,
    currentWeekHasPhoto,
    load,
    draft,
    add,
    logDiaper,
    update,
    remove,
    saveChild,
    setDeviceName,
    pushNow,
    pushSoon,
  };
});
