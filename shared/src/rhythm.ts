/**
 * When is the next one likely?
 *
 * The estimate comes from the child's OWN rhythm — the median gap between recent
 * events — never from a table. A population average would be worthless here: every child
 * has their own pace, and it shifts over the months anyway.
 *
 * Median rather than mean, for a reason that shows up every night: one long stretch of
 * sleep drags a mean upwards, and every estimate afterwards would be systematically
 * late. The median shrugs that off.
 *
 * This lives in `shared` because two very different places ask the same question and
 * must not answer it differently — the server, deciding when to send the bottle
 * reminder, and the home screen, showing when the next one is expected. A notification
 * saying half past two next to a screen saying quarter past three is worse than either
 * on its own.
 */

export type RhythmEvent = { id: string; startedAt: string };

export type Rhythm = {
  /** The event the estimate is anchored to — the most recent one. */
  lastId: string;
  lastAt: number;
  /** The typical gap, in minutes. */
  typicalGapMinutes: number;
  /** When the next one is expected, in milliseconds since the epoch. */
  dueAt: number;
};

export type RhythmOptions = {
  /**
   * How far back to look. Deliberately short: a rhythm from three weeks ago describes a
   * different child. Twelve events covers roughly the last two days of feeds.
   */
  window?: number;
  /** Below this many events there is no rhythm worth showing. */
  minEvents?: number;
  /** Below this many usable gaps the median would be one or two numbers. */
  minGaps?: number;
  /**
   * Anything closer together than this is a correction, not a rhythm — a second tap, a
   * nappy changed again straight away, both parents recording the same bottle.
   */
  minGapMinutes?: number;
};

const DEFAULTS: Required<RhythmOptions> = {
  window: 12,
  minEvents: 5,
  minGaps: 3,
  minGapMinutes: 15,
};

/**
 * @param events In any order — sorted here, because the callers hold their entries in
 *   whatever order suits them and a wrong order would silently produce negative gaps.
 */
export function predictNext(
  events: readonly RhythmEvent[],
  options: RhythmOptions = {},
): Rhythm | null {
  const { window, minEvents, minGaps, minGapMinutes } = { ...DEFAULTS, ...options };

  const recent = [...events]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, window);
  if (recent.length < minEvents) return null;

  const gaps: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const gap = Date.parse(recent[i - 1]!.startedAt) - Date.parse(recent[i]!.startedAt);
    if (gap > minGapMinutes * 60_000) gaps.push(gap);
  }
  if (gaps.length < minGaps) return null;

  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)]!;

  const last = recent[0]!;
  return {
    lastId: last.id,
    lastAt: Date.parse(last.startedAt),
    typicalGapMinutes: Math.round(median / 60_000),
    dueAt: Date.parse(last.startedAt) + median,
  };
}
