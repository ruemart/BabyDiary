#!/usr/bin/env bash
#
# One backup, right now — before a deploy, or whenever you feel like it.
#
#   ./deploy/backup-now.sh
#
# The nightly backup runs once a day. A deploy that changes the schema happens exactly
# in between, so the newest backup can be up to 24 hours old at the worst possible
# moment. This closes that gap.
#
# Uses the same mechanism as the nightly one: `sqlite3 .backup` through the running
# backup container. Copying a live database with `cp` produces a file that can be
# inconsistent when restored — with WAL active the copy sees an in-between state in
# which parts of a transaction are missing.
#
# Never fails the caller. A missing container or a database that does not exist yet are
# normal on a fresh install, not errors.

set -uo pipefail

cd "$(dirname "$0")/.."

label="${1:-manual}"
stamp="$(date +%Y%m%d-%H%M%S)"
name="milo-${stamp}-${label}.db"

# The project used to be called BabyMonitor. The API renames the file on its next start,
# but this script runs BEFORE that — on exactly the deploy that performs the rename, the
# file is still called the old name, and a check for the new one alone would skip the
# backup at the one moment it matters most.
source="milo.db"
if [ ! -f "data/${source}" ] && [ -f data/babymonitor.db ]; then
  source="babymonitor.db"
fi

if [ ! -f "data/${source}" ]; then
  echo "  no database yet — nothing to back up"
  exit 0
fi

container=milo-backup
if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$container"; then
  container=babymonitor-backup
fi

if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$container"; then
  echo "  backup container is not running — skipping the pre-deploy backup" >&2
  exit 0
fi

# The same container, the same sqlite3, the same mounts as every night.
if docker exec "$container" sh -c "
     sqlite3 /data/${source} \".backup '/backups/${name}'\" &&
     gzip -f '/backups/${name}' &&
     chmod 600 '/backups/${name}.gz' &&
     chown \"\$(stat -c '%u:%g' /data)\" '/backups/${name}.gz'
   "; then
  size=$(stat -c %s "backups/${name}.gz" 2>/dev/null || echo "?")
  echo "  backed up to backups/${name}.gz (${size} bytes)"
else
  # Deliberately only a warning: whoever is deploying should decide whether to carry on,
  # and the script must not block that decision.
  echo "  WARNING: the backup failed. Check with: docker compose logs backup" >&2
fi
