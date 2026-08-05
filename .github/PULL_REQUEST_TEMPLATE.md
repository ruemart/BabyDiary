## What and why

<!-- The reason, not the diff. What problem does this solve? -->

## Checked

- [ ] `npm test` passes
- [ ] `npm run build --workspace=web` passes
- [ ] For layout changes: `node tools/check-ios.mjs` passes (WebKit has bitten this
      project three times where Chromium looked fine)
- [ ] Any new user-visible text goes through `$t()` and exists in **both** language files
