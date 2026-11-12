#!/usr/bin/env bash
# Proves that deploy/vps-bootstrap.sh does what it says and changes nothing the
# second time, without touching this machine: every run of it happens inside a
# throwaway ubuntu:24.04 container with no network and no ports, which exits on
# its own (four containers: the runs, the refusals, not root, and no ufw). A stub
# docker, a stub ufw and, in the last one, a stub apt-get stand in for the real
# ones. Needs docker, and pulls ubuntu:24.04 once. Prints BOOTSTRAP_OK.
# Usage: deploy/bootstrap-check.sh
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
key="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeKeyForBootstrapCheckOnly beselfos-check"

command -v docker >/dev/null || {
  echo "BOOTSTRAP FAIL: needs docker" >&2
  exit 1
}

# box [docker run options]: a throwaway ubuntu:24.04 with no network and no
# ports that reads its script from stdin and exits on its own (timeout 120).
# deploy/ is mounted read-only; nothing else of this machine is visible.
box() {
  docker run --rm -i --network none --memory 512m -v "$root/deploy:/src:ro" "$@" \
    ubuntu:24.04 timeout 120 bash -s
}

# Runs first in every container but the non-root one: a copy of deploy/ in
# /srv/beselfos (a developer's own .env and media/ left out, so neither can
# count as existing), a docker that answers every call with
# $FAKE_COMPOSE_VERSION, and a ufw that keeps its rules in /var/lib/fake-ufw and
# logs its calls.
read -r -d '' prelude <<'PRELUDE' || true
set -euo pipefail
fail() { echo "BOOTSTRAP FAIL: $*" >&2; exit 1; }
mkdir -p /srv/beselfos
cp -a /src/. /srv/beselfos/
rm -rf /srv/beselfos/.env /srv/beselfos/media
cat >/usr/local/bin/docker <<'STUB'
#!/bin/sh
echo "$FAKE_COMPOSE_VERSION"
STUB
cat >/usr/local/bin/ufw <<'STUB'
#!/bin/sh
state=/var/lib/fake-ufw
mkdir -p "$state"
echo "$*" >>"$state/calls"
case "$1 $2" in
"allow "*) grep -qxF "ufw allow $2" "$state/rules" 2>/dev/null || echo "ufw allow $2" >>"$state/rules" ;;
"show added")
  echo "Added user rules (see 'ufw status' for running firewall):"
  if [ -s "$state/rules" ]; then cat "$state/rules"; else echo "(None)"; fi ;;
"status "*) if [ -e "$state/active" ]; then echo "Status: active"; else echo "Status: inactive"; fi ;;
"--force enable") touch "$state/active" ;;
esac
STUB
chmod 755 /usr/local/bin/docker /usr/local/bin/ufw
# stdin carries this script, so nothing the bootstrap runs may read it.
boot() { bash /srv/beselfos/vps-bootstrap.sh </dev/null 2>&1; }
PRELUDE

# check <name> <script that runs first> [docker run options] <<body: runs the
# first script and then the body in a box, and fails unless the body printed
# INNER_OK, which it does only after its last check.
check() {
  local name=$1 first=$2 out
  shift 2
  out=$({
    printf '%s\n' "$first"
    cat
  } | box "$@" 2>&1) || true
  [[ $out == *INNER_OK* ]] || {
    echo "BOOTSTRAP FAIL: $name: $out" >&2
    exit 1
  }
}

# Container A: five runs of one script in one container.
check "runs" "$prelude" -e FAKE_COMPOSE_VERSION=2.40.3+ds1-0ubuntu1 -e "DEPLOY_SSH_KEY=$key" <<'BODY'
calls=/var/lib/fake-ufw/calls
snapshot() {
  getent passwd deploy
  getent group docker
  stat -c '%U:%G %a %n' /srv/beselfos /srv/beselfos/media /srv/beselfos/.env \
    /home/deploy/.ssh /home/deploy/.ssh/authorized_keys
  sha256sum /srv/beselfos/.env /home/deploy/.ssh/authorized_keys
  cat /var/lib/fake-ufw/rules 2>/dev/null || true
  if [ -e /var/lib/fake-ufw/active ]; then echo ufw-active; fi
}
mode() { stat -c '%U:%G %a' "$1"; }

