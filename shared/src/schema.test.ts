import { describe, expect, it } from "vitest";
import { entrySchema } from "./schema.ts";

/**
 * The rules a medicine has to obey.
 *
 * Checked here rather than only in the sheet that fills the form in, because the server
 * validates every entry it is sent — a second device on an older version, or a rewritten
 * request, must not be able to store a plan that contradicts itself.
 */

const base = {
  id: "a",
  childId: "child-1",
  startedAt: "2026-08-16T08:00:00.000Z",
  createdBy: "Mama",
  editedAt: "2026-08-16T08:00:00.000Z",
};

const parse = (over: Record<string, unknown>) => entrySchema.safeParse({ ...base, ...over });

const reasons = (result: ReturnType<typeof parse>) =>
  result.success ? [] : result.error.issues.map((i) => i.path.join("."));

describe("A medicine on the list", () => {
  it("needs a name and a unit", () => {
    expect(reasons(parse({ type: "medicineplan" }))).toEqual(
      expect.arrayContaining(["label", "medicineUnit"]),
    );
    expect(
      parse({ type: "medicineplan", label: "BiGaia", medicineUnit: "drops" }).success,
    ).toBe(true);
  });

  /** As needed and no ceiling: both numbers may simply be absent. */
  it("needs neither a daily number nor a ceiling", () => {
    const result = parse({
      type: "medicineplan",
      label: "Simeticon",
      medicineUnit: "drops",
      medicineTimesPerDay: null,
      medicineMaxPerDay: null,
    });
    expect(result.success).toBe(true);
  });

  it("takes a ceiling without a daily number — the case it was added for", () => {
    const result = parse({
      type: "medicineplan",
      label: "Simeticon",
      medicineUnit: "drops",
      medicineTimesPerDay: null,
      medicineMaxPerDay: 6,
    });
    expect(result.success).toBe(true);
  });

  /**
   * Otherwise every single day would be both due and forbidden — and the guard in the
   * bottle sheet, which follows the ceiling, would lock a tick the plan demands.
   */
  it("refuses a ceiling below the planned number", () => {
    expect(
      reasons(
        parse({
          type: "medicineplan",
          label: "Paracetamol",
          medicineUnit: "ml",
          medicineTimesPerDay: 3,
          medicineMaxPerDay: 2,
        }),
      ),
    ).toContain("medicineMaxPerDay");
  });

  it("allows a ceiling above the planned number, and one equal to it", () => {
    for (const max of [3, 4]) {
      const result = parse({
        type: "medicineplan",
        label: "Paracetamol",
        medicineUnit: "ml",
        medicineTimesPerDay: 3,
        medicineMaxPerDay: max,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("A dose that was given", () => {
  it("has to say which medicine, by id and by name", () => {
    expect(reasons(parse({ type: "medicine" }))).toEqual(
      expect.arrayContaining(["medicineId", "label"]),
    );
  });

  /**
   * The name is what keeps the history readable once the medicine is off the list, so
   * the id alone is not enough.
   */
  it("is not enough with only the id", () => {
    expect(reasons(parse({ type: "medicine", medicineId: "plan-1" }))).toContain("label");
    expect(parse({ type: "medicine", medicineId: "plan-1", label: "BiGaia" }).success).toBe(true);
  });

  /** The old flags never recorded an amount, and neither does every household. */
  it("may leave the amount unstated", () => {
    const result = parse({
      type: "medicine",
      medicineId: "plan-1",
      label: "Vitamin D",
      medicineAmount: null,
      medicineUnit: null,
    });
    expect(result.success).toBe(true);
  });
});
