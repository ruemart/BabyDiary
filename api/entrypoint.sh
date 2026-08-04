#!/bin/sh
set -e

# Der Datenordner kommt als Bind-Mount vom Host herein und gehört dort typischerweise
# root — die Rechte aus dem Abbild werden davon überdeckt. Deshalb hier einmalig
# geradeziehen und erst dann die Rechte ablegen.
#
# Die Alternative wäre, dem Nutzer vor dem ersten Start ein `chown` abzuverlangen.
# Ein Deployment, das an einem vergessenen Handgriff scheitert, ist ein schlechtes
# Deployment.
if [ -d "${DATA_DIR:-/data}" ]; then
  chown -R node:node "${DATA_DIR:-/data}" 2>/dev/null || true
fi

exec su-exec node "$@"
