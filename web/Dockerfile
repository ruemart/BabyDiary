# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci --workspace=@babymonitor/web --include-workspace-root

COPY tsconfig.base.json ./
COPY shared ./shared
COPY web ./web

RUN npm run build --workspace=@babymonitor/web

FROM nginx:1.27-alpine AS runtime
COPY web/nginx.conf /etc/nginx/conf.d/default.conf

# Der Bauplan liegt daneben, nicht direkt im Auslieferungsordner: Das Startskript legt
# die Dateien dort ab und lässt die der vorigen Fassung stehen. Warum, steht dort.
COPY --from=build /app/web/dist /opt/app-dist
COPY web/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
