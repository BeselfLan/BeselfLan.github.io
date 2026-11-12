#!/usr/bin/env bash
# Topology (b) end to end on one loopback port, under its own Compose project:
# builds the API and the site image (one at a time, the host is short of
# memory), brings the stack up, and proves with curl and a real browser that the
# site carries its security headers and caching, that a demo plays through the
# API, that the site stays up and shows "Demo offline" once the API is stopped,
# and that tearing the project down leaves nothing of it behind. Prints
# SMOKE_WEB_OK.
# Needs docker (with compose), curl, node and `npm ci` (for Playwright's
# Chromium). It uses only its own project and one port on 127.0.0.1 (at least
# 1024). It never touches another project, network or image, never publishes a
# port on 80 or 443, and runs every one-off container with no network.
# Usage: SMOKE_PORT=<port> SMOKE_PROJECT=<name> deploy/smoke-web.sh
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
project=${SMOKE_PROJECT:-beself-22-web}

# Compose lets shell variables override --env-file, so none of ours may leak in:
# a shell NEXT_PUBLIC_API_URL would bake the wrong origin into the image.
unset API_SITE WEB_SITE WEB_IMAGE NEXT_PUBLIC_API_URL HTTP_PORT HTTPS_PORT \
  PUBLIC_MEDIA_BASE_URL CORS_ORIGINS API_IMAGE MEDIA_HOST_DIR EDGE_NETWORK \
  RESEND_API_KEY CONTACT_TO CONTACT_FROM ADMIN_TOKEN DMOJ_USER GITHUB_USER \
  MEDIA_SYNC_TARGET COMPOSE_FILE COMPOSE_PROFILES COMPOSE_PROJECT_NAME

