#!/usr/bin/env bash
# Static nginx frontend rollout with plain docker pull / docker run (no compose, no Vault: nothing secret in the container).
# Runs on the self-hosted runner on the server (label iwillbegoogler-prod, deploy user).
#   env: SERVICE        web | admin (container name iwillbegoogler-<service>, network alias <service>)
#        IMAGE          registry image without tag, e.g. ghcr.io/iwillbegoogler/iwillbegoogler-web
#        TAG            image tag (short sha); an older tag = rollback
#        MEMORY, CPUS   limits, e.g. 64m / 0.5
#        CONTAINER_ENV  optional, KEY=VALUE per line
# The old container is kept stopped until the new one is healthy; on failure it is started again.
set -euo pipefail
: "${SERVICE:?}" "${IMAGE:?}" "${TAG:?}" "${MEMORY:?}" "${CPUS:?}"
case $SERVICE in web | admin) ;; *) echo "bad SERVICE" >&2; exit 1 ;; esac
case $TAG in *[!A-Za-z0-9_.-]*) echo "bad TAG" >&2; exit 1 ;; esac
NETWORK=${DOCKER_NETWORK:-iwillbegoogler}
WAIT=${WAIT_TIMEOUT:-120}
name=iwillbegoogler-$SERVICE
legacy=$name-1 # name the compose stack gave it

env_args=()
while IFS= read -r kv; do [ -n "$kv" ] && env_args+=(-e "$kv"); done <<<"${CONTAINER_ENV:-}"

docker pull -q "$IMAGE:$TAG" >/dev/null

docker rm -f "$name-old" >/dev/null 2>&1 || true
if docker inspect "$name" >/dev/null 2>&1; then
	docker rename "$name" "$name-old"
elif docker inspect "$legacy" >/dev/null 2>&1; then
	docker rename "$legacy" "$name-old"
fi
if docker inspect "$name-old" >/dev/null 2>&1; then docker stop -t 20 "$name-old" >/dev/null; fi

rollback() {
	echo "rollout failed, restoring the previous container" >&2
	docker logs --tail 40 "$name" >&2 || true
	docker rm -f "$name" >/dev/null 2>&1 || true
	if docker inspect "$name-old" >/dev/null 2>&1; then
		docker rename "$name-old" "$name"
		docker start "$name" >/dev/null
	fi
	exit 1
}

docker run -d --name "$name" --network "$NETWORK" --network-alias "$SERVICE" --restart unless-stopped \
	--memory "$MEMORY" --cpus "$CPUS" \
	--read-only --tmpfs /tmp --tmpfs /var/run --tmpfs /var/cache/nginx --tmpfs /etc/nginx/conf.d \
	--cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add NET_BIND_SERVICE --cap-add SETGID --cap-add SETUID \
	--security-opt no-new-privileges:true \
	--log-driver json-file --log-opt max-size=10m --log-opt max-file=5 \
	--health-cmd 'wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1' \
	--health-interval 10s --health-timeout 3s --health-retries 3 --health-start-period 10s \
	"${env_args[@]}" "$IMAGE:$TAG" >/dev/null || rollback

end=$((SECONDS + WAIT))
while :; do
	st=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$name" 2>/dev/null || echo absent)
	[ "$st" = healthy ] && break
	case $st in exited | dead | absent) rollback ;; esac
	[ "$SECONDS" -lt "$end" ] || rollback
	sleep 2
done
docker rm -f "$name-old" >/dev/null 2>&1 || true
echo "deploy ok: $SERVICE $TAG"