# A media folder that exists with the wrong mode is put right too.
mkdir -m 700 /srv/beselfos/media

# Run 1: everything is set up.
out1=$(boot) || fail "run 1 exited non-zero: $out1"
id -nG deploy | tr ' ' '\n' | grep -qx docker || fail "deploy is not in docker"
[ "$(grep -cxF -- "$DEPLOY_SSH_KEY" /home/deploy/.ssh/authorized_keys)" = 1 ] || fail "the key is not there exactly once"
[ "$(mode /home/deploy/.ssh/authorized_keys)" = "deploy:deploy 600" ] || fail "authorized_keys: $(mode /home/deploy/.ssh/authorized_keys)"
[ "$(mode /home/deploy/.ssh)" = "deploy:deploy 700" ] || fail ".ssh: $(mode /home/deploy/.ssh)"
for dir in /srv/beselfos /srv/beselfos/media; do
  [ "$(mode "$dir")" = "deploy:deploy 755" ] || fail "$dir: $(mode "$dir")"
done
[ "$(mode /srv/beselfos/.env)" = "deploy:deploy 600" ] || fail ".env: $(mode /srv/beselfos/.env)"
cmp -s /srv/beselfos/.env /src/.env.example || fail ".env is not .env.example"
[ "$(grep -c '^allow ' "$calls")" = 4 ] || fail "ufw allow was called $(grep -c '^allow ' "$calls") times: $(cat "$calls")"
allow_ssh=$(grep -n '^allow 22/tcp$' "$calls" | head -n 1 | cut -d: -f1)
enable=$(grep -n '^--force enable$' "$calls" | head -n 1 | cut -d: -f1)
[ -n "$allow_ssh" ] && [ -n "$enable" ] && [ "$allow_ssh" -lt "$enable" ] || fail "ufw was enabled before SSH was allowed: $(cat "$calls")"
snap1=$(snapshot)
: >"$calls"

# Run 2: nothing to do. The same snapshot, only ok lines, no firewall call
# that changes anything.
out2=$(boot) || fail "run 2 exited non-zero: $out2"
snap2=$(snapshot)
[ "$snap1" = "$snap2" ] || fail "run 2 changed something:
$snap1
--- after run 2:
$snap2"
bad=$(grep -vE '^(ok: |bootstrap: done$)' <<<"$out2" || true)
[ -z "$bad" ] || fail "run 2 was not all ok: $bad"
! grep -qE '^(allow|--force)' "$calls" || fail "run 2 changed the firewall: $(cat "$calls")"
[ "$(grep -cxF -- "$DEPLOY_SSH_KEY" /home/deploy/.ssh/authorized_keys)" = 1 ] || fail "run 2 repeated the key"

# Run 3: an edited .env is kept.
echo EDITED=1 >>/srv/beselfos/.env
out3=$(boot) || fail "run 3 exited non-zero: $out3"
[ "$(tail -n 1 /srv/beselfos/.env)" = EDITED=1 ] || fail "run 3 overwrote .env"

# Run 4: SKIP_FIREWALL=1 does not call ufw at all.
: >"$calls"
out4=$(SKIP_FIREWALL=1 boot) || fail "run 4 exited non-zero: $out4"
[ ! -s "$calls" ] || fail "SKIP_FIREWALL=1 still called ufw: $(cat "$calls")"

