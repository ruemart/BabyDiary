/**
 * Time helpers. Everything is stored as UTC and displayed in an IANA zone.
 *
 * WHY THIS FILE EXISTS: day boundaries must NOT be computed with `getTime() / 86400000`.
 * On 26 October a day in Europe/Berlin has 25 hours, on 29 March only 23. Computing in
 * epoch milliseconds shifts exactly the night feeds by an hour across the changeover —
 * precisely the data the charts are about. So every day/time mapping goes through
 * Intl.DateTimeFormat with a fixed zone.
 */

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

export type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** Splits a UTC timestamp into the wall-clock parts of the target zone. */
export function localParts(iso: string | Date, timeZone: string): LocalParts {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const parts = formatter(timeZone).formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === t)?.value ?? "0");
  // en-CA reports "24" for midnight in some runtimes — normalise it to 0.
  const hour = get("hour") % 24;
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
    second: get("second"),
  };
}

/** The calendar day in the target zone as "YYYY-MM-DD" — the grouping key. */
export function localDayKey(iso: string | Date, timeZone: string): string {
  const p = localParts(iso, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Minutes since local midnight (0…1439) — the y-axis of the rhythm chart. */
export function minutesIntoLocalDay(iso: string | Date, timeZone: string): number {
  const p = localParts(iso, timeZone);
  return p.hour * 60 + p.minute;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/* ── Calendar-date arithmetic (DST-free, anchored at UTC noon) ──────────────── */

/**
 * Anchors "YYYY-MM-DD" at 12:00 UTC. Noon is chosen deliberately: it sits far enough
 * from any zone boundary that a ±14 h offset can never tip the calendar day.
 */
function anchor(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d, 12, 0, 0);
}

function fromAnchor(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Whole calendar days between two "YYYY-MM-DD" (b − a). Immune to clock changes. */
export function daysBetween(a: string, b: string): number {
  return Math.round((anchor(b) - anchor(a)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  return fromAnchor(anchor(date) + days * 86_400_000);
}

/**
 * Adds calendar months. If a day runs past the end of the month (31 Jan + 1 month) it
 * is clamped to the last day of the target month rather than sliding into the next one.
 * Matters for the check-up windows, which are defined in months of life.
 */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1, 12, 0, 0));
  const lastDayOfTarget = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12, 0, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDayOfTarget));
  return fromAnchor(target.getTime());
}

/* ── Kalenderwochen ─────────────────────────────────────────────────────────── */

/**
 * Weekday as 0 = Monday … 6 = Sunday.
 *
 * Not `getDay()` (0 = Sunday): here the week starts on Monday. A raw `getDay()` would
 * put Sunday at the start of the week and shift the week picker in the history by a day.
 */
export function weekdayIndex(date: string): number {
  return (new Date(anchor(date)).getUTCDay() + 6) % 7;
}

/** The Monday of the week that `date` falls in. */
export function startOfWeek(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

/* ── Lebensalter ────────────────────────────────────────────────────────────── */

/** Completed days of life at moment `at`. The birthday is day 0. */
export function ageInDays(birthDate: string, at: string | Date, timeZone: string): number {
  return daysBetween(birthDate, localDayKey(at, timeZone));
}

/**
 * Week of life. The first seven days are week 0 — the same counting the timeline and
 * the weekly photos use.
 */
export function lifeWeek(birthDate: string, at: string | Date, timeZone: string): number {
  return Math.floor(ageInDays(birthDate, at, timeZone) / 7);
}

/** Erster Kalendertag einer Lebenswoche. */
export function lifeWeekStart(birthDate: string, week: number): string {
  return addDays(birthDate, week * 7);
}

/**
 * Week of life relative to the due date — the counting the developmental leaps use.
 * For a premature baby this is smaller than the week counted from birth, for a late
 * birth larger. Falls back to the date of birth when no due date is recorded.
 */
export function correctedWeek(
  dueDate: string | null,
  birthDate: string,
  at: string | Date,
  timeZone: string,
): number {
  return Math.floor(daysBetween(dueDate ?? birthDate, localDayKey(at, timeZone)) / 7);
}

/* ── Anzeige ────────────────────────────────────────────────────────────────── */

/**
 * Language for all dates and times.
 *
 * Module-wide rather than a parameter at 23 call sites: the display language is a single
 * property of the running application, not a trait of the individual call. Set once when
 * the language changes.
 */
let displayLocale = "en";

export function setDisplayLocale(locale: string): void {
  displayLocale = locale;
}

export function getDisplayLocale(): string {
  return displayLocale;
}

/**
 * Elapsed time, broken into parts — WITHOUT words.
 *
 * Deliberately not a finished string: "2 h 15 min ago" is a phrasing, and phrasings
 * belong in the language files, not in a module the server also uses. Adding a language
 * should mean writing a JSON file, not hunting through code.
 */
export type Elapsed =
  | { unit: "now" }
  | { unit: "minutes"; minutes: number }
  | { unit: "hours"; hours: number }
  | { unit: "hoursMinutes"; hours: number; minutes: number }
  | { unit: "days"; days: number };

export function elapsedSince(iso: string, now: Date = new Date()): Elapsed {
  const total = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (total < 1) return { unit: "now" };
  if (total < 60) return { unit: "minutes", minutes: total };

  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours < 24) {
    return minutes === 0 ? { unit: "hours", hours } : { unit: "hoursMinutes", hours, minutes };
  }
  return { unit: "days", days: Math.floor(hours / 24) };
}

/**
 * Time of day in the target zone — written the way the chosen language writes it.
 *
 * So "22:08" in German and "10:08 PM" in US English. It would be tempting to force the
 * 24-hour clock everywhere because it is narrower and less ambiguous at night — but
 * someone reading a time in a notation foreign to them miscalculates, and that is the
 * more expensive mistake.
 */
export function localTimeLabel(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat(displayLocale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

/** Weekday and day, short: "Mo., 4. Aug." or "Mon, Aug 4". */
export function localDateLabel(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat(displayLocale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

/**
 * A full date from a plain calendar day: "4 Aug 2026" or "Aug 4, 2026".
 *
 * The day is anchored at 12:00 UTC — same reason as in `anchor()`: no time zone can
 * tip the calendar day.
 */
export function calendarDateLabel(date: string): string {
  return new Intl.DateTimeFormat(displayLocale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(anchor(date)));
}

/** Day and month only, for tight spots: "4 Aug" or "Aug 4". */
export function shortDateLabel(date: string): string {
  return new Intl.DateTimeFormat(displayLocale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(anchor(date)));
}
