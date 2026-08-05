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

    /** milestone / photo / illness / absence */
    label: z.string().max(200).nullable().default(null),
    /**
     * Verweis auf einen Eintrag der festen Meilenstein-Liste.
     *
     * Freitext war der falsche Ansatz: Man kann nur abhaken, was man kennt — und die
     * Meilensteine erst nachschlagen zu müssen, um sie eintragen zu können, stellt
     * die Sache auf den Kopf.
     */
    milestoneKey: z.string().max(64).nullable().default(null),
    /** illness: Fieber in Zehntelgrad (385 = 38,5 °C). */
    temperatureDc: z.number().int().min(300).max(430).nullable().default(null),
    /**
     * absence: Wo ihr in dieser Zeit wart.
     *
     * Für die abgedeckten Tage holt der Server das Wetter von HIER statt vom
     * Heimatort. Damit braucht es keine tägliche Ortsangabe — der Urlaubs-Eintrag
     * hat Anfang und Ende ohnehin schon.
     */
    latitude: z.number().min(-90).max(90).nullable().default(null),
    longitude: z.number().min(-180).max(180).nullable().default(null),
    placeName: z.string().max(120).nullable().default(null),

    /**
     * supply: Was wir kaufen.
     *
     * Der jeweils NEUESTE Eintrag je Kategorie ist der aktuelle Stand, alle älteren
     * sind automatisch die Wechsel-Historie — "seit wann Größe 3?" beantwortet sich
     * dadurch von selbst. Bei Milchnahrung ist genau dieser Verlauf der Punkt: Ein
     * Markenwechsel soll nicht beiläufig passieren, und wenn etwas nicht bekommt,
     * will man wissen, was und ab wann.
     */
    supplyCategory: z.enum(SUPPLY_CATEGORIES).nullable().default(null),
    supplySize: z.string().max(60).nullable().default(null),
    supplyShop: z.string().max(80).nullable().default(null),

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
        // Kein Pflicht-Ende: Ein Urlaub, der gerade läuft, hat noch keines. Beendet
        // wird er über "Läuft gerade" auf dem Startbildschirm — genau wie Schlaf.
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
  /** Ort für die Wetterabfrage. Ohne Angabe bleibt die Wetterspur leer. */
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  placeName: z.string().max(120).nullable().default(null),
  editedAt: isoDateTime,
});
export type Child = z.infer<typeof childSchema>;

/* ── Sync-Protokoll ─────────────────────────────────────────────────────────── */

/**
 * Der Umschlag wird zuerst geprüft, die einzelnen Einträge danach getrennt.
 *
 * Absichtlich `unknown` für `changes`: Ein einziger fehlerhafter Eintrag darf nicht das
 * gesamte Paket zu Fall bringen — sonst blockiert er den Abgleich dauerhaft, weil der
 * Ausgangskorb des Geräts sich nie leert und jeder danach angelegte Eintrag mit
 * liegenbleibt. Der Server prüft jeden Eintrag einzeln und meldet die schlechten zurück.
 */
export const syncEnvelopeSchema = z.object({
  childId: z.string().min(1).max(64),
  /** Höchste bereits bekannte `rev`. 0 = alles holen. */
  since: z.number().int().min(0),
  changes: z.array(z.record(z.unknown())).max(500),
  child: z.record(z.unknown()).nullable().default(null),
});
export type SyncEnvelope = z.infer<typeof syncEnvelopeSchema>;

/** Ein Eintrag, den der Server dauerhaft nicht annehmen kann. */
export type InvalidEntry = { id: string; reason: string };

export type SyncResponse = {
  /** Neue Höchstmarke — beim nächsten Mal als `since` schicken. */
  rev: number;
  entries: StoredEntry[];
  child: Child | null;
  /** Ids, die der Server verworfen hat, weil seine Version neuer war (LWW). */
  rejected: string[];
  /**
   * Einträge, die dem Schema widersprechen. Anders als `rejected` hilft hier kein
   * erneuter Versuch — das Gerät muss sie aus dem Ausgangskorb nehmen und melden.
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
