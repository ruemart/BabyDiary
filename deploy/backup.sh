#!/bin/sh
# Nightly backup of the SQLite file.
#
# `sqlite3 .backup` rather than `cp`: copying a live database with WAL active produces a
# file that can be inconsistent when restored — the copy sees an in-between state in
# which parts of a transaction are missing.
set -eu

INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"

apk add --no-cache sqlite >/dev/null 2>&1

# Take ownership from the data directory rather than guessing a fixed UID. Without this
# step the directory and the backups belong to root, and the person wanting to restore
# their data needs sudo on their own machine.
OWNER="$(stat -c '%u:%g' /data)"
chown "$OWNER" /backups 2>/dev/null || true

while true; do
  STAMP="$(date +%Y%m%d)"
  TARGET="/backups/babydiary-$STAMP.db"

  # Falls back through the earlier file names: if the API has not restarted since a
  # rename, one of those is still what is on disk — and a backup loop that quietly does
  # nothing is worse than no backup loop at all, because it looks like it is working.
  # Newest first, matching EARLIER_DB_NAMES in api/src/db.ts.
  SOURCE=/data/babydiary.db
  for candidate in /data/babydiary.db /data/milo.db /data/babymonitor.db; do
    [ -f "$candidate" ] && SOURCE="$candidate" && break
  done

  if sqlite3 "$SOURCE" ".backup '$TARGET'"; then
    gzip -f "$TARGET"
    # 600 rather than the default 644: this is a child's health data and none of the
    # other users on the machine need to read it.
    chmod 600 "$TARGET.gz"
    chown "$OWNER" "$TARGET.gz"
    echo "[backup] $STAMP saved ($(stat -c %s "$TARGET.gz") bytes)"
  else
    echo "[backup] $STAMP FAILED" >&2
  fi

  # Any prefix, not just the current one. Matching the project's name here meant that
  # after a rename the older backups were never swept up again and the directory grew
  # forever — quietly, because nothing about it looks broken.
  find /backups -name '*.db.gz' -mtime "+$KEEP_DAYS" -delete
  sleep "$INTERVAL"
done
