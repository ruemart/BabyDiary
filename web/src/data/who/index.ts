import weightGirls from "./weight-girls.json";
import weightBoys from "./weight-boys.json";
import lengthGirls from "./length-girls.json";
import lengthBoys from "./length-boys.json";
import type { Sex } from "@babydiary/shared";

/**
 * WHO Child Growth Standards.
 *
 * SOURCE: World Health Organization, Child Growth Standards, "expanded tables"
 * (z-scores) for weight-for-age and length/height-for-age, boys and girls.
 * https://www.who.int/tools/child-growth-standards/standards
 *
 * Generated with `tools/build-who-tables.py` from the original xlsx files. Only L, M and
 * S were kept per anchor point — from those every percentile can be computed exactly,
 * whereas the precomputed standard-deviation columns would quadruple the files for no
 * gain at all. Thinned to a weekly grid over two years; between two adjacent days the
 * median changes by fractions of a gram, and in between it is interpolated linearly.
 *
 * Format per row: [day of life, L, M, S]
 */
type LmsRow = [day: number, l: number, m: number, s: number];

export type GrowthMeasure = "weight" | "length";

const TABLES: Record<GrowthMeasure, Record<Sex, LmsRow[]>> = {
  weight: { female: weightGirls as LmsRow[], male: weightBoys as LmsRow[] },
  length: { female: lengthGirls as LmsRow[], male: lengthBoys as LmsRow[] },
};

/** Interpolate linearly between the weekly anchor points. */
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
 * Z-score by the LMS formula.
 *
 *   z = ((X/M)^L − 1) / (L·S)      for L ≠ 0
 *   z = ln(X/M) / S                for L = 0
 *
 * The special case L = 0 is not an edge case but the limit of the Box-Cox
 * transformation — for length-for-age L is exactly 1 over long stretches, for other
 * measures it can become 0, and then the upper formula divides by zero.
 */
export function zScore(
  measure: GrowthMeasure,
  sex: Sex,
  ageDays: number,
  /** Weight in kg or length in cm — the same units as the WHO tables. */
  value: number,
): number | null {
  const lms = lmsAt(measure, sex, ageDays);
  if (!lms || value <= 0) return null;
  const [, l, m, s] = lms;
  return Math.abs(l) < 1e-7 ? Math.log(value / m) / s : ((value / m) ** l - 1) / (l * s);
}

/** The value corresponding to a given z-score — for the percentile curves. */
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
 * The standard normal distribution as a percentile rank.
 * Abramowitz & Stegun 26.2.17, accuracy ~1e-7 — orders of magnitude more than needed
 * for a display like "P42".
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

/** The percentile lines drawn in the chart. */
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
