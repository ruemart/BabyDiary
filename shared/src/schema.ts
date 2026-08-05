import { z } from "zod";

/**
 * A single entry schema for every type, discriminated by `type`.
 *
 * Deliberately kept flat (rather than a discriminated union) because the row maps 1:1
 * onto the SQLite table — which saves a mapping layer in both directions. The
 * type-dependent required fields are enforced by `superRefine` further down.
 */

export const ENTRY_TYPES = [
  "feed",
  "diaper",
  "sleep",
  "growth",
  "milestone",
  "note",
  "photo",
  "illness",
  "absence",
  "supply",
  "bath",
] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const DIAPER_KINDS = ["empty", "wet", "soiled", "both"] as const;
export type DiaperKind = (typeof DIAPER_KINDS)[number];

export const SUPPLY_CATEGORIES = ["formula", "diaper", "other"] as const;
export type SupplyCategory = (typeof SUPPLY_CATEGORIES)[number];

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

    /** When the event happened (not when it was recorded!) — freely chosen when adding later. */
    startedAt: isoDateTime,
    /** Only for `sleep`: the end. Null while the sleep is still running. */
    endedAt: isoDateTime.nullable().default(null),

    /** feed */
    amountMl: z.number().int().min(0).max(2000).nullable().default(null),
    /**
     * Brought all of it back up.
     *
     * The feed remains as an event — she did drink, and the moment counts towards the
     * rhythm and towards "when was the last bottle". Only the millilitres stay out of
     * the daily total; otherwise the charts would report an intake that never made it
     * into the child.
     */
    spatUp: z.boolean().default(false),
    /**
     * Vitamin D given with this feed.
     *
     * The daily prophylaxis has no occasion of its own — it hangs off a feed. Hence a
     * flag on the entry rather than a type of its own: it gets recorded where it
     * actually happens, and the app can say whether it has been done today.
     */
    vitaminD: z.boolean().default(false),
    /** diaper */
    diaper: z.enum(DIAPER_KINDS).nullable().default(null),

    /** growth — in Gramm bzw. Millimetern, damit keine Fließkomma-Rundung auftritt */
    weightG: z.number().int().min(0).max(60000).nullable().default(null),
    lengthMm: z.number().int().min(0).max(2000).nullable().default(null),
    headMm: z.number().int().min(0).max(1000).nullable().default(null),

    /** milestone / photo / illness / absence */
    label: z.string().max(200).nullable().default(null),
    /**
     * Reference to an entry in the fixed milestone list.
     *
     * Free text was the wrong approach: you can only tick off what you know — and
     * having to look the milestones up before you can record them puts the whole thing
     * back to front.
     */
    milestoneKey: z.string().max(64).nullable().default(null),
    /** illness: Fieber in Zehntelgrad (385 = 38,5 °C). */
    temperatureDc: z.number().int().min(300).max(430).nullable().default(null),
    /**
     * absence: where you were during that time.
     *
     * For the days it covers the server fetches the weather from HERE instead of from
     * home. That removes the need for a daily location — the away entry already has a
     * start and an end.
     */
    latitude: z.number().min(-90).max(90).nullable().default(null),
    longitude: z.number().min(-180).max(180).nullable().default(null),
    placeName: z.string().max(120).nullable().default(null),

    /**
     * supply: what we buy.
     *
     * The NEWEST entry per category is the current one; all older ones are automatically
     * the switch history — which answers "since when size 3?" by itself. For formula
     * that history is the entire point: a brand change should not happen casually, and
     * if something disagrees with her, you want to know what changed and when.
     */
    supplyCategory: z.enum(SUPPLY_CATEGORIES).nullable().default(null),
    supplySize: z.string().max(60).nullable().default(null),
    supplyShop: z.string().max(80).nullable().default(null),

    /** photo: the week of life the photo counts for (0 = first week of life) */
    lifeWeek: z.number().int().min(0).max(1000).nullable().default(null),
    mediaId: z.string().max(64).nullable().default(null),

    note: z.string().max(4000).nullable().default(null),

    /** Anzeigename des Geräts, das den Eintrag angelegt hat ("Mama"/"Papa"). */
    createdBy: z.string().min(1).max(40),
    /**
     * Client time of the last change. Decides conflicts (last-write-wins).
     * Deliberately NOT the server timestamp: the client can edit offline.
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
      case "illness":
        if (e.endedAt !== null) {
          require(
            Date.parse(e.endedAt) > Date.parse(e.startedAt),
            "endedAt",
            "Das Ende liegt vor dem Beginn",
          );
        }
        if (e.type === "illness") require(!!e.label?.trim(), "label", "Bezeichnung fehlt");
        break;
      case "growth":
        require(
          e.weightG !== null || e.lengthMm !== null || e.headMm !== null,
          "weightG",
          "Mindestens ein Messwert (Gewicht, Länge oder Kopfumfang) nötig",
        );
        break;
      case "milestone":
        require(
          !!e.milestoneKey || !!e.label?.trim(),
          "milestoneKey",
          "Meilenstein fehlt",
        );
        break;
      case "absence":
        require(!!e.label?.trim(), "label", "Art fehlt");
        // No mandatory end: a holiday that is currently running does not have one yet.
        // It gets ended from "Currently running" on the home screen — just like sleep.
        break;
      case "supply":
        require(e.supplyCategory !== null, "supplyCategory", "Kategorie fehlt");
        require(
          !!e.label?.trim() || !!e.supplySize?.trim(),
          "label",
          "Produkt oder Größe angeben",
        );
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
/** What the server adds on top — the sync cursor. */
export type StoredEntry = Entry & { rev: number };

