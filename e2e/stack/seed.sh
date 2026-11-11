#!/bin/sh
# One published story, so the reader specs (they open "the first story of the feed") have something to open.
# The rest of the suite creates its own content. Usage: e2e/stack/seed.sh [base url]
set -eu
base=${1:-${E2E_BASE_URL:-http://localhost:3000}}
token=$(curl -fsS -X POST "$base/api/auth/login" -H 'content-type: application/json' \
	-d '{"login":"admin","password":"admin12345"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$token" ] || { echo "seed: admin login failed" >&2; exit 1; }
curl -fsS -X POST "$base/api/posts" -H "Authorization: Bearer $token" -H 'content-type: application/json' \
	-d '{"title":"A first story for the reader specs","body":"Written by e2e/stack/seed.sh so the feed is not empty.\n\nSecond paragraph.","status":"published","tags":[],"label_ids":[]}' >/dev/null
echo "seed: ok"
