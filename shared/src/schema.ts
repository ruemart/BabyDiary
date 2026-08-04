import { z } from "zod";

/**
 * Ein einziges Eintrags-Schema für alle Typen, diskriminiert über `type`.
 *
 * Bewusst flach gehalten (statt einer discriminated union), weil die Zeile 1:1 auf die
 * SQLite-Tabelle abgebildet wird — das erspart eine Mapping-Schicht in beide Richtungen.
 * Die typabhängigen Pflichtfelder erzwingt `superRefine` weiter unten.
 */

export const ENTRY_TYPES = [
  "feed",
  "diaper",
  "sleep",
  "growth",
  "milestone",
  "note",
  "photo",
] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const DIAPER_KINDS = ["empty", "wet", "soiled", "both"] as const;
export type DiaperKind = (typeof DIAPER_KINDS)[number];

export const SEXES = ["female", "male"] as const;
export type Sex = (typeof SEXES)[number];

/** ISO-8601 mit Zeitzonen-Offset oder Z. Wir speichern immer UTC. */
const isoDateTime = z
  .string()
  .datetime({ offset: true })
  .describe("ISO-8601 Zeitstempel in UTC");

/** Reines Kalenderdatum, YYYY-MM-DD, in lokaler Zeit gemeint (Geburtstag, ET). */
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Erwartet YYYY-MM-DD");

export const entrySchema = z
  .object({
    id: z.string().min(1).max(64),
    childId: z.string().min(1).max(64),
    type: z.enum(ENTRY_TYPES),

    /** Zeitpunkt des Ereignisses (nicht der Erfassung!) — frei wählbar zum Nachtragen. */
    startedAt: isoDateTime,
    /** Nur bei `sleep`: Ende. Null solange der Schlaf noch läuft. */
    endedAt: isoDateTime.nullable().default(null),

    /** feed */
    amountMl: z.number().int().min(0).max(2000).nullable().default(null),
    /**
     * Vollständig wieder ausgespuckt.
     *
     * Die Mahlzeit bleibt als Ereignis bestehen — sie hat getrunken, und der Zeitpunkt
     * zählt für den Rhythmus und für "wann war die letzte Flasche". Nur die Milliliter
     * gehen nicht in die Tagesmenge ein, sonst weist die Auswertung eine Aufnahme aus,
     * die nie im Kind angekommen ist.
     */
    spatUp: z.boolean().default(false),
    /** diaper */
    diaper: z.enum(DIAPER_KINDS).nullable().default(null),

    /** growth — in Gramm bzw. Millimetern, damit keine Fließkomma-Rundung auftritt */
    weightG: z.number().int().min(0).max(60000).nullable().default(null),
    lengthMm: z.number().int().min(0).max(2000).nullable().default(null),
    headMm: z.number().int().min(0).max(1000).nullable().default(null),

    /** milestone / photo */
    label: z.string().max(200).nullable().default(null),
    /** photo: die Lebenswoche, für die das Foto zählt (0 = erste Lebenswoche) */
    lifeWeek: z.number().int().min(0).max(1000).nullable().default(null),
    mediaId: z.string().max(64).nullable().default(null),

    note: z.string().max(4000).nullable().default(null),

    /** Anzeigename des Geräts, das den Eintrag angelegt hat ("Mama"/"Papa"). */
    createdBy: z.string().min(1).max(40),
    /**
     * Client-Zeitpunkt der letzten Änderung. Entscheidet Konflikte (Last-Write-Wins).
     * Bewusst NICHT der Server-Zeitstempel: der Client kann offline editieren.
     */
    editedAt: isoDateTime,
    deleted: z.boolean().default(false),
  })
  .superRefine((e, ctx) => {
    const require = (cond: boolean, path: string, message: string) => {
      if (!cond) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    };

    switch (e.type) {
      case "feed":
        require(e.amountMl !== null, "amountMl", "Trinkmenge fehlt");
        break;
      case "diaper":
        require(e.diaper !== null, "diaper", "Windelart fehlt");
        break;
      case "sleep":
        if (e.endedAt !== null) {
          require(
            Date.parse(e.endedAt) > Date.parse(e.startedAt),
            "endedAt",
            "Schlafende liegt vor dem Beginn",
          );
        }
        break;
      case "growth":
        require(
          e.weightG !== null || e.lengthMm !== null || e.headMm !== null,
          "weightG",
          "Mindestens ein Messwert (Gewicht, Länge oder Kopfumfang) nötig",
        );
        break;
      case "milestone":
        require(!!e.label?.trim(), "label", "Bezeichnung fehlt");
        break;
      case "photo":
        require(!!e.mediaId, "mediaId", "Bild fehlt");
        require(e.lifeWeek !== null, "lifeWeek", "Lebenswoche fehlt");
        break;
      case "note":
        require(!!e.note?.trim(), "note", "Notiz ist leer");
        break;
    }
  });

export type Entry = z.infer<typeof entrySchema>;
/** Was der Server zusätzlich vergibt — der Sync-Cursor. */
export type StoredEntry = Entry & { rev: number };

export const childSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  sex: z.enum(SEXES),
  birthDate: calendarDate,
  /**
   * Errechneter Geburtstermin. Die Entwicklungssprünge rechnen ab HIER, nicht ab
   * `birthDate` — bei einem Frühchen verschiebt das den ganzen Zeitstrahl um Wochen.
   */
  dueDate: calendarDate.nullable().default(null),
  birthWeightG: z.number().int().min(0).max(10000).nullable().default(null),
  birthLengthMm: z.number().int().min(0).max(1000).nullable().default(null),
  birthHeadMm: z.number().int().min(0).max(1000).nullable().default(null),
  /** IANA-Zone; steuert Tagesgrenzen und Uhrzeit-Achsen in den Auswertungen. */
  timezone: z.string().min(1).max(64).default("Europe/Berlin"),
  editedAt: isoDateTime,
});
export type Child = z.infer<typeof childSchema>;

/* ── Sync-Protokoll ─────────────────────────────────────────────────────────── */

export const syncRequestSchema = z.object({
  childId: z.string().min(1).max(64),
  /** Höchste bereits bekannte `rev`. 0 = alles holen. */
  since: z.number().int().min(0),
  changes: z.array(entrySchema).max(500),
  child: childSchema.nullable().default(null),
});
export type SyncRequest = z.infer<typeof syncRequestSchema>;

export type SyncResponse = {
  /** Neue Höchstmarke — beim nächsten Mal als `since` schicken. */
  rev: number;
  entries: StoredEntry[];
  child: Child | null;
  /** Ids, die der Server verworfen hat, weil seine Version neuer war (LWW). */
  rejected: string[];
};
