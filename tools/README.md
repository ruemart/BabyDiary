# Development tools

Not part of the app — all of these run against a local development server or the build.

## `seed-dev-data.mjs`

Seeds 30 days of realistic data (feeds, nappies, sleep, weigh-ins).

```bash
node tools/seed-dev-data.mjs
```

Without real data the charts cannot be judged: a single data point shows neither whether
the axes are right nor whether the rhythm chart actually makes the night-time band
visible. The random generator is deterministic, so two runs produce the same data.

Assumes the app is already set up (a child exists).

## `screenshots.mjs`

Walks the app in both appearances and writes screenshots.

```bash
node tools/screenshots.mjs /path/to/output
```

Reports all console errors at the end — a useful side effect when checking a rework.

## `verify-offline-sync.mjs`

Checks the most important path of the app against the finished Docker stack: record
offline, sign in a second device, sync, propagate a deletion.

```bash
INVITE=$(grep '^HOUSEHOLD_SECRET=' .env | cut -d= -f2) \
BASE=http://127.0.0.1:8090 \
node tools/verify-offline-sync.mjs
```

## `build-who-tables.py`

Converts the WHO "expanded tables" (xlsx) into the compact JSON under
`web/src/data/who/`. Only L, M and S are kept per anchor point — every percentile can be
computed exactly from those.

## `build-world-map.mjs`

Turns Natural Earth country borders into a single SVG path at build time, so the app
contacts no map service at runtime.

## `build-icons.py`

Generates the app icons into `web/public/`.

```bash
python3 tools/build-icons.py
```

The files were listed in the manifest and in `index.html` from day one but never
existed — nginx served `index.html` for each of them with status 200, so nothing looked
wrong. The home screen kept a placeholder, and notifications had no image.

Drawn at 1024 px and scaled down; that smooths the edges better than drawing at the
target size. The maskable icon respects the safe zone: Android crops freely, and only
the central circle is reliably visible.

## `check-ios.mjs`

Runs the app in **WebKit** — the engine that also runs on the iPhone.

```bash
node tools/check-ios.mjs
```

Prompted by three bugs in a row that only existed on the iPhone and looked perfectly
fine in Chromium: dead navigation items, a sheet sitting three quarters below the
screen, and a weekly photo that did not fill its circle. Each time it meant guessing,
because no second engine ran here.

Runs against the **development server**, not the Docker stack: the session cookie is
`Secure` there, and WebKit refuses such cookies over HTTP. Chromium makes an exception
for localhost — which is exactly why this went unnoticed for so long.

One-time setup so WebKit starts:

```bash
npx playwright install webkit
sudo apt-get install -y libharfbuzz-icu0 libmanette-0.2-0 libhyphen0
```
