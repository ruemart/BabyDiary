import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import {
  lifeWeek as calcLifeWeek,
  uuidv7,
  type Child,
  type Entry,
  type EntryType,
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
  const syncState = ref<SyncState>("idle");
  const pending = ref(0);
  const ready = ref(false);

  const timezone = computed(() => child.value?.timezone ?? "Europe/Berlin");

  /** Alle Einträge, neueste zuerst. Basis für Statuszeile und Historie. */
  const byTimeDesc = computed(() =>
    [...entries.value].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
  );

  function lastOf(type: EntryType): LocalEntry | undefined {
    return byTimeDesc.value.find((e) => e.type === type);
  }

  const lastFeed = computed(() => lastOf("feed"));
  const lastDiaper = computed(() => lastOf("diaper"));

  /** Ein Schlaf ohne Ende läuft gerade. */
  const activeSleep = computed(() =>
    byTimeDesc.value.find((e) => e.type === "sleep" && e.endedAt === null),
  );

  /**
   * Vorbelegung des ml-Felds: der Median der letzten sieben Mahlzeiten.
   * Median statt Mittelwert, weil ein einzelnes Mini-Fläschchen den Mittelwert
   * spürbar zieht und die Vorbelegung dann jedes Mal korrigiert werden müsste.
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

  /** Aktuelle Lebenswoche — die Identität, unter der die App das Kind führt. */
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

  /* ── Laden und Schreiben ──────────────────────────────────────────────────── */

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

  /** Baut einen vollständigen Eintrag aus den typspezifischen Feldern. */
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
      diaper: null,
      weightG: null,
      lengthMm: null,
      headMm: null,
      label: null,
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
    // `editedAt` neu setzen: Es entscheidet beim Abgleich, welche Fassung gewinnt.
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
   * Windel eintragen, mit Schutz gegen Doppeltaps.
   *
   * Die Unterscheidung zwischen Versehen und Korrektur steckt in `classifyDiaperTap`
   * und ist dort getestet. Beides wird sichtbar zurückgemeldet und bleibt über den
   * Verlauf umkehrbar — ein stiller Schutz, der Eingaben verschluckt, wäre schlimmer
   * als das Problem, das er löst.
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

  /* ── Sync-Anstoß ──────────────────────────────────────────────────────────── */

  let timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Kurz sammeln, dann senden. Wer drei Windeln hintereinander einträgt, löst
   * damit einen Request aus statt drei.
   */
  function pushSoon(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void pushNow(), 800);
  }

  async function pushNow(): Promise<void> {
    /**
     * "bootstrap" ist kein Fehler, sondern der Weg für ein frisch eingeladenes Gerät:
     * Es kennt die childId noch nicht, der Server löst sie aus dem vorhandenen
     * Datensatz auf und schickt Kind und Einträge zurück.
     */
    const id = child.value?.id ?? (await getMeta(META_CHILD_ID)) ?? "bootstrap";

    syncState.value = "syncing";
    const outcome = await sync(id);
    syncState.value = outcome.state;
    if (outcome.pulled > 0) await load();
    pending.value = await outboxCount();
  }

  return {
    entries,
    byTimeDesc,
    child,
    deviceName,
    timezone,
    syncState,
    pending,
    ready,
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
