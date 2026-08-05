import { createI18n } from "vue-i18n";
import { setDisplayLocale } from "@babymonitor/shared";
import en from "./locales/en.json";
import de from "./locales/de.json";

/**
 * Sprachen der App.
 *
 * Englisch ist die Rückfallsprache: Fehlt ein Schlüssel in einer Übersetzung,
 * erscheint der englische Text statt eines rohen Schlüssels. Für jemanden, der eine
 * Sprache ergänzt, heißt das: Man kann mit einer halb fertigen Datei anfangen und die
 * App bleibt benutzbar.
 */
export const LOCALES = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
] as const;

export type LocaleCode = (typeof LOCALES)[number]["code"];

const STORAGE_KEY = "bm.locale";
const FALLBACK: LocaleCode = "en";

function isSupported(code: string): code is LocaleCode {
  return LOCALES.some((l) => l.code === code);
}

/**
 * Beim ersten Start die Sprache des Geräts übernehmen, danach die gewählte.
 *
 * Englisch ist die Vorgabe für alle, deren Sprache wir nicht haben — aber jemandem mit
 * deutschem Telefon zuerst eine englische App zu zeigen, obwohl es die deutsche gibt,
 * wäre eine unnötige Hürde am unpassendsten Moment.
 */
export function initialLocale(): LocaleCode {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && isSupported(saved)) return saved;

  for (const wanted of navigator.languages ?? [navigator.language]) {
    const base = wanted.split("-")[0]!;
    if (isSupported(base)) return base;
  }
  return FALLBACK;
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: FALLBACK,
  messages: { en, de },
  // Eine fehlende Übersetzung ist beim Entwickeln ein Hinweis, im Betrieb nur Lärm.
  missingWarn: import.meta.env.DEV,
  fallbackWarn: import.meta.env.DEV,
});

/**
 * Sprache wechseln — und zwar überall.
 *
 * Drei Dinge hängen mit dran, die man leicht übersieht: die Datums- und Zeitformate im
 * gemeinsamen Modul, das `lang`-Attribut des Dokuments (Vorlesehilfen und die
 * Silbentrennung richten sich danach) und die gespeicherte Wahl.
 */
export function setLocale(code: LocaleCode): void {
  i18n.global.locale.value = code;
  setDisplayLocale(code);
  document.documentElement.lang = code;
  localStorage.setItem(STORAGE_KEY, code);
}

export function currentLocale(): LocaleCode {
  return i18n.global.locale.value as LocaleCode;
}

/** Beim Start einmal anwenden, damit Dokument und Zeitformate mitziehen. */
setLocale(i18n.global.locale.value as LocaleCode);
