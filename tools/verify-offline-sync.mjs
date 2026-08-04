/**
 * Der wichtigste Test dieser App: Eintragen ohne Netz, und der Eintrag kommt auf dem
 * zweiten Gerät an, sobald das Netz zurück ist.
 *
 * Läuft gegen den fertigen Docker-Stapel, nicht gegen den Entwicklungsserver — damit
 * auch nginx, der Service Worker und der echte API-Container mitgeprüft werden.
 *
 *   BASE=http://127.0.0.1:8090 INVITE=<HOUSEHOLD_SECRET> node tools/verify-offline-sync.mjs
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:8090";
const INVITE = process.env.INVITE;
if (!INVITE) throw new Error("INVITE fehlt (HOUSEHOLD_SECRET aus .env)");

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  OK  " : "  FEHLER "} ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();

// ── Gerät 1: Mama richtet ein ────────────────────────────────────────────────
const mama = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "de-DE",
  timezoneId: "Europe/Berlin",
});
const m = await mama.newPage();

await m.goto(`${BASE}/start?t=${INVITE}`, { waitUntil: "networkidle" });
await m.getByRole("button", { name: "Mama", exact: true }).click();
await m.getByRole("button", { name: /Loslegen/ }).click();
await m.waitForTimeout(3000);

// Der Einrichtungsdialog erscheint nur bei leerer Datenbank. Bei einem zweiten
// Durchlauf gegen denselben Stapel ist bereits ein Kind vorhanden — das ist kein
// Fehler, sondern genau das gewünschte Verhalten.
const needsSetup = await m
  .waitForSelector("text=Wen begleiten wir", { timeout: 8000 })
  .then(() => true)
  .catch(() => false);

if (needsSetup) {
  await m.getByPlaceholder("Wie heißt sie oder er?").fill("Testkind");
  const birth = new Date();
  birth.setDate(birth.getDate() - 40);
  await m.locator('input[type="date"]').first().fill(birth.toISOString().slice(0, 10));
  await m.getByRole("button", { name: /Los geht/ }).click();
}

// Auf die Kopfzeile warten statt auf einen festen Zeitraum: Auf einem ausgelasteten
// Pi ist jede feste Wartezeit entweder zu kurz oder Zeitverschwendung.
const headerVisible = await m
  .waitForSelector("h1:has-text('Woche')", { timeout: 15000 })
  .then(() => true)
  .catch(() => false);
check(
  needsSetup ? "Einrichtung abgeschlossen" : "Vorhandene Einrichtung übernommen",
  headerVisible,
);

// ── Offline eintragen ────────────────────────────────────────────────────────
await mama.setOffline(true);
await m.waitForTimeout(500);

await m.getByRole("button", { name: /Flasche/ }).first().click();
await m.waitForTimeout(600);
await m.getByRole("button", { name: "Speichern" }).click();
await m.waitForTimeout(1200);

const offlineVisible = await m
  .getByText(/gerade eben/)
  .first()
  .isVisible()
  .catch(() => false);
check("Eintrag erscheint sofort, obwohl offline", offlineVisible);

await m.getByRole("button", { name: "Voll" }).first().click();
await m.waitForTimeout(1500);

// ── Wieder online: der Ausgangskorb muss abfließen ───────────────────────────
await mama.setOffline(false);
await m.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await m.waitForTimeout(6000);

// ── Gerät 2: Papa, frischer Browser ──────────────────────────────────────────
const papa = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "de-DE",
  timezoneId: "Europe/Berlin",
});
const p = await papa.newPage();
await p.goto(`${BASE}/start?t=${INVITE}`, { waitUntil: "networkidle" });
await p.getByRole("button", { name: "Papa", exact: true }).click();
await p.getByRole("button", { name: /Loslegen/ }).click();
await p.waitForTimeout(5000);

const papaSeesChild = await p.getByText("Testkind").isVisible().catch(() => false);
check(
  "Zweites Gerät übernimmt die Kinddaten (kein zweiter Einrichtungsdialog)",
  papaSeesChild,
);

await p.goto(`${BASE}/verlauf`, { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
const historyText = await p.locator("body").innerText();
check(
  "Offline angelegte Flasche ist auf dem zweiten Gerät angekommen",
  /Flasche/.test(historyText),
);
check(
  "Offline angelegte Windel ist auf dem zweiten Gerät angekommen",
  /Windel/.test(historyText),
);

// ── Löschen muss ebenfalls propagieren (Soft-Delete-Pfad) ────────────────────
const beforeDelete = (await p.locator(".entry").count()) ?? 0;
await p.locator(".entry__remove").first().click();
await p.waitForTimeout(4000);

await m.goto(`${BASE}/verlauf`, { waitUntil: "networkidle" });
await m.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await m.waitForTimeout(5000);
const mamaCount = await m.locator(".entry").count();
check(
  "Löschung propagiert auf das erste Gerät",
  mamaCount < beforeDelete,
  `${beforeDelete} → ${mamaCount}`,
);

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(
  failed.length === 0
    ? `\nAlle ${results.length} Prüfungen bestanden.`
    : `\n${failed.length} von ${results.length} Prüfungen fehlgeschlagen.`,
);
process.exit(failed.length === 0 ? 0 : 1);
