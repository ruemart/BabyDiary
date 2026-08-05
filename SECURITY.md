# Security

## Reporting

Please report security issues privately via GitHub's **"Report a vulnerability"** button
under the Security tab, rather than opening a public issue.

This is a hobby project maintained in the gaps between feeds. Expect a first reply
within a week or so.

## What this app is, security-wise

Be clear-eyed about the trade it makes:

- **Whoever has the invite link can get in.** There are no accounts and no passwords.
  The link contains `HOUSEHOLD_SECRET`, and the session cookie it sets lasts a year.
  For a family app on an address nobody knows, this is a deliberate exchange against
  any login friction at all — at three in the morning, a login screen means the app
  does not get used.
- **It binds to localhost only.** Nothing is reachable from outside until you put a
  tunnel or reverse proxy in front of it, which is your decision and your
  responsibility.
- **If you expose it publicly, put something in front of it.** Cloudflare Access, basic
  auth, a VPN — anything. The app itself does not do rate limiting or brute-force
  protection on the invite token.
- **The data is a child's health record.** Backups are written with mode `600`. Keep
  them somewhere you would be comfortable keeping a paper health booklet.

## What is in scope

- Anything that lets a request without a valid cookie read or write entries.
- Anything that lets one household reach another's data (relevant if you run several).
- Injection, path traversal in the media endpoint, or the timelapse export.

## What is not

- "Anyone with the link gets in" — that is documented and intended.
- Attacks that require access to the machine the app runs on.
