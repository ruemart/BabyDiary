/**
 * The most important test of this app: record with no network, and the entry arrives on the
 * second device as soon as the network is back.
 *
 * Runs against the finished Docker stack, not the development server — so nginx, the
 * service worker and the real API container are checked along with it.
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
  console.log(`${ok ? "  OK  " : "  FAIL  "} ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();

// ── Device 1: Mama sets things up ────────────────────────────────────────────
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

// The setup screen only appears with an empty database. On a second run against the
// same stack a child already exists — that is
// not an error but exactly the intended behaviour.
const needsSetup = await m
  .waitForSelector("text=Wen begleiten wir", { timeout: 8000 })
  .then(() => true)
  .catch(() => false);

if (needsSetup) {
  await m.getByPlaceholder(/name/i).fill("Test child");
  const birth = new Date();
  birth.setDate(birth.getDate() - 40);
  await m.locator('input[type="date"]').first().fill(birth.toISOString().slice(0, 10));
  await m.getByRole("button", { name: /Los geht/ }).click();
}

// Wait for the header rather than a fixed delay: on a busy Pi any fixed wait is either
// too short or a waste of time.
const headerVisible = await m
  .waitForSelector("h1:has-text('Woche')", { timeout: 15000 })
  .then(() => true)
  .catch(() => false);
check(
  needsSetup ? "setup completed" : "existing setup adopted",
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
check("entry appears at once although offline", offlineVisible);

await m.getByRole("button", { name: "Voll" }).first().click();
await m.waitForTimeout(1500);

// ── Back online: the outbox has to drain ─────────────────────────────────────
await mama.setOffline(false);
await m.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await m.waitForTimeout(6000);

// ── Device 2: Papa, a fresh browser ──────────────────────────────────────────
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
  "second device adopts the child details (no second setup screen)",
  papaSeesChild,
);

await p.goto(`${BASE}/verlauf`, { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
const historyText = await p.locator("body").innerText();
check(
  "bottle created offline arrived on the second device",
  /Flasche/.test(historyText),
);
check(
  "nappy created offline arrived on the second device",
  /Windel/.test(historyText),
);

// ── Deleting has to propagate too (the soft-delete path) ─────────────────────
const beforeDelete = (await p.locator(".entry").count()) ?? 0;
await p.locator(".entry__remove").first().click();
await p.waitForTimeout(4000);

await m.goto(`${BASE}/verlauf`, { waitUntil: "networkidle" });
await m.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await m.waitForTimeout(5000);
const mamaCount = await m.locator(".entry").count();
check(
  "deletion propagated to the first device",
  mamaCount < beforeDelete,
  `${beforeDelete} → ${mamaCount}`,
);

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(
  failed.length === 0
    ? `\nAll ${results.length} checks passed.`
    : `\n${failed.length} of ${results.length} checks failed.`,
);
process.exit(failed.length === 0 ? 0 : 1);
