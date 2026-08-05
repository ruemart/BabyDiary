import de from "./de.json";
import at from "./at.json";
import ch from "./ch.json";
import gb from "./gb.json";
import us from "./us.json";
import none from "./none.json";

/**
 * Check-ups and vaccination schedules are a NATIONAL matter.
 *
 * The German data used to sit hard-coded in the source. For a household in Germany that
 * was right and for everyone else wrong — in the unpleasant way: the app would have
 * shown appointments that do not exist there, for a child's health data. So every
 * country lives in a file of its own that someone without programming knowledge can
 * read and extend.
 *
 * ONLY GERMANY IS VERIFIED. That file was transcribed in this project from the Robert
 * Koch Institute's original and proofread. All others were gathered from public sources
 * and are explicitly NOT signed off — the app says so right where the appointments are
 * shown, rather than hiding it in the documentation. Anyone contributing a country and
 * checking it against the official source sets `verified` to true.
 */

export type CheckupUnit = "day" | "week" | "month";

export type RegionCheckup = {
  id: string;
  /** What the country itself calls it — you should recognise it at the doctor's. */
  windowLabel: string;
  unit: CheckupUnit;
  /** Zero-based distance from birth, in `unit`. The birthday is day 0. */
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
  /** Checked against the official source? Drives the note in the app. */
  verified: boolean;
  /** What the country calls its check-ups — "U-Untersuchungen", "NHS reviews" … */
  checkupsLabel: string;
  sources: { checkups?: string; vaccinations?: string; url?: string };
  /**
   * Note about the deadlines. Either a text or keyed by language code — for countries
   * whose rules do not translate into one sentence. A language that is not present
   * falls back to the first one available.
   */
  checkupNote?: string | Record<string, string>;
  checkups: RegionCheckup[];
  vaccinations: RegionVaccination[];
};

/**
 * Order = order in the picker. "No appointments" deliberately sits last: it is the right
 * choice for every country still missing, but not the first one someone should see.
 */
export const REGIONS: Region[] = [de, at, ch, gb, us, none] as Region[];

export const DEFAULT_REGION = "none";

/** Fetch the note in the desired language, falling back to whatever is there. */
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
