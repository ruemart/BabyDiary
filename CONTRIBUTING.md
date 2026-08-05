# Contributing

Thanks for looking. This is a small project with a narrow purpose: help two parents
through the first years without getting in the way. That purpose is the yardstick for
every change.

## The one design rule

**Three in the morning, one arm free.** If a change adds a tap, a question or a moment
of thinking to recording a bottle or a nappy, it needs a very good reason. Features
that live one level deeper — charts, statistics, the travel map — may be as rich as
you like.

## Translations

The most useful contribution, and the easiest.

1. Copy `web/src/i18n/locales/en.json` to your language code, e.g. `fr.json`.
2. Translate the values. Untranslated keys fall back to English, so a partial file is
   already useful — send it in before it is complete.
3. Add two lines in `web/src/i18n/index.ts`: the import and the `LOCALES` entry.

Notes:

- `{name}` style placeholders must survive translation; the code fills them in.
- A `|` separates singular and plural (`"{n} day ago | {n} days ago"`).
- Do not translate the keys, only the values.
- Dates, times and numbers are formatted by the browser from the language code — you
  do not need to do anything for those.

## Other countries' check-up and vaccination schedules

Currently only the German schedules are included. To add another country:

1. Add `web/src/data/checkups.<cc>.ts` and `vaccinations.<cc>.ts` following the German
   files' shape.
2. **Transcribe from the official source, and cite it in the file** with the edition
   date. Do not write these from memory, and do not copy them from another app —
   they change, and being wrong here matters.
3. Register the country in the region list.

## Code

- **Everything in the repository is English**: code, comments, tests, commit messages.
  The project was written in German first and translated; if you find a German leftover,
  a pull request fixing it is welcome.
- Comments explain **why**, not what — if a line needs a comment to say what it does, the
  line is usually the problem.
- No new dependency without a reason that survives being said out loud.
- `npm test` and `npm run build --workspace=web` must pass.
- For anything touching layout, run `node tools/check-ios.mjs` too. WebKit has bitten
  this project three times where Chromium looked perfectly fine.

## Commits

Describe the *reason*, not the diff. "Fixed bug" tells the next person nothing; "the
sheet's entry animation stayed on its first frame in WebKit, pushing it 72 px below the
screen" tells them everything.

## What is deliberately not here

- Accounts, roles, password resets — one household, one invite link.
- Cloud hosting or a hosted version. It runs on your hardware, and the data stays there.
- Anything that turns observations into judgements about the child.
