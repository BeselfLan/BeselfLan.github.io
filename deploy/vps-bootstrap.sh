#!/usr/bin/env bash
# Prepares an Ubuntu VPS for the BeselfOS stack (plan 7.6). Run it as root from
# the copy of deploy/ on the server: /srv/beselfos/vps-bootstrap.sh.
# Every step checks first, so a second run changes nothing. It never upgrades
# packages, edits sshd, or touches containers, images, networks or volumes.
# Docker-published ports bypass ufw, which is why only Caddy publishes any.
#   DEPLOY_USER     the user that runs the stack (default deploy)
#   APP_DIR         where the stack lives (default /srv/beselfos)
#   DEPLOY_SSH_KEY  one public key line for DEPLOY_USER (optional)
#   SSH_PORT        the port ufw keeps open for SSH (default 22)
#   SKIP_FIREWALL   1 leaves the firewall alone
set -euo pipefail

user=${DEPLOY_USER:-deploy}
app_dir=${APP_DIR:-/srv/beselfos}
ssh_port=${SSH_PORT:-22}
key=${DEPLOY_SSH_KEY:-}
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
min_compose=2.24.4

ok() { echo "ok: $*"; }
changed() { echo "changed: $*"; }
die() {
  echo "bootstrap: $*" >&2
  exit 1
}

# Everything that can be refused is refused before anything changes.
[[ $EUID -eq 0 ]] || die "run as root"
# One line that starts like a public key: a pasted private key must never land
# in authorized_keys.
if [[ -n $key && ($key == *$'\n'* || ! $key =~ ^(ssh-|ecdsa-|sk-)) ]]; then
  die "DEPLOY_SSH_KEY must be one public key line"
fi
[[ $ssh_port =~ ^[0-9]+$ ]] || die "SSH_PORT must be a number"
if [[ ! -e $app_dir/.env && ! -f $here/.env.example ]]; then
  die "no .env.example next to this script to copy to $app_dir/.env"
fi
if [[ ${SKIP_FIREWALL:-} != 1 ]] && ! command -v ufw >/dev/null && ! command -v apt-get >/dev/null; then
  die "install ufw, or set SKIP_FIREWALL=1 and allow $ssh_port/tcp, 80/tcp, 443/tcp and 443/udp yourself"
fi

# Docker Engine and the Compose plugin, from the Ubuntu archive.
if docker compose version >/dev/null 2>&1; then
  ok "docker compose is installed"
else
  command -v apt-get >/dev/null || die "install Docker Engine and the Compose plugin, then run this again"
  export DEBIAN_FRONTEND=noninteractive
  if ! { apt-get update -q && apt-get install -y -q docker.io docker-compose-v2; }; then
    die "install Docker Engine and the Compose plugin, then run this again"
  fi
  if [[ -d /run/systemd/system ]]; then systemctl enable --now docker; fi
  changed "installed docker.io and docker-compose-v2"
fi

# The stack uses !override (and the web overlay's !reset): Compose 2.24.4 or
# later. This runs before any user, folder or firewall change.
version=$(docker compose version --short)
version=${version#v}
lowest=$(printf '%s\n' "$min_compose" "${version%%[+-]*}" | sort -V | sed -n 1p)
[[ $lowest == "$min_compose" ]] || die "Docker Compose ${version:-unknown} is too old: the stack needs $min_compose or later"
ok "docker compose $version"

# The docker group and the deploy user.
if getent group docker >/dev/null; then
  ok "group docker"
else
  groupadd --system docker
  changed "group docker created"
fi
if id -u "$user" >/dev/null 2>&1; then
  ok "user $user"
else
  useradd --create-home --shell /bin/bash "$user"
  changed "user $user created"
fi
groups=$(id -nG "$user")
if [[ " $groups " == *" docker "* ]]; then
  ok "$user is in the docker group"
else
  usermod -aG docker "$user"
  changed "$user added to the docker group"
fi
group=$(id -gn "$user")
home=$(getent passwd "$user" | cut -d: -f6)

# ensure_dir <path> <mode>: a folder owned by the deploy user, with that mode.
ensure_dir() {
  if [[ -d $1 && $(stat -c '%U:%G %a' "$1") == "$user:$group $2" ]]; then
    ok "$1"
  else
    install -d -m "$2" -o "$user" -g "$group" "$1"
    changed "$1 ($user, mode $2)"
  fi
}

# The deploy key, when one is given.
if [[ -n $key ]]; then
  ensure_dir "$home/.ssh" 700
  keys=$home/.ssh/authorized_keys
  if [[ -f $keys ]] && grep -qxF -- "$key" "$keys"; then
    ok "key is in $keys"
  else
    # A last line without its newline would swallow the key.
    if [[ -s $keys && -n $(tail -c 1 "$keys") ]]; then echo >>"$keys"; fi
    printf '%s\n' "$key" >>"$keys"
    changed "key added to $keys"
  fi
  if [[ $(stat -c '%U:%G %a' "$keys") == "$user:$group 600" ]]; then
    ok "$keys (mode 600)"
  else
    chown "$user:$group" "$keys"
    chmod 600 "$keys"
    changed "$keys (owner and mode 600)"
  fi
fi

# The firewall. SSH is allowed before it is enabled, so enabling cannot lock
# anyone out.
if [[ ${SKIP_FIREWALL:-} == 1 ]]; then
  ok "firewall left alone (SKIP_FIREWALL=1)"
else
  if command -v ufw >/dev/null; then
    ok "ufw is installed"
  else
    DEBIAN_FRONTEND=noninteractive apt-get install -y -q ufw
    changed "installed ufw"
  fi
  added=$(ufw show added)
  for rule in "$ssh_port/tcp" 80/tcp 443/tcp 443/udp; do
    if grep -qxF "ufw allow $rule" <<<"$added"; then
      ok "ufw allows $rule"
    else
      ufw allow "$rule" >/dev/null
      changed "ufw allows $rule"
    fi
  done
  status=$(ufw status)
  if grep -qx 'Status: active' <<<"$status"; then
    ok "ufw is active"
  else
    ufw --force enable >/dev/null
    changed "ufw enabled"
  fi
fi

# The stack's folders, and its .env, which is never overwritten.
ensure_dir "$app_dir" 755
ensure_dir "$app_dir/media" 755
if [[ -e $app_dir/.env ]]; then
  ok "$app_dir/.env (never overwritten)"
else
  install -m 600 -o "$user" -g "$group" "$here/.env.example" "$app_dir/.env"
  changed "$app_dir/.env from .env.example"
fi

# Whatever else was copied here as root belongs to the deploy user too.
stray=$(find "$app_dir" \( ! -user "$user" -o ! -group "$group" \) -print -quit)
if [[ -z $stray ]]; then
  ok "$app_dir belongs to $user"
else
  chown -R "$user:$group" "$app_dir"
  changed "$app_dir now belongs to $user"
fi

echo "bootstrap: done"