# Refused before anything runs: a port below 1024 is a host service's.
if [[ -n ${SMOKE_PORT:-} ]] && { ! [[ $SMOKE_PORT =~ ^[0-9]+$ ]] || ((10#$SMOKE_PORT < 1024 || 10#$SMOKE_PORT > 65535)); }; then
  echo "SMOKE WEB FAIL: SMOKE_PORT must be a number from 1024 to 65535, not $SMOKE_PORT" >&2
  exit 1
fi

for tool in docker curl node; do
  command -v "$tool" >/dev/null || { echo "SMOKE WEB FAIL: needs $tool" >&2; exit 1; }
done
[[ -d $root/node_modules/@playwright/test ]] || { echo "SMOKE WEB FAIL: run npm ci first (Playwright is missing)" >&2; exit 1; }

port=${SMOKE_PORT:-$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')}
api=http://127.0.0.1:$port
site=http://web.localhost:$port

work=$(mktemp -d)

compose() {
  docker compose -p "$project" --env-file "$work/env" \
    -f "$root/deploy/docker-compose.yml" -f "$root/deploy/docker-compose.web.yml" \
    -f "$root/deploy/docker-compose.local.yml" "$@"
}
cleanup() {
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT
fail() {
  echo "SMOKE WEB FAIL: $1" >&2
  compose logs --tail 20 >&2 2>/dev/null || true
  exit 1
}

# The three real demos, read-only, from this checkout.
cat >"$work/env" <<ENV
API_SITE=:80
WEB_SITE=http://web.localhost
HTTP_PORT=$port
PUBLIC_MEDIA_BASE_URL=$api/media/files
CORS_ORIGINS=$site
NEXT_PUBLIC_API_URL=$api
MEDIA_HOST_DIR=$root/apps/web/public/media
ENV

# One image at a time. Compose builds with BuildKit, which honours the
# allowlist beside each Dockerfile.
for service in api web; do
  compose build "$service" >"$work/build-$service.log" 2>&1 || {
    tail -n 40 "$work/build-$service.log" >&2
    fail "the $service image did not build"
  }
  echo "$service: $(grep -m1 'transferring context: [0-9.]*[kMG]*B ' "$work/build-$service.log" || echo 'context size not found')"
done

compose up -d --no-build --wait --wait-timeout 180 || fail "the stack did not come up healthy"

# 2. The API, through Caddy, with the three real demos.
health=$(curl -sS -w '\n%{http_code}' "$api/health") || fail "/health did not answer"
[[ ${health##*$'\n'} == 200 ]] || fail "/health is not 200: $health"
[[ $health == *'"ok":true'* && $health == *'"mediaCount":3'* ]] || fail "/health body: $health"

# 3. The site, by its own host name: HTML, and every security header.
status=$(curl -sS -o "$work/index.html" -D "$work/index.headers" -w '%{http_code}' -H "Host: web.localhost:$port" "$api/") || fail "the site did not answer"
[[ $status == 200 ]] || fail "the site is $status"
grep -qi '^content-type: text/html' "$work/index.headers" || fail "the site is not text/html"
for header in content-security-policy strict-transport-security x-content-type-options \
  x-frame-options referrer-policy permissions-policy cross-origin-opener-policy; do
  grep -qi "^$header:" "$work/index.headers" || fail "the site sends no $header"
done
grep -qi "^content-security-policy:.*connect-src 'self' ${api}[;[:space:]]" "$work/index.headers" \
  || fail "the CSP's connect-src does not name $api: $(grep -i '^content-security-policy' "$work/index.headers")"

# 4. Caching: hashed names for good, everything else revalidated.
asset=$(grep -o '/_next/static/[^"]*\.js' "$work/index.html" | sed -n 1p) || true
[[ -n $asset ]] || fail "no /_next/static/ script in the page"
curl -sS -o /dev/null -D "$work/asset.headers" -H "Host: web.localhost:$port" "$api$asset" || fail "$asset did not answer"
grep -qi '^cache-control: public, max-age=31536000, immutable' "$work/asset.headers" || fail "$asset is not immutable"
grep -qi '^cache-control: no-cache' "$work/index.headers" || fail "/ is not no-cache"

# 5. Range: Caddy answers 206 with the right headers.
range=$(curl -sS -o /dev/null -D - -r 0-1023 "$api/media/files/deadknight.mp4") || fail "the Range request failed"
grep -qi '^HTTP/[0-9.]* 206' <<<"$range" || fail "Range is not 206: $range"
grep -qi '^content-range: bytes 0-1023/' <<<"$range" || fail "no Content-Range: $range"

# 6. Who is reachable, and as whom. The site publishes nothing and is not root;
# only Caddy publishes, on one loopback port; the image holds only the export.
web=$(compose ps -q web)
caddy=$(compose ps -q caddy)
[[ -n $web && -n $caddy ]] || fail "the web or caddy container is missing"
[[ -z $(docker port "$web" 2>/dev/null || true) ]] || fail "the site publishes a port"
[[ $(docker port "$caddy") == "80/tcp -> 127.0.0.1:$port" ]] || fail "Caddy publishes: $(docker port "$caddy")"
[[ $(compose exec -T web id -u) != 0 ]] || fail "the site runs as root"
[[ $(docker image inspect -f '{{.Config.User}}' beselfos-web:local) == 65534:65534 ]] || fail "the site image user is not 65534:65534"
docker run --rm --network none --entrypoint sh beselfos-web:local -c \
  '! command -v node && ! command -v npm && test -f /srv/index.html && test -f /srv/404.html && ! test -e /app' \
  || fail "the site image holds Node or the sources, or lacks the export"

# 7. A real browser plays a demo through the API.
node "$root/deploy/smoke-browser.mts" online "$site" "$api" >"$work/browser-online.log" 2>&1 \
  || fail "$(cat "$work/browser-online.log")"
[[ $(docker inspect -f '{{.State.OOMKilled}}' "$web") == false ]] || fail "the site was killed for memory: raise mem_limit"

# 8. Stop the API: the site stays up, the API does not answer.
compose stop api >/dev/null || fail "could not stop the API"
[[ $(curl -sS -o /dev/null -w '%{http_code}' -H "Host: web.localhost:$port" "$api/") == 200 ]] || fail "the site went down with the API"
[[ $(curl -sS -o /dev/null -w '%{http_code}' "$api/health") != 200 ]] || fail "/health still answers with the API stopped"

# 9. The site says so: Play is offline, with its tooltip, and so is the tray.
node "$root/deploy/smoke-browser.mts" offline "$site" "$api" >"$work/browser-offline.log" 2>&1 \
  || fail "$(cat "$work/browser-offline.log")"

# 10. Tear down, and prove nothing of this project is left.
compose down -v --remove-orphans >/dev/null || fail "could not tear the project down"
label=label=com.docker.compose.project=$project
[[ -z $(docker ps -aq --filter "$label") ]] || fail "containers of $project are left"
[[ -z $(docker network ls -q --filter "$label") ]] || fail "networks of $project are left"
[[ -z $(docker volume ls -q --filter "$label") ]] || fail "volumes of $project are left"

echo SMOKE_WEB_OK
