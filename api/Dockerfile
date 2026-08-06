# syntax=docker/dockerfile:1
#
# No build step for TypeScript: Node 24 strips the types on load. That way the container
# runs the same source that runs locally — no dist/ that can go stale against it.

FROM node:24-alpine AS deps
WORKDIR /app

# better-sqlite3 is compiled from source on arm64 when no prebuilt package fits. On a
# Pi 5 that takes under a minute; the toolchain stays in this stage and never reaches the
# runtime image.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY web/package.json web/

# --omit=dev, but the workspace needs the package files of all three parts so npm can
# resolve the tree.
RUN npm ci --omit=dev --workspace=@babymonitor/api --include-workspace-root

FROM node:24-alpine AS runtime
WORKDIR /app

# ffmpeg erzeugt den Zeitraffer aus den Wochenfotos.
# su-exec lets the entrypoint fix the permissions on the data directory and then drop to
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

# tini as PID 1: otherwise SIGTERM does not reach the Node process cleanly and
# `docker compose down` wartet zehn Sekunden auf den Timeout.
# The entrypoint script starts as root, fixes the permissions on the bind mount and
# wechselt dann per su-exec auf `node`.
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3010/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--experimental-strip-types", "api/src/server.ts"]
