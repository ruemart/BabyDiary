/**
 * Developmental leaps after the "The Wonder Weeks" model.
 *
 * ON COPYRIGHT: the leap weeks themselves are numbers and freely usable. The texts on
 * the publisher's site are not — the descriptions here are entirely our own wording.
 *
 * ON HOW TO READ IT: the model is widespread among parents but scientifically contested.
 * The original study rested on a very small sample, and replication attempts could not
 * confirm the fixed timings. So the tone here is deliberately "what parents often
 * report" and not "this is happening now" — and the disclaimer sits visibly on the view.
 *
 * ON COUNTING: all weeks count from the DUE DATE, not from the date of birth. For a
 * premature baby that shifts the entire timeline by weeks.
 */

export type Leap = {
  number: number;
  /** Leap week, counted from the due date. */
  week: number;
  /** The rough window in which parents report the unsettled phase. */
  fussyFrom: number;
  fussyTo: number;
  /**
   * Title, description and new skills live in the language files under
   * `leap.<number>.*`. Only the numbers stay here — those are language-independent.
   */
};

export const LEAPS: Leap[] = [
  {
    number: 1,
    week: 5,
    fussyFrom: 4,
    fussyTo: 5,
  },
  {
    number: 2,
    week: 8,
    fussyFrom: 7,
    fussyTo: 9,
  },
  {
    number: 3,
    week: 12,
    fussyFrom: 11,
    fussyTo: 12,
  },
  {
    number: 4,
    week: 19,
    fussyFrom: 15,
    fussyTo: 19,
  },
  {
    number: 5,
    week: 26,
    fussyFrom: 23,
    fussyTo: 26,
  },
  {
    number: 6,
    week: 37,
    fussyFrom: 34,
    fussyTo: 37,
  },
  {
    number: 7,
    week: 46,
    fussyFrom: 42,
    fussyTo: 46,
  },
  {
    number: 8,
    week: 55,
    fussyFrom: 51,
    fussyTo: 55,
  },
  {
    number: 9,
    week: 64,
    fussyFrom: 60,
    fussyTo: 64,
  },
  {
    number: 10,
    week: 75,
    fussyFrom: 71,
    fussyTo: 76,
  },
];

