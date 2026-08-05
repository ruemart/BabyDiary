/**
 * The milestone list — expectation and checklist in one.
 *
 * ONE list, not a second concept: the same entries appear as an expectation on the week
 * ribbon ("first real tears: from week 4") and as a checklist where you record when it
 * actually happened. You should not have to know which milestones exist in order to
 * record them.
 *
 * EVERYTHING IN WEEKS OF LIFE, because the whole app counts in weeks and so does the
 * timeline. `fromWeek`/`toWeek` is the span in which healthy children take this step —
 * not a target.
 *
 * TWO QUALITIES, visibly separated:
 *
 *  - `source: "who"` — the six gross motor milestones of the WHO Motor Development
 *    Study (Multicentre Growth Reference Study, 816 children from Ghana, India, Norway,
 *    Oman and the USA). The span is the 1st to 99th percentile, converted from months
 *    into weeks.
 *    https://www.who.int/tools/child-growth-standards/standards/motor-development-milestones
 *
 *  - `source: "typical"` — common orientation values from parenting literature, as they
 *    also appear in leap calendars. Much more softly evidenced; they are here because
 *    parents expect them, not because they are standardised.
 */

export type MilestoneSource = "who" | "typical";
export type MilestoneArea = "sozial" | "motorik" | "sprache" | "koerper";

export type Milestone = {
  key: string;
  /** The label lives in the language files under `milestone.<key>`. */
  area: MilestoneArea;
  /** Week of life from which it usually occurs. */
  fromWeek: number;
  /** Week of life by which it has usually happened. */
  toWeek: number;
  source: MilestoneSource;
  /** An extra note, if present, under `milestone.<key>.hint`. */
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



export const MILESTONES_BY_KEY = new Map(MILESTONES.map((m) => [m.key, m]));
