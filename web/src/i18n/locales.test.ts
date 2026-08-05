import { describe, expect, it } from "vitest";
import en from "./locales/en.json";
import de from "./locales/de.json";

/**
 * Die Sprachdateien gegeneinander prüfen.
 *
 * Englisch ist die Rückfallsprache: Ein Schlüssel, der dort fehlt, erscheint im
 * schlimmsten Fall als roher Punktpfad auf dem Bildschirm — genau das, was eine
 * Übersetzung verhindern soll. Umgekehrt ist ein Schlüssel, den nur eine Sprache hat,
 * fast immer ein Überbleibsel: Er wurde umbenannt und die andere Datei nicht mitgezogen.
 *
 * Läuft auch im CI, weil beides beim Übersetzen leicht passiert und beim Lesen einer
 * 700-Zeilen-JSON niemandem auffällt.
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
    // {name} wird vom Code gefüllt. Wer ihn wegübersetzt, bekommt einen Satz mit
    // einer Lücke — und das fällt erst dem Benutzer auf.
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
