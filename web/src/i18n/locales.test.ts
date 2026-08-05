import { describe, expect, it } from "vitest";
import en from "./locales/en.json";
import de from "./locales/de.json";

/**
 * Check the language files against each other.
 *
 * English is the fallback language: a key missing there appears, in the worst case, as a
 * raw dotted path on screen — exactly what a translation is meant to prevent. The other
 * way round, a key only one language has is almost always a leftover: it was renamed and
 * the other file was not carried along.
 *
 * Runs in CI too, because both happen easily while translating and nobody spots them
 * reading a 700-line JSON file.
 */

function flatten(tree: unknown, prefix = ""): string[] {
  if (typeof tree !== "object" || tree === null) return [prefix];
  return Object.entries(tree).flatMap(([key, value]) =>
    flatten(value, prefix ? `${prefix}.${key}` : key),
  );
}

const enKeys = flatten(en).sort();
const deKeys = flatten(de).sort();

describe("Sprachdateien", () => {
  it("hat in jeder Sprache dieselben Schlüssel", () => {
    expect(deKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
    expect(enKeys.filter((k) => !deKeys.includes(k))).toEqual([]);
  });

  it("hat nirgends einen leeren Text", () => {
    const empty = (tree: unknown, prefix = ""): string[] => {
      if (typeof tree === "string") return tree.trim() ? [] : [prefix];
      if (typeof tree !== "object" || tree === null) return [];
      return Object.entries(tree).flatMap(([k, v]) =>
        empty(v, prefix ? `${prefix}.${k}` : k),
      );
    };
    expect(empty(en)).toEqual([]);
    expect(empty(de)).toEqual([]);
  });

  it("behält die Platzhalter jeder Übersetzung bei", () => {
    // {name} is filled in by the code. Translating it away leaves a sentence with a
    // hole in it — and only the user notices.
    const placeholders = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

    const value = (tree: unknown, path: string[]): unknown =>
      path.reduce<unknown>((node, k) => (node as Record<string, unknown>)?.[k], tree);

    const abweichungen: string[] = [];
    for (const key of enKeys) {
      const a = value(en, key.split("."));
      const b = value(de, key.split("."));
      if (typeof a !== "string" || typeof b !== "string") continue;
      if (placeholders(a).join() !== placeholders(b).join()) abweichungen.push(key);
    }
    expect(abweichungen).toEqual([]);
  });

  it("hat in beiden Sprachen gleich viele Pluralformen", () => {
    const forms = (text: string) => text.split("|").length;
    const value = (tree: unknown, path: string[]): unknown =>
      path.reduce<unknown>((node, k) => (node as Record<string, unknown>)?.[k], tree);

    const abweichungen: string[] = [];
    for (const key of enKeys) {
      const a = value(en, key.split("."));
      const b = value(de, key.split("."));
      if (typeof a !== "string" || typeof b !== "string") continue;
      if (forms(a) !== forms(b)) abweichungen.push(key);
    }
    expect(abweichungen).toEqual([]);
  });
});
