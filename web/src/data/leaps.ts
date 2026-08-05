/**
 * Entwicklungssprünge nach dem Modell "Oje, ich wachse!".
 *
 * ZUM URHEBERRECHT: Die Sprungwochen selbst sind Zahlen und frei verwendbar. Die Texte
 * auf ojeichwachse.de sind es nicht — die Beschreibungen hier sind vollständig eigene
 * Formulierungen.
 *
 * ZUR EINORDNUNG: Das Modell ist unter Eltern verbreitet, wissenschaftlich aber
 * umstritten. Die Originalstudie beruhte auf einer sehr kleinen Stichprobe, und
 * Replikationsversuche konnten die festen Zeitpunkte nicht bestätigen. Deshalb ist der
 * Ton hier bewusst "was Eltern häufig berichten" und nicht "das passiert jetzt" — und
 * `LEAP_DISCLAIMER` steht sichtbar an der Ansicht.
 *
 * ZUR ZÄHLUNG: Alle Wochen zählen ab dem ERRECHNETEN GEBURTSTERMIN, nicht ab dem
 * Geburtsdatum. Bei einem Frühchen verschiebt das den gesamten Zeitstrahl um Wochen.
 */

export type Leap = {
  number: number;
  /** Sprungwoche, gezählt ab errechnetem Termin. */
  week: number;
  /** Ungefähres Fenster, in dem Eltern die unruhige Phase berichten. */
  fussyFrom: number;
  fussyTo: number;
  /**
   * Titel, Beschreibung und neue Fähigkeiten stehen in den Sprachdateien unter
   * `leap.<number>.*`. Hier bleiben nur die Zahlen — die sind sprachunabhängig.
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

