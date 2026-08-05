/**
 * Die Meilenstein-Liste — Erwartung und Abhakliste in einem.
 *
 * EINE Liste, kein zweites Konzept: Dieselben Einträge erscheinen als Erwartung im
 * Wochenband ("erste echte Tränen: ab Woche 4") und als Abhakliste, in der man
 * festhält, wann es tatsächlich so weit war. Man soll nicht wissen müssen, welche
 * Meilensteine es gibt, um sie eintragen zu können.
 *
 * ALLES IN LEBENSWOCHEN, weil die ganze App in Wochen rechnet und der Zeitstrahl
 * ebenfalls. `fromWeek`/`toWeek` ist die Spanne, in der gesunde Kinder diesen Schritt
 * machen — keine Soll-Vorgabe.
 *
 * ZWEI QUALITÄTEN, sichtbar getrennt:
 *
 *  - `source: "who"` — die sechs groben motorischen Meilensteine der WHO Motor
 *    Development Study (Multicentre Growth Reference Study, 816 Kinder aus Ghana,
 *    Indien, Norwegen, Oman und den USA). Die Spanne ist das 1. bis 99. Perzentil,
 *    aus Monaten in Wochen umgerechnet.
 *    https://www.who.int/tools/child-growth-standards/standards/motor-development-milestones
 *
 *  - `source: "typical"` — verbreitete Orientierungswerte aus der Elternliteratur,
 *    wie sie auch in Sprung-Kalendern stehen. Deutlich weicher belegt; sie stehen
 *    hier, weil Eltern sie erwarten, nicht weil sie normiert wären.
 */

export type MilestoneSource = "who" | "typical";
export type MilestoneArea = "sozial" | "motorik" | "sprache" | "koerper";

export type Milestone = {
  key: string;
  /** Beschriftung steht in den Sprachdateien unter `milestone.<key>`. */
  area: MilestoneArea;
  /** Lebenswoche, ab der es üblicherweise vorkommt. */
  fromWeek: number;
  /** Lebenswoche, bis zu der es üblicherweise eingetreten ist. */
  toWeek: number;
  source: MilestoneSource;
  /** Zusatzhinweis, falls vorhanden, unter `milestone.<key>.hint`. */
  hint?: boolean;
};

export const MILESTONES: Milestone[] = [
  {
    key: "eye-contact",
    area: "sozial",
    fromWeek: 2,
    toWeek: 8,
    source: "typical",
  },
  {
    key: "tears",
    area: "koerper",
    fromWeek: 4,
    toWeek: 12,
    source: "typical",
  },
  {
    key: "smile",
    area: "sozial",
    fromWeek: 4,
    toWeek: 12,
    source: "typical",
  },
  {
    key: "follow-eyes",
    area: "sozial",
    fromWeek: 5,
    toWeek: 12,
    source: "typical",
  },
  {
    key: "head-control",
    area: "motorik",
    fromWeek: 8,
    toWeek: 18,
    source: "typical",
  },
  {
    key: "coo",
    area: "sprache",
    fromWeek: 8,
    toWeek: 20,
    source: "typical",
  },
  {
    key: "hands",
    area: "motorik",
    fromWeek: 8,
    toWeek: 20,
    source: "typical",
  },
  {
    key: "laugh",
    area: "sozial",
    fromWeek: 12,
    toWeek: 26,
    source: "typical",
  },
  {
    key: "grasp",
    area: "motorik",
    fromWeek: 13,
    toWeek: 26,
    source: "typical",
  },
  {
    key: "roll",
    area: "motorik",
    fromWeek: 17,
    toWeek: 30,
    source: "typical",
  },
  {
    key: "sit-alone",
    area: "motorik",
    fromWeek: 17,
    toWeek: 40,
    source: "who",
  },
  {
    key: "babble",
    area: "sprache",
    fromWeek: 17,
    toWeek: 35,
    source: "typical",
  },
  {
    key: "first-tooth",
    area: "koerper",
    fromWeek: 17,
    toWeek: 52,
    source: "typical",
  },
  {
    key: "stand-assisted",
    area: "motorik",
    fromWeek: 21,
    toWeek: 50,
    source: "who",
  },
  {
    key: "crawl",
    area: "motorik",
    fromWeek: 23,
    toWeek: 59,
    source: "who",
  },
  {
    key: "stranger-anxiety",
    area: "sozial",
    fromWeek: 26,
    toWeek: 52,
    source: "typical",
  },
  {
    key: "walk-assisted",
    area: "motorik",
    fromWeek: 26,
    toWeek: 60,
    source: "who",
  },
  {
    key: "stand-alone",
    area: "motorik",
    fromWeek: 30,
    toWeek: 73,
    source: "who",
  },
  {
    key: "pincer",
    area: "motorik",
    fromWeek: 35,
    toWeek: 52,
    source: "typical",
  },
  {
    key: "wave",
    area: "sozial",
    fromWeek: 35,
    toWeek: 61,
    source: "typical",
  },
  {
    key: "walk-alone",
    area: "motorik",
    fromWeek: 36,
    toWeek: 77,
    source: "who",
  },
  {
    key: "first-word",
    area: "sprache",
    fromWeek: 39,
    toWeek: 70,
    source: "typical",
  },
  {
    key: "two-words",
    area: "sprache",
    fromWeek: 78,
    toWeek: 113,
    source: "typical",
  },
];

export const AREA_LABEL: Record<MilestoneArea, string> = {
  sozial: "Miteinander",
  motorik: "Bewegung",
  sprache: "Sprache",
  koerper: "Körper",
};

export const MILESTONE_NOTE =
  "Die Zeitfenster sagen nicht, wann etwas passieren soll — sie zeigen, in welcher " +
  "Spanne gesunde Kinder diesen Schritt machen, und die ist erstaunlich breit. Sechs " +
  "davon (frei sitzen, mit Halt stehen, krabbeln, an der Hand laufen, frei stehen, " +
  "frei laufen) stammen aus der WHO Motor Development Study, die übrigen sind " +
  "verbreitete Orientierungswerte. Bei Sorgen ist die U-Untersuchung der richtige " +
  "Ort, nicht diese Liste.";

export const MILESTONES_BY_KEY = new Map(MILESTONES.map((m) => [m.key, m]));
