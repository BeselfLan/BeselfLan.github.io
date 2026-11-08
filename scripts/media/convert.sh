#!/usr/bin/env bash
# Converts a gif, mov or mp4 into <id>.mp4, <id>.webm and <id>.jpg, then adds
# or replaces <id> in manifest.json in the same folder. The folder defaults to
# apps/api/media, which is git-ignored and is the API's MEDIA_DIR in dev.
# Usage: scripts/media/convert.sh <input> <id> [out-dir]
#
# Size budget. Plan 5.6 budgets about 1 MB per demo for the Pages repo, and git
# keeps whatever is committed, so each file is made to fit here, before it is
# committed. The settings come from the input and never from the id:
#   MEDIA_MAX_BYTES  The budget for each MP4 and each WebM, default 1500000.
#                    0 turns the search off: every file keeps its first CRF.
#   MEDIA_MAX_FPS    An input above this rate (default 30) is halved until it is
#                    at or under it (50 becomes 25), for both renditions. The
#                    duration is kept. An unknown rate (0/0) is left alone.
#   CRF              Each file starts at Appendix C.3's value (H.264 23, VP9 33)
#                    and steps up by 1 until it fits, to at most 30 and 40. A
#                    file that still does not fit fails the run, and nothing is
#                    written to the out-dir.
#   Re-runs          The WebM is muxed with +bitexact (no random segment ID), so
#                    a second run on the same input writes the same bytes.
# One line per encoded file goes to stderr: "convert: <id>.<ext> fps=<n>/<d>
# crf=<n> bytes=<n>", where fps is the rate used, unreduced (50/2). Stdout is
# the manifest entry.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
[[ $# -ge 2 && $# -le 3 ]] || { echo "usage: $0 <input> <id> [out-dir]" >&2; exit 2; }
in=$1 id=$2 out=${3:-$root/apps/api/media}
# Empty means the default, so an exported empty variable changes nothing.
max_bytes=${MEDIA_MAX_BYTES:-1500000} max_fps=${MEDIA_MAX_FPS:-30}

# Before any work, so a bad id or a bad setting creates nothing.
[[ $id =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || { echo "convert: id \"$id\" must be kebab-case" >&2; exit 2; }
[[ $max_bytes =~ ^[0-9]+$ ]] || { echo "convert: MEDIA_MAX_BYTES must be a whole number of bytes, 0 for no limit" >&2; exit 2; }
[[ $max_fps =~ ^[1-9][0-9]*$ ]] || { echo "convert: MEDIA_MAX_FPS must be a whole number above 0" >&2; exit 2; }
[[ -f $in ]] || { echo "convert: no such file: $in" >&2; exit 1; }
for tool in ffmpeg ffprobe node; do
  command -v "$tool" >/dev/null || { echo "convert: needs $tool" >&2; exit 1; }
done

# The frame rate, probed before any folder is made so a bad input creates
# nothing. Above the cap it is halved until it fits: frames drop evenly and the
# duration stays. Both renditions share one filter chain, so the manifest's
# size and the rate are true of both files. yuv420p needs even sides.
rate=$(ffprobe -v error -select_streams v:0 -show_entries stream=avg_frame_rate -of csv=p=0 "$in")
vf="scale=trunc(iw/2)*2:trunc(ih/2)*2"
fps=$rate num=${rate%/*} den=${rate#*/}
if [[ $rate == */* && $num =~ ^[1-9][0-9]*$ && $den =~ ^[1-9][0-9]*$ ]]; then
  while (( num > max_fps * den )); do den=$((den * 2)); done
  fps=$num/$den
  [[ $fps == "$rate" ]] || vf="fps=$fps,$vf"
fi

mkdir -p "$out"
work=$(mktemp -d "$out/.convert-XXXXXX")
trap 'rm -rf "$work"' EXIT

ff=(ffmpeg -hide_banner -loglevel error -y)

# encode <ext> <first crf> <last crf> <ffmpeg output options...>
# Raises the CRF by one at a time until the file is within the budget. It fails
# when the last CRF is still over, and set -e then ends the run.
encode() {
  local ext=$1 crf=$2 last=$3 file="$work/$id.$1" bytes
  shift 3
  while :; do
    "${ff[@]}" -i "$in" -vf "$vf" -pix_fmt yuv420p "$@" -crf "$crf" -an "$file"
    bytes=$(( $(wc -c <"$file") ))
    if (( max_bytes == 0 || bytes <= max_bytes )); then
      echo "convert: $id.$ext fps=$fps crf=$crf bytes=$bytes" >&2
      return 0
    fi
    if (( crf >= last )); then
      echo "convert: $id.$ext is $bytes bytes at crf=$crf, over MEDIA_MAX_BYTES=$max_bytes" >&2
      return 1
    fi
    crf=$((crf + 1))
  done
}
encode mp4 23 30 -movflags +faststart -c:v libx264 -preset slow
encode webm 33 40 -c:v libvpx-vp9 -b:v 0 -row-mt 1 -fflags +bitexact
"${ff[@]}" -i "$work/$id.mp4" -frames:v 1 -q:v 3 -update 1 "$work/$id.jpg"
probe=$(ffprobe -v error -select_streams v:0 -show_entries format=duration:stream=width,height -of json "$work/$id.mp4")

# mktemp makes the folder 700 and the API runs as another user.
chmod 644 "$work/$id".*
mv "$work/$id.mp4" "$work/$id.webm" "$work/$id.jpg" "$out/"
# Last, so the manifest never names a file that is not there yet.
printf '%s' "$probe" | node "$root/scripts/media/manifest-cli.mts" add "$out/manifest.json" "$id"
