import { chromium } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";
const OUT = process.argv[2] ?? "./screenshots";
const INVITE = "dev-household-secret-1234567890abcd";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  locale: "de-DE",
  timezoneId: "Europe/Berlin",
});
const page = await context.newPage();

const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));

async function shot(name, full = true) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log(`  → ${name}.png`);
}

await page.goto(`${BASE}/start?t=${INVITE}`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Papa", exact: true }).click();
await page.getByRole("button", { name: /Loslegen/ }).click();
await page.waitForTimeout(3500);

// Tagdarstellung erzwingen, um beide Modi beurteilen zu können.
await page.evaluate(() => localStorage.setItem("bm.appearance", "day"));
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await shot("20-today-day", false);

await page.goto(`${BASE}/kurven`, { waitUntil: "networkidle" });
await shot("21-charts-day");

await page.goto(`${BASE}/wochen`, { waitUntil: "networkidle" });
await shot("22-weeks-day");

await page.goto(`${BASE}/verlauf`, { waitUntil: "networkidle" });
await shot("23-history-day", false);

await page.evaluate(() => localStorage.setItem("bm.appearance", "night"));
await page.goto(`${BASE}/kurven`, { waitUntil: "networkidle" });
await shot("24-charts-night");

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await shot("25-today-night", false);

console.log(errors.length ? `\nKONSOLENFEHLER (${errors.length}):` : "\nKeine Konsolenfehler.");
for (const e of [...new Set(errors)].slice(0, 12)) console.log("  ✗", e);

await browser.close();
