import de from "./de.json";
import at from "./at.json";
import ch from "./ch.json";
import gb from "./gb.json";
import us from "./us.json";
import none from "./none.json";

/**
 * Vorsorgetermine und Impfkalender sind LANDESSACHE.
 *
 * Vorher standen die deutschen Daten fest im Code. Für einen Haushalt in Deutschland
 * war das richtig und für alle anderen falsch — und zwar auf die unangenehme Art:
 * Die App hätte Termine angezeigt, die es dort nicht gibt, bei Gesundheitsdaten eines
 * Kindes. Deshalb liegt jedes Land in einer eigenen Datei, die auch jemand ohne
 * Programmierkenntnisse lesen und ergänzen kann.
 *
 * NUR DEUTSCHLAND IST GEPRÜFT. Die Datei wurde in diesem Projekt aus dem Original des
 * Robert Koch-Instituts übertragen und gegengelesen. Alle anderen sind aus öffentlichen
 * Quellen zusammengetragen und ausdrücklich NICHT abgenommen — die App sagt das an der
 * Stelle, an der die Termine stehen, statt es in der Dokumentation zu verstecken.
 * Wer ein Land beisteuert und es gegen die amtliche Quelle geprüft hat, setzt
 * `verified` auf true.
 */

export type CheckupUnit = "day" | "week" | "month";

export type RegionCheckup = {
  id: string;
  /** Wie das jeweilige Land es nennt — beim Arzt soll man es wiedererkennen. */
  windowLabel: string;
  unit: CheckupUnit;
  /** Nullbasierter Abstand zur Geburt, in `unit`. Der Geburtstag ist Tag 0. */
  from: number;
  to: number;
  what: string;
};

export type RegionVaccination = {
  id: string;
  name: string;
  doses: { month: number; dose: string; optional?: boolean }[];
  note?: string;
};

export type Region = {
  code: string;
  name: string;
  englishName: string;
  /** Gegen die amtliche Quelle geprüft? Steuert den Hinweis in der App. */
  verified: boolean;
  /** Wie die Untersuchungen im Land heißen — "U-Untersuchungen", "NHS reviews" … */
  checkupsLabel: string;
  sources: { checkups?: string; vaccinations?: string; url?: string };
  /**
   * Hinweis zu den Fristen. Entweder ein Text oder nach Sprachcode aufgeschlüsselt —
   * für Länder, deren Regeln sich nicht in einem Satz übersetzen lassen. Wer eine
   * Sprache nicht führt, bekommt die erste vorhandene.
   */
  checkupNote?: string | Record<string, string>;
  checkups: RegionCheckup[];
  vaccinations: RegionVaccination[];
};

/**
 * Reihenfolge = Reihenfolge in der Auswahl. "Ohne Termine" steht bewusst am Ende:
 * Es ist die richtige Wahl für jedes noch fehlende Land, aber nicht die erste,
 * die jemand sehen soll.
 */
export const REGIONS: Region[] = [de, at, ch, gb, us, none] as Region[];

export const DEFAULT_REGION = "none";

/** Den Hinweis in der gewünschten Sprache holen, mit Rückfall auf das Vorhandene. */
export function regionNote(
  note: string | Record<string, string> | undefined,
  locale: string,
): string {
  if (!note) return "";
  if (typeof note === "string") return note;
  return note[locale] ?? note["en"] ?? Object.values(note)[0] ?? "";
}

export function regionByCode(code: string | null | undefined): Region {
  return REGIONS.find((r) => r.code === code) ?? REGIONS.find((r) => r.code === DEFAULT_REGION)!;
}
