import weightGirls from "./weight-girls.json";
import weightBoys from "./weight-boys.json";
import lengthGirls from "./length-girls.json";
import lengthBoys from "./length-boys.json";
import type { Sex } from "@babymonitor/shared";

/**
 * WHO Child Growth Standards.
 *
 * QUELLE: World Health Organization, Child Growth Standards, "expanded tables"
 * (z-scores) für Weight-for-age und Length/height-for-age, Jungen und Mädchen.
 * https://www.who.int/tools/child-growth-standards/standards
 *
 * Erzeugt mit `tools/build-who-tables.py` aus den Original-xlsx. Behalten wurden nur
 * L, M und S je Stützstelle — daraus lässt sich jedes Perzentil exakt berechnen,
 * während die vorberechneten Standardabweichungsspalten die Dateien ohne jeden
 * Gewinn vervierfachen würden. Ausgedünnt auf ein Wochenraster über zwei Jahre;
 * zwischen zwei benachbarten Tagen ändert sich der Median um Bruchteile eines
 * Gramms, dazwischen wird linear interpoliert.
 *
 * Format je Zeile: [Lebenstag, L, M, S]
 */
type LmsRow = [day: number, l: number, m: number, s: number];

export type GrowthMeasure = "weight" | "length";

const TABLES: Record<GrowthMeasure, Record<Sex, LmsRow[]>> = {
  weight: { female: weightGirls as LmsRow[], male: weightBoys as LmsRow[] },
  length: { female: lengthGirls as LmsRow[], male: lengthBoys as LmsRow[] },
};

/** Zwischen den Wochen-Stützstellen linear interpolieren. */
function lmsAt(measure: GrowthMeasure, sex: Sex, ageDays: number): LmsRow | null {
  const table = TABLES[measure][sex];
  if (table.length === 0) return null;

  const first = table[0]!;
  const last = table[table.length - 1]!;
  if (ageDays <= first[0]) return first;
  if (ageDays >= last[0]) return last;

  for (let i = 1; i < table.length; i++) {
    const hi = table[i]!;
    if (hi[0] < ageDays) continue;
    const lo = table[i - 1]!;
    const t = (ageDays - lo[0]) / (hi[0] - lo[0]);
    return [
      ageDays,
      lo[1] + (hi[1] - lo[1]) * t,
      lo[2] + (hi[2] - lo[2]) * t,
      lo[3] + (hi[3] - lo[3]) * t,
    ];
  }
  return last;
}

/**
 * Z-Wert nach der LMS-Formel.
 *
 *   z = ((X/M)^L − 1) / (L·S)      für L ≠ 0
 *   z = ln(X/M) / S                für L = 0
 *
 * Der Sonderfall L = 0 ist kein Randfall, sondern der Grenzwert der Box-Cox-
 * Transformation — bei Länge-für-Alter ist L über weite Strecken exakt 1, bei
 * anderen Maßen kann er 0 werden, und dann teilt die obere Formel durch null.
 */
export function zScore(
  measure: GrowthMeasure,
  sex: Sex,
  ageDays: number,
  /** Gewicht in kg bzw. Länge in cm — dieselben Einheiten wie die WHO-Tabellen. */
  value: number,
): number | null {
  const lms = lmsAt(measure, sex, ageDays);
  if (!lms || value <= 0) return null;
  const [, l, m, s] = lms;
  return Math.abs(l) < 1e-7 ? Math.log(value / m) / s : ((value / m) ** l - 1) / (l * s);
}

/** Wert, der einem gegebenen Z-Wert entspricht — für die Perzentilkurven. */
export function valueAtZ(
  measure: GrowthMeasure,
  sex: Sex,
  ageDays: number,
  z: number,
): number | null {
  const lms = lmsAt(measure, sex, ageDays);
  if (!lms) return null;
  const [, l, m, s] = lms;
  return Math.abs(l) < 1e-7 ? m * Math.exp(s * z) : m * (1 + l * s * z) ** (1 / l);
}

/**
 * Standardnormalverteilung als Prozentrang.
 * Abramowitz & Stegun 26.2.17, Genauigkeit ~1e-7 — für eine Anzeige wie "P42"
 * um Größenordnungen mehr als nötig.
 */
export function zToPercentile(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 50 * (1 + sign * erf);
}

/** Die Perzentillinien, die in der Grafik gezeichnet werden. */
export const PERCENTILE_LINES = [
  { z: -1.881, label: "P3" },
  { z: -1.036, label: "P15" },
  { z: 0, label: "P50" },
  { z: 1.036, label: "P85" },
  { z: 1.881, label: "P97" },
] as const;

export const WHO_SOURCE =
  "WHO Child Growth Standards (Weight-for-age, Length-for-age), " +
  "who.int/tools/child-growth-standards";
