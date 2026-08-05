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
  title: string;
  /** Was in dieser Phase oft beobachtet wird. */
  description: string;
  /** Was danach neu dazukommt. */
  newSkills: string;
};

export const LEAPS: Leap[] = [
  {
    number: 1,
    week: 5,
    fussyFrom: 4,
    fussyTo: 5,
    title: "Empfindungen",
    description:
      "Die Sinne werden wacher. Viele Babys wirken schreckhafter und wollen mehr getragen werden.",
    newSkills: "Längeres Wachbleiben, aufmerksameres Schauen, erstes bewusstes Lächeln.",
  },
  {
    number: 2,
    week: 8,
    fussyFrom: 7,
    fussyTo: 9,
    title: "Muster",
    description:
      "Formen, Linien und wiederkehrende Abläufe werden interessant. Oft unruhigeres Trinken und leichterer Schlaf.",
    newSkills: "Entdeckt die eigenen Hände, verfolgt Dinge mit den Augen, gurrt.",
  },
  {
    number: 3,
    week: 12,
    fussyFrom: 11,
    fussyTo: 12,
    title: "Sanfte Übergänge",
    description:
      "Bewegungen und Geräusche werden als fließend wahrgenommen statt als Einzelbilder. Eine meist kurze Phase.",
    newSkills: "Gezielteres Greifen, Kopf sicherer halten, quietschen und lachen.",
  },
  {
    number: 4,
    week: 19,
    fussyFrom: 15,
    fussyTo: 19,
    title: "Ereignisse",
    description:
      "Ein längerer, oft anstrengender Abschnitt. Viele Eltern berichten von mehr Nähebedürfnis und unruhigen Nächten.",
    newSkills: "Greift gezielt nach Gegenständen, steckt alles in den Mund, dreht sich.",
  },
  {
    number: 5,
    week: 26,
    fussyFrom: 23,
    fussyTo: 26,
    title: "Beziehungen",
    description:
      "Abstände und Zusammenhänge werden begreifbar — häufig zusammen mit dem ersten Fremdeln.",
    newSkills: "Sitzt mit Unterstützung, robbt, versteht Abläufe wie Verstecken.",
  },
  {
    number: 6,
    week: 37,
    fussyFrom: 34,
    fussyTo: 37,
    title: "Kategorien",
    description: "Dinge werden sortiert und verglichen. Oft wechselhafte Stimmung.",
    newSkills: "Krabbeln, gezieltes Zeigen, erste bewusste Silben.",
  },
  {
    number: 7,
    week: 46,
    fussyFrom: 42,
    fussyTo: 46,
    title: "Abfolgen",
    description: "Reihenfolgen werden erkannt: erst dies, dann das.",
    newSkills: "Zieht sich hoch, stapelt und steckt zusammen, ahmt Gesten nach.",
  },
  {
    number: 8,
    week: 55,
    fussyFrom: 51,
    fussyTo: 55,
    title: "Programme",
    description:
      "Ganze Handlungsketten werden verstanden — anziehen, essen, aufräumen. Häufig ausgeprägter eigener Wille.",
    newSkills: "Erste Schritte, einfache Aufträge verstehen, erste Wörter.",
  },
  {
    number: 9,
    week: 64,
    fussyFrom: 60,
    fussyTo: 64,
    title: "Grundsätze",
    description:
      "Regeln werden erprobt, indem sie gebrochen werden. Viele Eltern erleben hier die ersten Trotzmomente.",
    newSkills: "Verhandelt, probiert Grenzen aus, spielt so tun als ob.",
  },
  {
    number: 10,
    week: 75,
    fussyFrom: 71,
    fussyTo: 76,
    title: "Systeme",
    description:
      "Das Kind begreift sich als eigene Person und passt sein Verhalten der Situation an.",
    newSkills: "Sagt Ich, zeigt Mitgefühl, spielt längere Rollenspiele.",
  },
];

export const LEAP_DISCLAIMER =
  "Die Sprungwochen zählen ab dem errechneten Geburtstermin. Das Modell ist unter Eltern " +
  "verbreitet, wissenschaftlich aber umstritten — nehmt es als groben Anhaltspunkt, nicht " +
  "als Fahrplan. Jedes Kind hat sein eigenes Tempo.";
