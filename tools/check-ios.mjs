/**
 * Checks the app in WebKit — the engine that also runs on the iPhone.
 *
 * Prompted by three bugs in a row that existed ONLY on the iPhone and looked perfectly
 * fine in Chromium: dead navigation items, a sheet sitting three quarters below the
 * screen, and a weekly photo that did not fill its circle. Each time it meant guessing,
 * because no second engine ran here.
 *
 * Runs against the DEVELOPMENT SERVER, not the Docker stack: the session cookie is
 * `Secure` there, and WebKit refuses such cookies over HTTP (Chromium makes an exception
 * for localhost — which is exactly why this went unnoticed for so long).
 *
 *   npm run dev --workspace=web          # 5173
 *   cd api && … node --experimental-strip-types src/server.ts   # 3010, COOKIE_SECURE=false
 *   node tools/check-ios.mjs
 *
 * One-time setup so WebKit starts:
 *   npx playwright install webkit
 *   sudo apt-get install -y libharfbuzz-icu0 libmanette-0.2-0 libhyphen0
 */
import { webkit, devices } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:5173";
const INVITE = process.env.HOUSEHOLD_SECRET ?? "dev-household-secret-1234567890abcd";

const results = [];
const check = (name, passed, note) => {
  results.push({ name, passed, note });
  console.log(`${passed ? "  ok  " : " FAIL "} ${name}${note ? ` — ${note}` : ""}`);
};

const browser = await webkit.launch();
const context = await browser.newContext({
  ...devices["iPhone 14"],
  // English, so the selectors below do not depend on a translation.
  locale: "en-US",
  timezoneId: "Europe/Berlin",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`${BASE}/start?t=${INVITE}`, { waitUntil: "networkidle" });
if (await page.getByRole("button", { name: "Papa", exact: true }).count()) {
  await page.getByRole("button", { name: "Papa", exact: true }).click();
  await page.getByRole("button", { name: /Let's go/ }).click();
  await page.waitForTimeout(1500);
  const setup = page.getByPlaceholder(/name/i);
  if (await setup.count()) {
    await setup.fill("Test child");
    await page.locator('input[type="date"]').first().fill("2026-05-01");
    await page.getByRole("button", { name: /Let's go/ }).click();
  }
}
await page.waitForTimeout(3500);

/* ── The input sheet has to fit on the screen ─────────────────────────────── */

await page.goto(`${BASE}/verlauf`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /Add entry/ }).click();
await page.waitForTimeout(900);

const sheet = await page.evaluate(() => {
  const d = document.querySelector("dialog.sheet");
  if (!d) return null;
  const panel = d.querySelector(".sheet__panel");
  const body = d.querySelector(".sheet__body");
  const footer = d.querySelector(".sheet__actions");
  const box = (el) => (el ? el.getBoundingClientRect() : null);
  const p = box(panel) ?? box(d);
  const b = box(body);
  // The topmost thing you are meant to operate: the first button of the form.
  const firstControl = box(body?.querySelector("button, input, textarea, select"));
  return {
    viewport: window.innerHeight,
    top: Math.round(p.top),
    bottom: Math.round(p.bottom),
    height: Math.round(p.height),
    bodyHeight: b ? Math.round(b.height) : null,
    bodyScrollHeight: body ? body.scrollHeight : null,
    firstControlBottom: firstControl ? Math.round(firstControl.bottom) : null,
    footerBottom: footer ? Math.round(box(footer).bottom) : null,
    // A stuck `transform` was one of the causes of the iPhone bug.
    transform: getComputedStyle(panel ?? d).transform,
  };
});

check("the sheet opens", !!sheet);
if (sheet) {
  check(
    "the sheet ends at the screen edge, not below it",
    sheet.bottom <= sheet.viewport + 1,
    `bottom ${sheet.bottom}, viewport ${sheet.viewport}`,
  );
  check(
    "the save button is visible",
    sheet.footerBottom !== null && sheet.footerBottom <= sheet.viewport + 1,
    `footer ends at ${sheet.footerBottom}`,
  );
  check(
    "no stuck transform",
    sheet.transform === "none" || sheet.transform === "matrix(1, 0, 0, 1, 0, 0)",
    sheet.transform,
  );
  /**
   * The three checks above all passed while the sheet was unusable on the iPhone: the
   * form between the title and the save button had been squeezed to a couple of pixels,
   * and measuring only the OUTER edges cannot see that. So the inside gets measured too.
   *
   * Half the screen is not a design decision, it is the line below which nothing can
   * still be a form. `flex: 1` in place of `flex: 1 1 auto` produced 20 px.
   */
  check(
    "the form has room, not just the title and the button",
    sheet.bodyHeight !== null && sheet.bodyHeight > sheet.viewport / 2,
    `content area ${sheet.bodyHeight} px of ${sheet.viewport}`,
  );
  check(
    "the first control of the form is on screen",
    sheet.firstControlBottom !== null && sheet.firstControlBottom <= sheet.viewport + 1,
    `ends at ${sheet.firstControlBottom}`,
  );
  check(
    "the rest of the form is reachable by scrolling",
    sheet.bodyScrollHeight > sheet.bodyHeight,
    `${sheet.bodyScrollHeight} px of form in ${sheet.bodyHeight} px of window`,
  );
}

/* ── The weekly photo has to fill its circle ──────────────────────────────── */

await page.keyboard.press("Escape");
await page.goto(`${BASE}/wochen`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

const photo = await page.evaluate(() => {
  const img = document.querySelector(".cell__photo img");
  if (!img) return null;
  const b = img.getBoundingClientRect();
  const r = img.parentElement.getBoundingClientRect();
  return {
    image: { w: Math.round(b.width), h: Math.round(b.height) },
    circle: { w: Math.round(r.width), h: Math.round(r.height) },
  };
});

if (!photo) {
  console.log("  ---  weekly photo skipped (none recorded)");
} else {
  check(
    "the photo fills the circle exactly",
    photo.image.w === photo.circle.w && photo.image.h === photo.circle.h,
    `image ${photo.image.w}×${photo.image.h}, circle ${photo.circle.w}×${photo.circle.h}`,
  );
}

/* ── Navigation ───────────────────────────────────────────────────────────── */

for (const [name, path] of [
  ["Today", "/"],
  ["Weeks", "/wochen"],
  ["History", "/verlauf"],
  ["Charts", "/kurven"],
  ["More", "/mehr"],
]) {
  await page.getByRole("link", { name }).click();
  await page.waitForTimeout(900);
  check(`navigation "${name}"`, new URL(page.url()).pathname === path, page.url());
}

// The settings sit one step behind "More" now. That step is a plain in-app link, which
// is precisely what was dead in the installed app once before — so it gets checked.
await page.getByRole("link", { name: /Settings/ }).click();
await page.waitForTimeout(900);
check("from More into the settings", new URL(page.url()).pathname === "/einstellungen", page.url());

check(
  "the confirmations switch is there",
  (await page.getByRole("heading", { name: /Confirmations/ }).count()) === 1,
);

check("no script errors", errors.length === 0, errors.join(" | "));

await browser.close();

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
