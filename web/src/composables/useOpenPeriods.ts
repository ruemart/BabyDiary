import { computed } from "vue";
import { relativeSince, type EntryType } from "@babymonitor/shared";
import type { LocalEntry } from "../db/local.ts";

/**
 * Alles, was gerade läuft — Schlaf, Krankheit, Abwesenheit.
 *
 * Der Gedanke dahinter: Ein Zeitraum wird begonnen, wenn er beginnt. Nach dem Ende
 * zu fragen, während das Kind gerade einschläft, ist genau die Art von Rückfrage, die
 * eine Eingabe verhindert. Also: starten mit einem Tap, später mit einem Tap beenden —
 * und zwar für ALLE Zeitraum-Arten gleich, nicht als Sonderfall für den Schlaf.
 *
 * Mehrere gleichzeitig sind ausdrücklich möglich: Ein Kind kann im Urlaub krank
 * werden und dabei schlafen.
 */

export type OpenPeriod = {
  id: string;
  type: EntryType;
  /** Was dransteht, z. B. "Schlaf", "Erkältung", "Urlaub · Sylt". */
  title: string;
  /** "seit 2 Std 10 Min" */
  since: string;
  /** Für die Farbgebung. */
  kind: "sleep" | "illness" | "absence";
};

const PERIOD_TYPES = new Set<EntryType>(["sleep", "illness", "absence"]);

export function useOpenPeriods(entries: () => LocalEntry[], now: () => Date) {
  return computed<OpenPeriod[]>(() =>
    entries()
      .filter((e) => PERIOD_TYPES.has(e.type) && e.endedAt === null)
      // Zuletzt begonnenes zuerst — das ist meist das, was man beenden will.
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((e) => ({
        id: e.id,
        type: e.type,
        title:
          e.type === "sleep"
            ? "Schlaf"
            : [e.label, e.placeName].filter(Boolean).join(" · ") || "Zeitraum",
        since: relativeSince(e.startedAt, now()),
        kind: e.type as OpenPeriod["kind"],
      })),
  );
}
