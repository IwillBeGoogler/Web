#!/usr/bin/env bash
# Release Web from this machine when GitHub Actions cannot run (billing, outage): the same checks and the same server
# rollout as CD, without the registry.
#   CI (bun run ci) -> docker build linux/amd64 -> docker save | ssh | docker load -> .github/scripts/deploy-docker.sh
# Usage:  bun run deploy:local            from a clean checkout of the commit to ship (tag = short sha)
# Env:    DEPLOY_HOST (dev@ssh.iwillbegoogler.uz), SKIP_CI=1 (checks already ran), ALLOW_DIRTY=1 (tag gets -dirty)
# Needs:  docker, ssh access with passwordless sudo on the server. The trivy scan of CD runs only when trivy is installed.
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${DEPLOY_HOST:-dev@ssh.iwillbegoogler.uz}
IMAGE=ghcr.io/iwillbegoogler/iwillbegoogler-web
TAG=$(git rev-parse --short=7 HEAD)
if [ -n "$(git status --porcelain)" ]; then
	[ "${ALLOW_DIRTY:-0}" = 1 ] || { echo "working tree not clean: commit first (or ALLOW_DIRTY=1)" >&2; exit 1; }
	TAG=$TAG-dirty
fi

[ "${SKIP_CI:-0}" = 1 ] || bun run ci

echo "==> build $IMAGE:$TAG"
docker build --platform linux/amd64 -f Dockerfile -t "$IMAGE:$TAG" .
if command -v trivy >/dev/null; then
	trivy image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 "$IMAGE:$TAG"
else
	echo "trivy not installed: image scan skipped"
fi

echo "==> ship to $HOST"
docker save "$IMAGE:$TAG" | gzip -1 | ssh "$HOST" 'gunzip | sudo docker load -q'

echo "==> deploy"
ssh "$HOST" "sudo -u deploy env SKIP_PULL=1 SERVICE=web IMAGE=$IMAGE TAG=$TAG MEMORY=64m CPUS=0.5 \
CONTAINER_ENV='API_URL=http://api:8080
MQTT_URL=http://emqx:8083' bash -s" <.github/scripts/deploy-docker.sh
curl -fsS -o /dev/null -w "site %{http_code}\n" https://iwillbegoogler.uz/
