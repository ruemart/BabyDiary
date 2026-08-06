/**
 * Converts the Natural Earth country borders into SVG paths, once.
 *
 * AT BUILD TIME, not at runtime: a family app should not contact any
 * map service on open. That way the map works offline, no
 * no location data leaves the device, and there is no tile URL that in three years
 * will be dead.
 *
 * Projection: equirectangular (plate carrée). Deliberately the simplest — which makes
 * converting coordinates to pixels a multiplication, and the dots can be placed
 * without a library.
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
  // Drop very small islands — they cost bytes and at this size are
  // not visible anyway.
  if (ring.length < 4) return "";
  const points = ring.map(project);
  const [first, ...rest] = points;
  let d = `M${first[0]} ${first[1]}`;
  let last = first;
  for (const p of rest) {
    // Skip points that fall on the same tenth of a pixel.
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
 * Country borders as a single SVG path, equirectangular projection.
 *
 * Generated with \`tools/build-world-map.mjs\` from Natural Earth (public domain, via
 * world-atlas package). Converted at build time so the app contacts no
 * map service at runtime: it works offline, gives no locations away,
 * and there is no tile URL that stops existing one day.
 *
 * NICHT VON HAND BEARBEITEN.
 */
export const WORLD_VIEWBOX = { width: ${WIDTH}, height: ${HEIGHT} } as const;

/** Pixel position for coordinates — pure multiplication with this projection. */
export function projectToMap(latitude: number, longitude: number): { x: number; y: number } {
  return {
    x: ((longitude + 180) / 360) * ${WIDTH},
    y: ((90 - latitude) / 180) * ${HEIGHT},
  };
}

export const WORLD_PATH =
  ${JSON.stringify(combined)};
`);
