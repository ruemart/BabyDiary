import { describe, expect, it } from "vitest";
import { PERCENTILE_LINES, valueAtZ, zScore, zToPercentile } from "./index.ts";

/**
 * The percentile calculation is checked against published WHO reference values, not
 * against itself. For a display parents read as a statement about their child's
 * development, "looks plausible" is not a sufficient standard.
 */

describe("Z-Wert gegen WHO-Referenzwerte", () => {
  it("trifft den Median bei Geburt", () => {
    // WHO Weight-for-age, Mädchen, Tag 0: Median 3.2322 kg
    expect(zScore("weight", "female", 0, 3.2322)).toBeCloseTo(0, 3);
    // Jungen, Tag 0: Median 3.3464 kg
    expect(zScore("weight", "male", 0, 3.3464)).toBeCloseTo(0, 3);
    // Length-for-age, Mädchen, Tag 0: Median 49.1477 cm
    expect(zScore("length", "female", 0, 49.1477)).toBeCloseTo(0, 3);
  });

  it("trifft die veröffentlichten Standardabweichungen bei Geburt", () => {
    // WHO-Tabelle Mädchen Tag 0: −2 SD = 2.395 kg, +2 SD = 4.230 kg
    expect(zScore("weight", "female", 0, 2.395)).toBeCloseTo(-2, 2);
    expect(zScore("weight", "female", 0, 4.23)).toBeCloseTo(2, 2);
    // −3 SD = 2.033 kg, +3 SD = 4.793 kg
    expect(zScore("weight", "female", 0, 2.033)).toBeCloseTo(-3, 2);
    expect(zScore("weight", "female", 0, 4.793)).toBeCloseTo(3, 2);
  });

  it("trifft den Median mit einem Jahr", () => {
    // WHO Weight-for-age, Mädchen, 365 Tage: Median rund 8.9 kg
    const z = zScore("weight", "female", 365, 8.9);
    expect(z).not.toBeNull();
    expect(Math.abs(z!)).toBeLessThan(0.1);

    // Length-for-age, Mädchen, 365 Tage: Median rund 74 cm
    const zl = zScore("length", "female", 365, 74);
    expect(Math.abs(zl!)).toBeLessThan(0.2);
  });

  it("unterscheidet Jungen und Mädchen", () => {
    // Jungen sind im Median schwerer — dasselbe Gewicht ergibt einen kleineren Z-Wert.
    const girls = zScore("weight", "female", 180, 7.5)!;
    const boys = zScore("weight", "male", 180, 7.5)!;
    expect(boys).toBeLessThan(girls);
  });
});

describe("valueAtZ ist die Umkehrung von zScore", () => {
  it("führt für alle Perzentillinien zurück", () => {
    for (const day of [0, 30, 180, 365, 700]) {
      for (const line of PERCENTILE_LINES) {
        const value = valueAtZ("weight", "female", day, line.z)!;
        expect(zScore("weight", "female", day, value)!).toBeCloseTo(line.z, 6);
      }
    }
  });

  it("liefert monoton steigende Perzentilkurven", () => {
    // P3 < P15 < P50 < P85 < P97 — an jedem Tag.
    for (const day of [0, 90, 365, 728]) {
      const values = PERCENTILE_LINES.map((l) => valueAtZ("weight", "female", day, l.z)!);
      for (let i = 1; i < values.length; i++) {
        expect(values[i]!).toBeGreaterThan(values[i - 1]!);
      }
    }
  });
});

describe("zToPercentile", () => {
  it("bildet bekannte Z-Werte auf ihre Perzentile ab", () => {
    expect(zToPercentile(0)).toBeCloseTo(50, 4);
    expect(zToPercentile(-1.881)).toBeCloseTo(3, 1);
    expect(zToPercentile(-1.036)).toBeCloseTo(15, 1);
    expect(zToPercentile(1.036)).toBeCloseTo(85, 1);
    expect(zToPercentile(1.881)).toBeCloseTo(97, 1);
    expect(zToPercentile(-1.96)).toBeCloseTo(2.5, 1);
    expect(zToPercentile(1.96)).toBeCloseTo(97.5, 1);
  });
});

describe("Randfälle", () => {
  it("klemmt Alter außerhalb der Tabelle auf die Ränder", () => {
    // Nothing may crash before birth or after two years.
    expect(zScore("weight", "female", -10, 3.2322)).toBeCloseTo(0, 3);
    expect(zScore("weight", "female", 5000, 12)).not.toBeNull();
  });

  it("weist unmögliche Messwerte ab statt NaN zu liefern", () => {
    expect(zScore("weight", "female", 30, 0)).toBeNull();
    expect(zScore("weight", "female", 30, -1)).toBeNull();
  });

  it("interpoliert zwischen den Wochen-Stützstellen", () => {
    // Day 10 lies between the anchors 7 and 14; the median has to fall between them
    // and not snap back to either one.
    const m7 = valueAtZ("weight", "female", 7, 0)!;
    const m10 = valueAtZ("weight", "female", 10, 0)!;
    const m14 = valueAtZ("weight", "female", 14, 0)!;
    expect(m10).toBeGreaterThan(m7);
    expect(m10).toBeLessThan(m14);
  });
});
