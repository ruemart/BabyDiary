/**
 * Zeit-Helfer. Alles wird als UTC gespeichert und in einer IANA-Zone dargestellt.
 *
 * WARUM DIESE DATEI EXISTIERT: Tagesgrenzen dürfen NICHT über `getTime() / 86400000`
 * gerechnet werden. Am 26.10. hat der Tag in Europe/Berlin 25 Stunden, am 29.03. nur 23.
 * Wer in Epoch-Millisekunden rechnet, verschiebt genau die Nachtmahlzeiten um eine Stunde
 * über die Zeitumstellung — also exakt die Daten, die in den Auswertungen interessieren.
 * Deshalb läuft jede Tag-/Uhrzeit-Zuordnung über Intl.DateTimeFormat mit fester Zone.
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

/** Zerlegt einen UTC-Zeitstempel in die Wanduhr-Bestandteile der Zielzone. */
export function localParts(iso: string | Date, timeZone: string): LocalParts {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const parts = formatter(timeZone).formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === t)?.value ?? "0");
  // en-CA liefert "24" für Mitternacht in manchen Runtimes — auf 0 normalisieren.
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

/** Der Kalendertag in der Zielzone, als "YYYY-MM-DD" — der Gruppierungsschlüssel. */
export function localDayKey(iso: string | Date, timeZone: string): string {
  const p = localParts(iso, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Minuten seit lokaler Mitternacht (0…1439) — die y-Achse des Rhythmus-Diagramms. */
export function minutesIntoLocalDay(iso: string | Date, timeZone: string): number {
  const p = localParts(iso, timeZone);
  return p.hour * 60 + p.minute;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/* ── Kalenderdatum-Arithmetik (DST-frei, weil auf UTC-Mittag verankert) ─────── */

/**
 * Verankert "YYYY-MM-DD" auf 12:00 UTC. Der Mittag ist bewusst gewählt: er liegt weit
 * genug von jeder Zonengrenze entfernt, dass ±14 h Offset den Kalendertag nie kippen.
 */
function anchor(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d, 12, 0, 0);
}

function fromAnchor(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Ganze Kalendertage zwischen zwei "YYYY-MM-DD" (b − a). Immun gegen Zeitumstellung. */
export function daysBetween(a: string, b: string): number {
  return Math.round((anchor(b) - anchor(a)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  return fromAnchor(anchor(date) + days * 86_400_000);
}

/**
 * Addiert Kalendermonate. Läuft ein Tag über das Monatsende hinaus (31.01. + 1 Monat),
 * wird auf den letzten Tag des Zielmonats geklemmt statt in den Folgemonat zu rutschen.
 * Wichtig für die U-Fenster, die in Lebensmonaten definiert sind.
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
 * Wochentag als 0 = Montag … 6 = Sonntag.
 *
 * Nicht `getDay()` (0 = Sonntag): Hier fängt die Woche am Montag an, wie überall in
 * Deutschland. Ein rohes `getDay()` würde den Sonntag an den Wochenanfang setzen und
 * die Wochenauswahl im Verlauf um einen Tag verschieben.
 */
export function weekdayIndex(date: string): number {
  return (new Date(anchor(date)).getUTCDay() + 6) % 7;
}

/** Montag der Woche, in der `date` liegt. */
export function startOfWeek(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

/* ── Lebensalter ────────────────────────────────────────────────────────────── */

/** Vollendete Lebenstage am Zeitpunkt `at`. Geburtstag = Tag 0. */
export function ageInDays(birthDate: string, at: string | Date, timeZone: string): number {
  return daysBetween(birthDate, localDayKey(at, timeZone));
}

/**
 * Lebenswoche. Die ersten sieben Tage sind Woche 0 — dieselbe Zählung, die auch der
 * Zeitstrahl und die Wochenfotos benutzen.
 */
export function lifeWeek(birthDate: string, at: string | Date, timeZone: string): number {
  return Math.floor(ageInDays(birthDate, at, timeZone) / 7);
}

/** Erster Kalendertag einer Lebenswoche. */
export function lifeWeekStart(birthDate: string, week: number): string {
  return addDays(birthDate, week * 7);
}

/**
 * Lebenswoche relativ zum errechneten Termin — die Zählung der Entwicklungssprünge.
 * Bei einem Frühchen ist das kleiner als die Lebenswoche ab Geburt, bei einer späten
 * Geburt größer. Fällt auf das Geburtsdatum zurück, wenn kein ET hinterlegt ist.
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
 * Sprache für alle Datums- und Zeitangaben.
 *
 * Modulweit statt als Parameter an 23 Aufrufstellen: Die Anzeigesprache ist eine
 * einzige Eigenschaft der laufenden Anwendung, kein Merkmal des einzelnen Aufrufs.
 * Wird beim Sprachwechsel einmal gesetzt.
 */
let displayLocale = "en";

export function setDisplayLocale(locale: string): void {
  displayLocale = locale;
}

export function getDisplayLocale(): string {
  return displayLocale;
}

/**
 * Verstrichene Zeit, in Bestandteile zerlegt — OHNE Worte.
 *
 * Absichtlich kein fertiger Text: "vor 2 Std 15 Min" ist eine Formulierung, und
 * Formulierungen gehören in die Sprachdateien, nicht in ein Modul, das auch der Server
 * benutzt. Wer eine Sprache ergänzt, soll eine JSON-Datei anlegen müssen und nicht
 * hier im Code suchen.
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
 * Uhrzeit in der Zielzone — in der Schreibweise der eingestellten Sprache.
 *
 * Also "22:08" im Deutschen und "10:08 PM" im amerikanischen Englisch. Die Versuchung
 * wäre groß, überall die 24-Stunden-Zählung zu erzwingen, weil sie nachts schmaler und
 * eindeutiger ist — aber wer eine Uhrzeit in der ihm fremden Schreibweise liest,
 * verrechnet sich, und das ist der teurere Fehler.
 */
export function localTimeLabel(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat(displayLocale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

/** Wochentag und Tag, kurz: "Mo., 4. Aug." bzw. "Mon, Aug 4". */
export function localDateLabel(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat(displayLocale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

/**
 * Vollständiges Datum aus einem reinen Kalendertag: "4. Aug. 2026" bzw. "Aug 4, 2026".
 *
 * Der Tag wird auf 12:00 UTC verankert — derselbe Grund wie bei `anchor()`: So kippt
 * keine Zeitzone den Kalendertag.
 */
export function calendarDateLabel(date: string): string {
  return new Intl.DateTimeFormat(displayLocale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(anchor(date)));
}

/** Nur Tag und Monat, für enge Stellen: "4. Aug." bzw. "Aug 4". */
export function shortDateLabel(date: string): string {
  return new Intl.DateTimeFormat(displayLocale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(anchor(date)));
}
