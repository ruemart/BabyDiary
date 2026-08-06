# BabyMonitor

A small, private web app for the first years: record bottles, nappies, sleep and
growth, and see on a timeline what is coming next — developmental leaps, check-ups,
vaccinations. Plus one photo per week of life, which turns the timeline into an album.

Built for two parents, two phones, and the moment that actually matters: **three in the
morning, one arm free.** Almost everything else follows from that.

Runs on your own hardware. A Raspberry Pi is plenty.

> 🇩🇪 [Deutsche Fassung dieser Anleitung](README.de.md)

---

## Install

```bash
git clone https://github.com/<your-account>/babymonitor.git
cd babymonitor
./install.sh
```

That is the whole installation. The script checks your prerequisites, generates
secrets, builds the containers, waits until the app really answers, and prints an
invite link. It is safe to run again — an existing `.env` is never overwritten.

**You need:** Docker with Compose v2. Nothing else.

---

## What it does

| | |
|---|---|
| **Today** | How long ago the last bottle was, large and legible. One tap for a bottle (amount pre-filled with the median of the last seven feeds), one tap for a nappy, one tap for sleep. Every action can be undone. |
| **Weeks** | A horizontal timeline across 80 weeks of life, scrolled to the current week on open. The weekly photos sit on the axis, along with leap bands, check-ups, vaccinations and a "coming up" list. |
| **Charts** | Daily intake with a rolling weekly average, feeding rhythm across the time of day, a nappy grid by hour, growth against the WHO percentiles. |
| **History** | One day at a time, chosen by week and weekday. The day strip shows intake and nappy count for all seven days at a glance. |
| **What we buy** | Formula, nappy size and anything else — the current one large, with a photo of the packaging for the shop, and the switch history underneath. |
| **Settings** | Child details, language, appearance, weather location, notifications, time-lapse export. |

**Works offline.** Every entry goes into the device's local database first and appears
immediately. Syncing happens in the background. A router reboot, a dead spot in the
nursery or a hanging tunnel never block data entry.

**Bottle reminder.** Optionally your phone can tell you when the next bottle might be
due — estimated from the child's own rhythm (median of recent gaps), not from a table.
Lead time and quiet hours are per device.

**Warm and dimmed at night.** Between 8 pm and 7 am the app switches to an amber,
low-contrast look. That is not decoration: blue light at that hour measurably makes
falling back asleep harder.

---

## Languages

English and German, switchable in Settings. The device language is used on first
launch if it is available; otherwise English.

Adding a language means adding one JSON file — no code changes:

1. Copy `web/src/i18n/locales/en.json` to your language code, e.g. `fr.json`.
2. Translate the values. Keys you have not done yet fall back to English, so a
   half-finished file is still usable.
3. Register it in `web/src/i18n/index.ts` (two lines: the import and the `LOCALES` entry).

A test in CI compares the language files against each other — same keys, no empty
strings, same placeholders, same number of plural forms. All of those go wrong easily
while translating and nobody spots them in a 700-line JSON file.

Dates, times and number formats follow the selected language automatically. Times use
whatever the language uses — `22:08` in German, `10:08 PM` in US English.

---

## Regional data

Check-up and vaccination schedules are a national matter. Everything else is not:
the WHO growth standards are international, and the developmental leap weeks come from
a model used well beyond any one country.

Each country lives in one JSON file under `web/src/data/regions/`. Shipped with the
project: **Germany, Austria, Switzerland, United Kingdom, United States** and **None**.
You pick one during `./install.sh` and can change it any time in Settings — the choice
belongs to the child record, so it syncs to both phones.

> **Only the German file is verified.** It was transcribed from the Robert Koch
> Institute's original and proofread. Every other file was gathered from public sources
> and is explicitly **not** signed off — it carries `verified: false`, and the app says
> so right where the dates are shown. If you check one against your country's official
> schedule, flip that flag and send a pull request. New countries are very welcome —
> see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Making it reachable from outside the house

The app binds to `127.0.0.1` only. That is deliberate: nothing is exposed until you
decide it should be.

**Cloudflare Tunnel** (what the author uses) — no open ports, no dynamic DNS:
`babymonitor-web` joins the external Docker network `cloudflare_proxy`, and in the
Cloudflare dashboard you add a public hostname pointing at `http://babymonitor-web:80`.

**A reverse proxy** you already run works just as well. Point it at port 8090.

> **Whoever has the invite link gets in.** For a family app on an address nobody knows,
> that is a deliberate trade against any login friction at all. If you want more, put
> Cloudflare Access or basic auth in front of it. There are no accounts, no roles and
> no password reset flow — and for two parents and one child, that is a feature.

