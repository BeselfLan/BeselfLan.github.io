#!/usr/bin/env bash
# Copies the media folder to the server volume: files first, manifest.json
# last, so the server never lists a file it does not have. Never deletes.
# Usage: MEDIA_SYNC_TARGET=<rsync destination> scripts/media/sync.sh [rsync options]
#   MEDIA_SYNC_SOURCE  folder to send (default apps/api/media)
#   RSYNC_RSH          ssh command for a remote target; rsync reads it itself
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
src=${MEDIA_SYNC_SOURCE:-$root/apps/api/media}
target=${MEDIA_SYNC_TARGET:?set MEDIA_SYNC_TARGET, for example user@host:/srv/beselfos/media}

[[ -f $src/manifest.json ]] || { echo "sync: no manifest.json in $src" >&2; exit 1; }
# Refuses a manifest that names a file that is not in the folder.
node "$root/scripts/media/manifest-cli.mts" check "$src/manifest.json"

# Dotfiles are the convert temp folders and anything private. The modes let the
# container user read everything, whatever the local umask was.
rsync -rt --chmod=D755,F644 --exclude='.*' --exclude=/manifest.json "$@" "$src/" "$target/"
rsync -t --chmod=F644 "$@" "$src/manifest.json" "$target/manifest.json"
