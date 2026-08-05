import { createI18n } from "vue-i18n";
import { setDisplayLocale } from "@babymonitor/shared";
import en from "./locales/en.json";
import de from "./locales/de.json";

/**
 * The app's languages.
 *
 * English is the fallback: if a key is missing from a translation, the English text
 * appears instead of a raw key. For someone adding a language that means you can start
 * with a half-finished file and the app stays usable.
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
 * Take the device language on first start, the chosen one afterwards.
 *
 * English is the default for everyone whose language we do not have — but showing
 * someone with a German phone an English app first, when the German one exists, would be
 * an unnecessary hurdle at the worst possible moment.
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
  // A missing translation is a hint while developing and just noise in production.
  missingWarn: import.meta.env.DEV,
  fallbackWarn: import.meta.env.DEV,
});

/**
 * Switch the language — everywhere.
 *
 * Three things hang off it that are easy to overlook: the date and time formats in the
 * shared module, the document's `lang` attribute (screen readers and hyphenation follow
 * it) and the stored choice.
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

/** Apply once at startup so the document and the time formats follow along. */
setLocale(i18n.global.locale.value as LocaleCode);