# Run 5: an authorized_keys that is not ours, and whose last line has no
# newline, keeps its line, and the key lands on a line of its own.
keys=/home/deploy/.ssh/authorized_keys
printf 'ssh-rsa AAAAotherkeyforbootstrapcheck other' >"$keys"
out5=$(boot) || fail "run 5 exited non-zero: $out5"
grep -qxF 'ssh-rsa AAAAotherkeyforbootstrapcheck other' "$keys" || fail "run 5 damaged the other key"
[ "$(grep -cxF -- "$DEPLOY_SSH_KEY" "$keys")" = 1 ] || fail "run 5 did not put the key on its own line"
[ "$(mode "$keys")" = "deploy:deploy 600" ] || fail "run 5: authorized_keys is $(mode "$keys")"
echo INNER_OK
BODY

# Container B: three refusals. Each leaves no user, no media folder and no .env.
check "refusals" "$prelude" <<'BODY'
refuse() { # <label> <text the message must contain> [VAR=value ...]
  local label=$1 want=$2 out
  shift 2
  if out=$(env "$@" bash /srv/beselfos/vps-bootstrap.sh </dev/null 2>&1); then
    fail "$label: exited 0: $out"
  fi
  [[ $out == *"$want"* ]] || fail "$label: no \"$want\" in: $out"
  ! getent passwd deploy >/dev/null || fail "$label: the user deploy was created"
  [ ! -e /srv/beselfos/media ] || fail "$label: the media folder was created"
  [ ! -e /srv/beselfos/.env ] || fail "$label: .env was created"
}
refuse "old compose" 2.24.4 FAKE_COMPOSE_VERSION=2.20.2
refuse "private key" "one public key line" FAKE_COMPOSE_VERSION=2.40.3+ds1-0ubuntu1 \
  "DEPLOY_SSH_KEY=-----BEGIN OPENSSH PRIVATE KEY-----"
rm /usr/local/bin/docker
refuse "no docker, offline" "install Docker Engine and the Compose plugin"
echo INNER_OK
BODY

# Container C: not root. No prelude: the script runs from the read-only mount.
check "not root" "" --user 65534 <<'BODY'
code=0
out=$(bash /src/vps-bootstrap.sh </dev/null 2>&1) || code=$?
[ "$code" != 0 ] || { echo "BOOTSTRAP FAIL: ran as non-root: $out" >&2; exit 1; }
case $out in *"run as root"*) ;; *) echo "BOOTSTRAP FAIL: no run as root in: $out" >&2; exit 1 ;; esac
if getent passwd deploy >/dev/null; then echo "BOOTSTRAP FAIL: created a user" >&2; exit 1; fi
echo INNER_OK
BODY

# Container D: no ufw, and an apt that knows no package until it has updated, as
# on a fresh image that already has Docker. The bootstrap must update first.
check "no ufw" "$prelude" -e FAKE_COMPOSE_VERSION=2.40.3+ds1-0ubuntu1 <<'BODY'
mv /usr/local/bin/ufw /root/fake-ufw
cat >/usr/local/bin/apt-get <<'STUB'
#!/bin/sh
echo "$*" >>/var/lib/fake-apt-calls
case "$*" in
update*) touch /var/lib/fake-apt-lists ;;
*" ufw")
  if [ ! -e /var/lib/fake-apt-lists ]; then echo "E: Unable to locate package ufw" >&2; exit 100; fi
  cp /root/fake-ufw /usr/local/bin/ufw ;;
esac
STUB
chmod 755 /usr/local/bin/apt-get
out=$(boot) || fail "no ufw: exited non-zero: $out"
grep -qxF 'changed: installed ufw' <<<"$out" || fail "no ufw: ufw was not installed: $out"
[ "$(grep -c '^allow ' /var/lib/fake-ufw/calls)" = 4 ] || fail "no ufw: ufw allow was called $(grep -c '^allow ' /var/lib/fake-ufw/calls) times"
# The second run finds ufw and calls apt-get not at all.
: >/var/lib/fake-apt-calls
out2=$(boot) || fail "no ufw: run 2 exited non-zero: $out2"
[ ! -s /var/lib/fake-apt-calls ] || fail "no ufw: run 2 called apt-get: $(cat /var/lib/fake-apt-calls)"
echo INNER_OK
BODY

echo BOOTSTRAP_OK
