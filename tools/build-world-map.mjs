/**
 * Wandelt die Natural-Earth-Ländergrenzen einmalig in SVG-Pfade um.
 *
 * ZUR BAUZEIT, nicht zur Laufzeit: Eine Familien-App soll beim Öffnen keinen
 * Kartendienst kontaktieren. Damit funktioniert die Karte auch offline, es gehen
 * keine Standortdaten nach außen, und es gibt keine Kachel-URL, die in drei Jahren
 * tot ist.
 *
 * Projektion: äquirektangulär (Plate Carrée). Bewusst die einfachste — dadurch ist
 * die Umrechnung von Koordinaten auf Bildpunkte eine Multiplikation, und die
 * Punkte lassen sich ohne Bibliothek platzieren.
 *
 *   node tools/build-world-map.mjs > web/src/data/world.ts
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as topojson from "topojson-client";

const require = createRequire(import.meta.url);
const topo = JSON.parse(
  readFileSync(require.resolve("world-atlas/countries-110m.json"), "utf8"),
);
const geo = topojson.feature(topo, topo.objects.countries);

const WIDTH = 1000;
const HEIGHT = 500;
const round = (n) => Math.round(n * 10) / 10;
const project = ([lon, lat]) => [
  round(((lon + 180) / 360) * WIDTH),
  round(((90 - lat) / 180) * HEIGHT),
];

function ringToPath(ring) {
  // Sehr kleine Inseln weglassen — sie kosten Bytes und sind bei dieser Größe
  // ohnehin nicht sichtbar.
  if (ring.length < 4) return "";
  const points = ring.map(project);
  const [first, ...rest] = points;
  let d = `M${first[0]} ${first[1]}`;
  let last = first;
  for (const p of rest) {
    // Punkte, die auf denselben Zehntel-Bildpunkt fallen, überspringen.
    if (p[0] === last[0] && p[1] === last[1]) continue;
    d += `L${p[0]} ${p[1]}`;
    last = p;
  }
  return d + "Z";
}

const paths = [];
for (const feature of geo.features) {
  const g = feature.geometry;
  if (!g) continue;
  const polygons = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  const d = polygons
    .flatMap((poly) => poly.map(ringToPath))
    .filter(Boolean)
    .join("");
  if (d) paths.push(d);
}

const combined = paths.join("");

process.stdout.write(`/**
 * Ländergrenzen als ein einziger SVG-Pfad, äquirektangulär projiziert.
 *
 * Erzeugt mit \`tools/build-world-map.mjs\` aus Natural Earth (gemeinfrei, über das
 * Paket world-atlas). Zur Bauzeit umgerechnet, damit die App zur Laufzeit keinen
 * Kartendienst kontaktiert: funktioniert offline, verrät keine Standorte nach außen,
 * und es gibt keine Kachel-URL, die irgendwann nicht mehr existiert.
 *
 * NICHT VON HAND BEARBEITEN.
 */
export const WORLD_VIEWBOX = { width: ${WIDTH}, height: ${HEIGHT} } as const;

/** Bildpunkt-Position für Koordinaten — bei dieser Projektion reine Multiplikation. */
export function projectToMap(latitude: number, longitude: number): { x: number; y: number } {
  return {
    x: ((longitude + 180) / 360) * ${WIDTH},
    y: ((90 - latitude) / 180) * ${HEIGHT},
  };
}

export const WORLD_PATH =
  ${JSON.stringify(combined)};
`);
