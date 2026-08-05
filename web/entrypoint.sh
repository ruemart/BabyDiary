#!/bin/sh
set -e

# Die Bausteine der App überleben das Ausrollen.
#
# Die Ansichten werden bei Bedarf nachgeladen, und ihre Dateinamen tragen einen
# Inhalts-Hash. Wurde das Abbild bisher komplett ersetzt, waren die Dateien der alten
# Fassung im selben Moment weg — ein Gerät, das die App noch offen hatte, lief mit
# JavaScript, das auf nicht mehr vorhandene Dateien verwies. Der Navigationspunkt tat
# dann scheinbar nichts.
#
# Deshalb liegt /assets in einem Ordner, der den Neubau überdauert: Neue Dateien kommen
# DAZU, alte bleiben liegen. Ein Gerät mit der alten Fassung läuft weiter, bis es von
# selbst neu lädt. Der Notausgang im Router bleibt trotzdem bestehen — er ist jetzt nur
# nicht mehr der Normalfall.
#
# index.html, sw.js und das Manifest werden dagegen IMMER ersetzt: Sie tragen keinen
# Hash und müssen die neue Fassung zeigen.

DIST=/opt/app-dist
ROOT=/usr/share/nginx/html
KEEP_DAYS="${ASSET_KEEP_DAYS:-30}"

mkdir -p "$ROOT/assets"

# Kopieren, ohne je zu löschen: Neue Dateien kommen dazu, gleichnamige werden
# überschrieben (bei gleichem Hash ist der Inhalt ohnehin identisch), alte bleiben.
#
# Ausdrücklich OHNE `-n`: Das BusyBox-`cp` in diesem Abbild legt mit `-Rn` zwar die
# Dateien an, schreibt aber KEINEN Inhalt — alles landet mit 0 Byte. Einmal so
# ausgeliefert, und die Seite bleibt weiß.
#
# Der Nebeneffekt des Kopierens ist hier erwünscht: Jede Datei dieser Fassung bekommt
# das heutige Datum. Genau daran erkennt das Aufräumen unten, was noch gebraucht wird.
cp -R "$DIST/assets/." "$ROOT/assets/"

# Aufräumen: Was seit KEEP_DAYS in keiner Fassung mehr vorkam, braucht niemand mehr.
# Ohne das wüchse der Ordner mit jedem Ausrollen.
removed=$(find "$ROOT/assets" -type f -mtime "+$KEEP_DAYS" -print -delete | wc -l)

# Alles Übrige ersetzen.
find "$DIST" -maxdepth 1 -type f -exec cp {} "$ROOT/" \;

echo "web: $(find "$ROOT/assets" -type f | wc -l) Bausteine vorrätig, $removed veraltete entfernt"

exec nginx -g 'daemon off;'
