/**
 * Prüft die App in WebKit — der Maschine, die auch auf dem iPhone läuft.
 *
 * Anlass waren drei Fehler hintereinander, die es NUR auf dem iPhone gab und die in
 * Chromium sauber aussahen: tote Navigationspunkte, ein Blatt, das zu drei Vierteln
 * unter dem Bildschirm lag, und ein Wochenfoto, das seinen Kreis nicht füllte. Jedes
 * Mal hieß es raten, weil hier keine zweite Maschine lief.
 *
 * Läuft gegen den ENTWICKLUNGSSERVER, nicht gegen den Docker-Stapel: Das
 * Sitzungs-Cookie ist dort `Secure`, und WebKit lehnt solche Cookies über HTTP ab
 * (Chromium macht bei localhost eine Ausnahme — genau deshalb fiel es lange nicht auf).
 *
 *   npm run dev --workspace=web          # 5173
 *   cd api && … node --experimental-strip-types src/server.ts   # 3010, COOKIE_SECURE=false
 *   node tools/check-ios.mjs
 *
 * Einmalig nötig, damit WebKit startet:
 *   npx playwright install webkit
 *   sudo apt-get install -y libharfbuzz-icu0 libmanette-0.2-0 libhyphen0
 */
import { webkit, devices } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:5173";
const INVITE = process.env.HOUSEHOLD_SECRET ?? "dev-household-secret-1234567890abcd";

const befunde = [];
const prüfe = (name, bestanden, hinweis) => {
  befunde.push({ name, bestanden, hinweis });
  console.log(`${bestanden ? "  ok  " : " FEHL "} ${name}${hinweis ? ` — ${hinweis}` : ""}`);
};

const browser = await webkit.launch();
const context = await browser.newContext({
  ...devices["iPhone 14"],
  locale: "de-DE",
  timezoneId: "Europe/Berlin",
});
const page = await context.newPage();
const fehler = [];
page.on("pageerror", (e) => fehler.push(e.message));

await page.goto(`${BASE}/start?t=${INVITE}`, { waitUntil: "networkidle" });
if (await page.getByRole("button", { name: "Papa", exact: true }).count()) {
  await page.getByRole("button", { name: "Papa", exact: true }).click();
  await page.getByRole("button", { name: /Loslegen/ }).click();
  await page.waitForTimeout(1500);
  const setup = page.getByPlaceholder("Wie heißt sie oder er?");
  if (await setup.count()) {
    await setup.fill("Testkind");
    await page.locator('input[type="date"]').first().fill("2026-05-01");
    await page.getByRole("button", { name: "Los geht's" }).click();
  }
}
await page.waitForTimeout(3500);

/* ── Das Eingabeblatt muss ganz auf den Bildschirm passen ─────────────────── */

await page.goto(`${BASE}/verlauf`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Nachtragen" }).click();
await page.waitForTimeout(900);

const blatt = await page.evaluate(() => {
  const d = document.querySelector("dialog.sheet");
  if (!d) return null;
  const r = d.getBoundingClientRect();
  const fuß = d.querySelector(".sheet__actions");
  return {
    fenster: window.innerHeight,
    unten: Math.round(r.bottom),
    oben: Math.round(r.top),
    fußUnten: fuß ? Math.round(fuß.getBoundingClientRect().bottom) : null,
    // Ein hängengebliebenes `transform` war die Ursache des iPhone-Fehlers.
    transform: getComputedStyle(d).transform,
  };
});

prüfe("Blatt öffnet sich", !!blatt);
if (blatt) {
  prüfe(
    "Blatt endet am Bildschirmrand, nicht darunter",
    blatt.unten <= blatt.fenster + 1,
    `Unterkante ${blatt.unten}, Fenster ${blatt.fenster}`,
  );
  prüfe(
    "Speichern-Knopf ist sichtbar",
    blatt.fußUnten !== null && blatt.fußUnten <= blatt.fenster + 1,
    `Fuß endet bei ${blatt.fußUnten}`,
  );
  prüfe(
    "keine stehengebliebene Verschiebung",
    blatt.transform === "none" || blatt.transform === "matrix(1, 0, 0, 1, 0, 0)",
    blatt.transform,
  );
}

/* ── Das Wochenfoto muss seinen Kreis füllen ──────────────────────────────── */

await page.keyboard.press("Escape");
await page.goto(`${BASE}/wochen`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

const foto = await page.evaluate(() => {
  const img = document.querySelector(".cell__photo img");
  if (!img) return null;
  const b = img.getBoundingClientRect();
  const r = img.parentElement.getBoundingClientRect();
  return {
    bild: { b: Math.round(b.width), h: Math.round(b.height) },
    kreis: { b: Math.round(r.width), h: Math.round(r.height) },
  };
});

if (!foto) {
  console.log("  ---  Wochenfoto übersprungen (kein Foto hinterlegt)");
} else {
  prüfe(
    "Foto füllt den Kreis genau",
    foto.bild.b === foto.kreis.b && foto.bild.h === foto.kreis.h,
    `Bild ${foto.bild.b}×${foto.bild.h}, Kreis ${foto.kreis.b}×${foto.kreis.h}`,
  );
}

/* ── Navigation ───────────────────────────────────────────────────────────── */

for (const [name, pfad] of [
  ["Heute", "/"],
  ["Wochen", "/wochen"],
  ["Schritte", "/meilensteine"],
  ["Kurven", "/kurven"],
  ["Mehr", "/einstellungen"],
]) {
  await page.getByRole("link", { name }).click();
  await page.waitForTimeout(900);
  prüfe(`Navigation „${name}"`, new URL(page.url()).pathname === pfad, page.url());
}

prüfe("keine Skriptfehler", fehler.length === 0, fehler.join(" | "));

await browser.close();

const durchgefallen = befunde.filter((b) => !b.bestanden);
console.log(`\n${befunde.length - durchgefallen.length}/${befunde.length} bestanden`);
process.exit(durchgefallen.length ? 1 : 0);
