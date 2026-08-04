#!/bin/sh
# Nächtliche Sicherung der SQLite-Datei.
#
# `sqlite3 .backup` statt `cp`: Eine laufende Datenbank zu kopieren erzeugt bei aktivem
# WAL eine Datei, die beim Wiederherstellen inkonsistent sein kann — der Kopiervorgang
# sieht dann einen Zwischenstand, in dem Teile einer Transaktion fehlen.
set -eu

INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"

apk add --no-cache sqlite >/dev/null 2>&1

# Besitzer vom Datenordner übernehmen, statt eine feste UID zu raten. Ohne diesen
# Schritt gehören Ordner und Sicherungen root, und der Mensch, der die Daten
# wiederherstellen will, braucht dafür sudo auf seinem eigenen Rechner.
OWNER="$(stat -c '%u:%g' /data)"
chown "$OWNER" /backups 2>/dev/null || true

while true; do
  STAMP="$(date +%Y%m%d)"
  TARGET="/backups/babymonitor-$STAMP.db"

  if sqlite3 /data/babymonitor.db ".backup '$TARGET'"; then
    gzip -f "$TARGET"
    # 600 statt der Vorgabe 644: Das sind Gesundheitsdaten eines Kindes und gehen
    # andere Nutzer auf dem Gerät nichts an.
    chmod 600 "$TARGET.gz"
    chown "$OWNER" "$TARGET.gz"
    echo "[backup] $STAMP gesichert ($(stat -c %s "$TARGET.gz") Bytes)"
  else
    echo "[backup] $STAMP FEHLGESCHLAGEN" >&2
  fi

  find /backups -name 'babymonitor-*.db.gz' -mtime "+$KEEP_DAYS" -delete
  sleep "$INTERVAL"
done
