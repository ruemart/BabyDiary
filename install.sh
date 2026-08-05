#!/usr/bin/env bash
#
# BabyMonitor — one command from a fresh clone to a running app.
#
# Everything this script does, you could do by hand in five minutes. It exists
# because the five minutes are spent at the worst possible time: you have a
# newborn, and you are setting this up between two feeds.
#
#   ./install.sh
#
# It is safe to run again. An existing .env is never overwritten, and your data
# is never touched.

set -euo pipefail

cd "$(dirname "$0")"

BOLD=$'\033[1m'
DIM=$'\033[2m'
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
RED=$'\033[31m'
OFF=$'\033[0m'

say() { printf '%s\n' "$*"; }
step() { printf '\n%s==>%s %s\n' "$BOLD" "$OFF" "$*"; }
ok() { printf '  %s✓%s %s\n' "$GREEN" "$OFF" "$*"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$OFF" "$*"; }
die() {
  printf '\n  %s✗%s %s\n\n' "$RED" "$OFF" "$*" >&2
  exit 1
}

# ── 1. Prerequisites ────────────────────────────────────────────────────────
#
# Checked up front rather than letting the build fail halfway: a stack trace
# from a missing docker is a bad first impression of a project you are trying
# out for the first time.

step "Checking prerequisites"

command -v docker >/dev/null 2>&1 || die "Docker is not installed. See https://docs.docker.com/engine/install/"
docker info >/dev/null 2>&1 || die "Docker is installed but not running (or needs sudo). Start it and try again."
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is missing. It ships with current Docker versions."
ok "Docker and Compose are ready"

if command -v openssl >/dev/null 2>&1; then
  gen_secret() { openssl rand -hex 32; }
elif [ -r /dev/urandom ]; then
  # Fallback without openssl — plenty for a 256-bit hex string.
  gen_secret() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
else
  die "Neither openssl nor /dev/urandom is available; cannot generate secrets."
fi

# ── 2. Secrets ──────────────────────────────────────────────────────────────

step "Preparing configuration"

if [ -f .env ]; then
  ok ".env already exists — leaving it untouched"
else
  cp .env.example .env
  # Generated, not asked for. A password prompt here would only tempt people
  # into something short and memorable, and this value is never typed by hand.
  sed -i.bak "s|^HOUSEHOLD_SECRET=.*|HOUSEHOLD_SECRET=$(gen_secret)|" .env
  sed -i.bak "s|^COOKIE_SECRET=.*|COOKIE_SECRET=$(gen_secret)|" .env
  rm -f .env.bak
  ok "Created .env with fresh secrets"
fi

# Push notifications are optional. Without keys the whole section is simply
# hidden in the app, so a failure here must not stop the install.
if grep -q '^VAPID_PUBLIC_KEY=$' .env 2>/dev/null; then
  if command -v node >/dev/null 2>&1 && [ -d node_modules/web-push ]; then
    keys=$(node -e "const k=require('web-push').generateVAPIDKeys();console.log(k.publicKey+' '+k.privateKey)" 2>/dev/null || true)
    if [ -n "$keys" ]; then
      sed -i.bak "s|^VAPID_PUBLIC_KEY=.*|VAPID_PUBLIC_KEY=${keys%% *}|" .env
      sed -i.bak "s|^VAPID_PRIVATE_KEY=.*|VAPID_PRIVATE_KEY=${keys##* }|" .env
      rm -f .env.bak
      ok "Generated push notification keys"
    fi
  else
    warn "Skipping push notification keys (needs Node and 'npm install')."
    warn "The app works fine without them; see README for how to add them later."
  fi
fi

mkdir -p data backups data/web-assets
ok "Data directories ready"

# ── 3. Build and start ──────────────────────────────────────────────────────

step "Building and starting (this takes a few minutes the first time)"
docker compose up -d --build

# ── 4. Wait until it actually answers ───────────────────────────────────────
#
# "Container started" is not the same as "app works". Compiling better-sqlite3
# on a Raspberry Pi takes a moment, and reporting success too early sends
# people to a URL that is not up yet.

step "Waiting for the app to respond"
port=$(grep -oE '127\.0\.0\.1:[0-9]+:80' docker-compose.yml | head -1 | cut -d: -f2)
port=${port:-8090}

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; then
    ok "The app is answering on port ${port}"
    healthy=1
    break
  fi
  sleep 2
done

if [ -z "${healthy:-}" ]; then
  die "No answer after two minutes. Check the logs with: docker compose logs"
fi

# ── 5. The invite link ──────────────────────────────────────────────────────

secret=$(grep '^HOUSEHOLD_SECRET=' .env | cut -d= -f2-)

cat <<BANNER

${GREEN}${BOLD}BabyMonitor is running.${OFF}

Open this link ${BOLD}once per device${OFF} — phone, tablet, laptop:

  ${BOLD}http://127.0.0.1:${port}/start?t=${secret}${OFF}

Pick a name, fill in the child's details, done. The session cookie lasts a
year, so there is never a login screen again — which is the entire point at
three in the morning.

${DIM}On the phone, add the page to the home screen afterwards. Only then does it
run full-screen and start fast enough to be worth reaching for.${OFF}

Next steps:
  • Reach it from outside the house  →  README.md, "Making it reachable"
  • Nightly backups are already running to ./backups
  • Anyone with that link gets in. Treat it like a house key.

BANNER