---

## How it is built

- **Frontend** — Vue 3 + TypeScript + Vite, components from [sit-onyx](https://onyx.schwarz),
  re-themed at the design-token level. PWA with a service worker, IndexedDB (Dexie) as
  the local store.
- **Backend** — Node 24 + Fastify. No build step: Node strips the types on load, so the
  container runs the same source you edit.
- **Database** — SQLite (WAL). One file, backed up with `sqlite3 .backup`.
- **Shared** — `shared/` holds the Zod schema used by both client and server, plus all
  time logic.

### One table for every kind of entry

`entries` holds bottles, nappies, sleep, growth, milestones, notes and photos,
distinguished by `type`. The reason is syncing: one endpoint, one cursor. A new kind of
entry is later a frontend-only change.

Two details that are easy to miss and expensive to get wrong:

- **Deleting means marking.** Without a soft delete the second phone never learns about
  a deletion and pushes the entry back on the next sync.
- **The cursor is a sequence, not a timestamp.** Two writes in the same millisecond
  would silently swallow an entry with a timestamp cursor.

### Time zones

Everything is stored as UTC and displayed in the configured zone. Every day boundary
and every clock time goes through `shared/src/time.ts` with a fixed zone — **never**
through `getTime() / 86400000`. On the day the clocks change a day has 25 hours; anyone
computing in epoch milliseconds shifts exactly the night feeds whose pattern is the
interesting part.

---

## Everyday operation

```bash
docker compose logs -f          # watch
docker compose restart api      # restart after a config change
docker compose down             # stop
git pull && ./install.sh        # update
```

### Backups

The `backup` container writes a copy to `backups/` every night and keeps 30 days.
`./install.sh` takes one more right before it deploys — the nightly one can be up to
24 hours old at exactly the moment a schema change lands. You can also run
`./deploy/backup-now.sh` whenever you like.
`sqlite3 .backup` rather than `cp`: copying a live database with WAL active produces a
file that can be inconsistent when restored.

Files belong to the owner of the data directory with mode `600` — this is a child's
health data and none of the other users on the machine need to read it.

Restoring — **this path has been walked end to end** (database deleted, restored from
the backup, record intact):

```bash
docker compose stop api
gunzip -c backups/babymonitor-YYYYMMDD.db.gz > data/babymonitor.db
rm -f data/babymonitor.db-wal data/babymonitor.db-shm
docker compose start api
```

Photos live in `data/media/` and need their own backup — they are deliberately not in
the database so it stays small and quick to copy.

---

## Development

```bash
npm install

# Backend (port 3010)
cd api && HOUSEHOLD_SECRET=dev-household-secret-1234567890abcd \
  COOKIE_SECRET=dev-cookie-secret-abcdefghijklmnop COOKIE_SECURE=false \
  node --experimental-strip-types --watch src/server.ts

# Frontend (port 5173, /api proxied to 3010)
npm run dev --workspace=web
```

```bash
npm test                        # all suites
npm run build --workspace=web
node tools/check-ios.mjs        # WebKit run — catches iPhone-only bugs
```

`tools/` has a realistic test-data generator, a screenshot run, the offline-sync check,
the icon generator and the WebKit check — see [tools/README.md](tools/README.md).

---

## Data sources

- **Developmental leaps** — leap weeks after the "The Wonder Weeks" model, counted from
  the **due date**. The week numbers are facts and freely usable; the descriptions in
  `web/src/data/leaps.ts` are our own wording. The model is popular among parents but
  scientifically contested — the app says so where it is shown.
- **Check-ups** — G-BA paediatric guideline (Germany).
- **Vaccinations** — [STIKO immunisation calendar 2026](https://www.rki.de/DE/Themen/Infektionskrankheiten/Impfen/Staendige-Impfkommission/Empfehlungen-der-STIKO/Empfehlungen/Impfkalender.html),
  Epid. Bull. 4/2026 (Germany). **Reissued yearly** — when updating, transcribe it from
  the original again rather than editing from memory.
- **Growth charts** — [WHO Child Growth Standards](https://www.who.int/tools/child-growth-standards/standards),
  LMS parameters from the expanded tables, converted by `tools/build-who-tables.py`.

None of this replaces medical advice, and the app says so where it is shown.

---

## Contributing

Bug reports, translations and other countries' schedules are all welcome. See
[CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).

## Licence

[MIT](LICENSE) — do what you like with it. If it helps you through the first year, that
was the whole idea.
