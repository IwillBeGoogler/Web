# syntax=docker/dockerfile:1
# IWillBeGoogler web (blog + embedded diagram editor).
#
# Self-contained: the build context is this folder (Web/). The diagram editor lives in ./editor.
#
#   docker build -t iwillbegoogler-web Web/          # from the repository root
#   docker build -t iwillbegoogler-web .             # from inside Web/
#   docker compose up --build               # the root docker-compose.yml does the same (context: Web)

FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . ./
RUN bun run build

FROM nginx:1-alpine

# Pick up fixed Alpine packages the base image has not rebuilt yet (Trivy gate: libxslt CVE-2026-9947 / CVE-2026-87636, fixed in 1.1.43-r4).
RUN apk upgrade --no-cache
ENV API_URL=http://api:8080
# EMQX WebSocket listener for /mqtt (diagram realtime); the root compose sets it too
ENV MQTT_URL=http://emqx:8083
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