export const childSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  sex: z.enum(SEXES),
  birthDate: calendarDate,
  /**
   * Due date. The developmental leaps count from HERE, not from `birthDate` — for a
   * premature baby that shifts the whole timeline by weeks.
   */
  dueDate: calendarDate.nullable().default(null),
  birthWeightG: z.number().int().min(0).max(10000).nullable().default(null),
  birthLengthMm: z.number().int().min(0).max(1000).nullable().default(null),
  birthHeadMm: z.number().int().min(0).max(1000).nullable().default(null),
  /** IANA-Zone; steuert Tagesgrenzen und Uhrzeit-Achsen in den Auswertungen. */
  timezone: z.string().min(1).max(64).default("Europe/Berlin"),
  /**
   * The household's country — drives check-ups and the vaccination schedule.
   *
   * Deliberately a free string rather than an enum: a new country is a JSON file in the
   * frontend, and nobody should have to touch the shared schema — and thereby the
   * server — for that. Unknown values fall back to "no appointments" in the app.
   */
  region: z.string().max(8).default("none"),
  /** Location for the weather lookup. Without one the weather track stays empty. */
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  placeName: z.string().max(120).nullable().default(null),
  editedAt: isoDateTime,
});
export type Child = z.infer<typeof childSchema>;

/* ── Sync-Protokoll ─────────────────────────────────────────────────────────── */

/**
 * The envelope is validated first, the individual entries separately afterwards.
 *
 * `changes` is deliberately `unknown`: a single bad entry must not bring down the whole
 * batch — otherwise it blocks syncing permanently, because the device's outbox never
 * drains and every entry created after it is stuck too. The server validates each entry
 * on its own and reports the bad ones back.
 */
export const syncEnvelopeSchema = z.object({
  childId: z.string().min(1).max(64),
  /** Höchste bereits bekannte `rev`. 0 = alles holen. */
  since: z.number().int().min(0),
  changes: z.array(z.record(z.unknown())).max(500),
  child: z.record(z.unknown()).nullable().default(null),
});
export type SyncEnvelope = z.infer<typeof syncEnvelopeSchema>;

/** An entry the server can never accept. */
export type InvalidEntry = { id: string; reason: string };

export type SyncResponse = {
  /** Neue Höchstmarke — beim nächsten Mal als `since` schicken. */
  rev: number;
  entries: StoredEntry[];
  child: Child | null;
  /** Ids the server discarded because its own version was newer (LWW). */
  rejected: string[];
  /**
   * Entries that contradict the schema. Unlike `rejected`, retrying does not help here —
   * the device has to take them out of the outbox and report them.
   */
  invalid: InvalidEntry[];
};

/* ── Wetter ─────────────────────────────────────────────────────────────────── */

export type WeatherDay = {
  /** YYYY-MM-DD, lokaler Kalendertag. */
  day: string;
  /** Höchst- und Tiefsttemperatur in Grad Celsius. */
  tmax: number | null;
  tmin: number | null;
};
