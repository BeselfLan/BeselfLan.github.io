#!/usr/bin/env bash
# Brings the local stack up under its own project name on a free loopback port,
# proves the acceptance lines with curl, and tears the stack down again.
# Needs docker (with compose), ffmpeg, curl and node. Prints SMOKE_OK.
# Usage: deploy/smoke.sh        (SMOKE_PROJECT overrides the project name)
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
project=${SMOKE_PROJECT:-beself-12-test}

# Compose lets shell variables override --env-file, so none of ours may leak in.
unset API_SITE HTTP_PORT HTTPS_PORT PUBLIC_MEDIA_BASE_URL CORS_ORIGINS API_IMAGE \
  MEDIA_HOST_DIR RESEND_API_KEY CONTACT_TO CONTACT_FROM ADMIN_TOKEN DMOJ_USER GITHUB_USER

for tool in docker ffmpeg curl node; do
  command -v "$tool" >/dev/null || { echo "SMOKE FAIL: needs $tool" >&2; exit 1; }
done

work=$(mktemp -d)
# The API runs as another user: a 700 folder would stop it at startup.
chmod 755 "$work"

compose() {
  docker compose -p "$project" --env-file "$work/env" \
    -f "$root/deploy/docker-compose.yml" -f "$root/deploy/docker-compose.local.yml" "$@"
}
cleanup() {
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT
fail() {
  echo "SMOKE FAIL: $1" >&2
  compose logs --tail 20 >&2 2>/dev/null || true
  exit 1
}

# Media: a synthetic clip through the real convert.sh, and a dotfile to hide.
mkdir -m 755 "$work/media"
ffmpeg -hide_banner -loglevel error -f lavfi -i testsrc=size=63x35:rate=10:duration=1 "$work/src.gif"
"$root/scripts/media/convert.sh" "$work/src.gif" smoke-demo "$work/media" >/dev/null
echo hidden >"$work/media/.secret"
chmod 644 "$work/media/.secret"

port=$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')
base=http://127.0.0.1:$port
cat >"$work/env" <<ENV
API_SITE=:80
HTTP_PORT=$port
PUBLIC_MEDIA_BASE_URL=$base/media/files
CORS_ORIGINS=http://localhost:3000
MEDIA_HOST_DIR=$work/media
ENV

compose up -d --build --wait --wait-timeout 180 || fail "the stack did not come up healthy"

# 1. /health through Caddy.
health=$(curl -sS -w '\n%{http_code}' "$base/health") || fail "/health did not answer"
[[ ${health##*$'\n'} == 200 ]] || fail "/health is not 200: $health"
[[ $health == *'"ok":true'* && $health == *'"mediaCount":1'* ]] || fail "/health body: $health"

# 2. The image's HEALTHCHECK reports healthy.
api=$(compose ps -q api)
[[ $(docker inspect -f '{{.State.Health.Status}}' "$api") == healthy ]] || fail "the API container is not healthy"

# 3. Non-root, both in the process and in the image.
[[ $(compose exec -T api id -u) != 0 ]] || fail "the API runs as root"
[[ $(docker image inspect -f '{{.Config.User}}' beselfos-api:local) == node ]] || fail "the image user is not node"

# 4. The API publishes no port: only Caddy can reach it.
[[ -z $(docker port "$api" 2>/dev/null || true) ]] || fail "the API publishes a port"

# 5. No dev or web packages and no private files, and a small image.
docker run --rm --entrypoint sh beselfos-api:local -c \
  'test -e node_modules/express && ! test -e node_modules/typescript && ! test -e node_modules/vitest && ! test -e node_modules/next && ! test -e node_modules/react && ! test -e .git && ! test -e media-src' \
  || fail "the image holds dev or web packages, or private files"
size=$(docker image inspect -f '{{.Size}}' beselfos-api:local)
echo "image size: $((size / 1024 / 1024)) MB"
((size < 250 * 1024 * 1024)) || fail "the image is $((size / 1024 / 1024)) MB, over 250 MB"

# 6. NODE_ENV=production turned the API's own file fallback off.
compose exec -T api node -e "fetch('http://127.0.0.1:8080/media/files/smoke-demo.mp4').then(r=>process.exit(r.status===404?0:1),()=>process.exit(2))" \
  || fail "the API serves media files itself"

# 7. Range: Caddy answers 206 with the right headers.
range=$(curl -sS -o /dev/null -D - -r 0-99 "$base/media/files/smoke-demo.mp4") || fail "the Range request failed"
grep -qi '^HTTP/[0-9.]* 206' <<<"$range" || fail "Range is not 206: $range"
grep -qi '^content-range: bytes 0-99/' <<<"$range" || fail "no Content-Range: $range"
grep -qi '^cross-origin-resource-policy: cross-origin' <<<"$range" || fail "no resource policy header: $range"

# 8. The manifest's URLs resolve.
entry=$(curl -fsS "$base/api/media/smoke-demo") || fail "/api/media/smoke-demo is not 200"
urls=$(node -e 'const e=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log([...e.sources.map(s=>s.src),e.poster].join("\n"))' <<<"$entry")
[[ -n $urls ]] || fail "the entry names no files"
while IFS= read -r url; do
  [[ $url == "$base/media/files/"* ]] || fail "not under the media base: $url"
  curl -fsS -o /dev/null "$url" || fail "does not resolve: $url"
done <<<"$urls"

# 9. Dotfiles are never served.
[[ $(curl -sS -o /dev/null -w '%{http_code}' "$base/media/files/.secret") == 404 ]] || fail ".secret is served"

# 10. CORS passes through Caddy.
cors=$(curl -sS -o /dev/null -D - -H 'Origin: http://localhost:3000' "$base/health")
grep -qi '^access-control-allow-origin: http://localhost:3000' <<<"$cors" || fail "no CORS header: $cors"

# 11. Exactly one proxy hop. Each request claims another client address; if the
# API believed it, none would reach the limit and the sixth would not be 429.
for n in 1 2 3 4 5 6; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
    -H "X-Forwarded-For: 198.51.100.$n" -d '{}' "$base/api/contact")
  want=400
  ((n == 6)) && want=429
  [[ $code == "$want" ]] || fail "contact request $n gave $code, wanted $want"
done

echo SMOKE_OK
