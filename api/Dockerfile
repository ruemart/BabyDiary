# syntax=docker/dockerfile:1
#
# Kein Build-Schritt für TypeScript: Node 24 strippt die Typen beim Laden. Dadurch
# läuft im Container derselbe Quelltext, der auch lokal läuft — keine dist/, die
# gegenüber den Quellen veralten kann.

FROM node:24-alpine AS deps
WORKDIR /app

# better-sqlite3 wird auf arm64 aus der Quelle übersetzt, falls kein passendes
# Fertigpaket vorliegt. Auf einem Pi 5 dauert das unter einer Minute; die Werkzeuge
# bleiben in dieser Stufe und landen nicht im Laufzeit-Abbild.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY web/package.json web/

# --omit=dev, aber der Workspace braucht die Paketdateien aller drei Teile, damit
# npm den Baum auflösen kann.
RUN npm ci --omit=dev --workspace=@babymonitor/api --include-workspace-root

FROM node:24-alpine AS runtime
WORKDIR /app

# ffmpeg erzeugt den Zeitraffer aus den Wochenfotos.
# su-exec lässt den Entrypoint die Rechte am Datenordner richten und danach auf den
# unprivilegierten Nutzer wechseln.
RUN apk add --no-cache ffmpeg tini su-exec

ENV NODE_ENV=production
ENV DATA_DIR=/data

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY shared ./shared
COPY api ./api
COPY api/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh \
  && mkdir -p /data \
  && chown -R node:node /data /app

EXPOSE 3010

# tini als PID 1: sonst erreicht SIGTERM den Node-Prozess nicht sauber und
# `docker compose down` wartet zehn Sekunden auf den Timeout.
# Das Entrypoint-Skript startet als root, richtet die Rechte am Bind-Mount und
# wechselt dann per su-exec auf `node`.
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3010/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--experimental-strip-types", "api/src/server.ts"]
