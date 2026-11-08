#!/usr/bin/env bash
# Converts a gif, mov or mp4 into <id>.mp4, <id>.webm and <id>.jpg, then adds
# or replaces <id> in manifest.json in the same folder. The folder defaults to
# apps/api/media, which is git-ignored and is the API's MEDIA_DIR in dev.
# Usage: scripts/media/convert.sh <input> <id> [out-dir]
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
[[ $# -ge 2 && $# -le 3 ]] || { echo "usage: $0 <input> <id> [out-dir]" >&2; exit 2; }
in=$1 id=$2 out=${3:-$root/apps/api/media}

# Before any work, so a bad id creates nothing.
[[ $id =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || { echo "convert: id \"$id\" must be kebab-case" >&2; exit 2; }
[[ -f $in ]] || { echo "convert: no such file: $in" >&2; exit 1; }
for tool in ffmpeg ffprobe node; do
  command -v "$tool" >/dev/null || { echo "convert: needs $tool" >&2; exit 1; }
done

mkdir -p "$out"
work=$(mktemp -d "$out/.convert-XXXXXX")
trap 'rm -rf "$work"' EXIT

# Both renditions share one scale and pixel format, so the manifest's width and
# height are true of both files. yuv420p needs even sides.
even="scale=trunc(iw/2)*2:trunc(ih/2)*2"
ff=(ffmpeg -hide_banner -loglevel error -y)
"${ff[@]}" -i "$in" -movflags +faststart -pix_fmt yuv420p -vf "$even" -c:v libx264 -crf 23 -preset slow -an "$work/$id.mp4"
"${ff[@]}" -i "$in" -pix_fmt yuv420p -vf "$even" -c:v libvpx-vp9 -b:v 0 -crf 33 -row-mt 1 -an "$work/$id.webm"
"${ff[@]}" -i "$work/$id.mp4" -frames:v 1 -q:v 3 -update 1 "$work/$id.jpg"
probe=$(ffprobe -v error -select_streams v:0 -show_entries format=duration:stream=width,height -of json "$work/$id.mp4")

# mktemp makes the folder 700 and the API runs as another user.
chmod 644 "$work/$id".*
mv "$work/$id.mp4" "$work/$id.webm" "$work/$id.jpg" "$out/"
# Last, so the manifest never names a file that is not there yet.
printf '%s' "$probe" | node "$root/scripts/media/manifest-cli.mts" add "$out/manifest.json" "$id"
