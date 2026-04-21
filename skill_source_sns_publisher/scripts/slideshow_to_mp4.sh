#!/usr/bin/env bash
# slideshow_to_mp4.sh
# 複数画像 + ナレーションJSON → 9:16 MP4（1枚 n 秒、音声同期、ケンバーンズ効果）
#
# 使い方:
#   ./slideshow_to_mp4.sh copy.json output.mp4
#
# copy.json は generate_copy.py の出力。以下が必須:
#   { "_image_paths": ["/abs/1.png", "/abs/2.png", ...],
#     "narrations":   ["テキスト1", "テキスト2", ...] }
#
# 依存: ffmpeg、同じディレクトリの tts.sh

set -euo pipefail

COPY_JSON="${1:?Usage: slideshow_to_mp4.sh <copy.json> <output.mp4>}"
OUT_MP4="${2:?Usage: slideshow_to_mp4.sh <copy.json> <output.mp4>}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_DIR="$(mktemp -d -t slideshow)"
trap "rm -rf $TMP_DIR" EXIT

# ---- 読み取り ----
N_IMAGES=$(python3 -c "import json; d=json.load(open('$COPY_JSON')); print(len(d['_image_paths']))")
PER_IMAGE_SEC="${SLIDESHOW_SEC_PER_IMAGE:-3}"

W=1080
H=1920
FPS=30

echo "[slideshow] images=$N_IMAGES, per_image=${PER_IMAGE_SEC}s"

# ---- 各画像のナレーションを合成し、音声長に合わせて動画長を決定 ----
python3 - "$COPY_JSON" "$TMP_DIR" <<'PY' > "$TMP_DIR/plan.txt"
import json, sys, os
d = json.load(open(sys.argv[1]))
tmp = sys.argv[2]
paths = d["_image_paths"]
narrs = d.get("narrations", [""] * len(paths))
for i, (p, n) in enumerate(zip(paths, narrs)):
    print(f"{i}\t{p}\t{n}")
PY

# ---- 音声合成 + 各クリップ生成 ----
# FD 3 経由で読むことで、内部コマンド(say, ffmpeg)が stdin を消費してもループが壊れないようにする
: > "$TMP_DIR/concat.txt"

exec 3< "$TMP_DIR/plan.txt"
while IFS=$'\t' read -u 3 -r idx img narr; do
  audio="$TMP_DIR/a$idx.mp3"
  if [[ -n "$narr" ]]; then
    bash "$SCRIPT_DIR/tts.sh" "$narr" "$audio"
    # 音声長（秒・小数）
    DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$audio")
    # 最低 $PER_IMAGE_SEC 秒保証、音声より長ければそちらに
    CLIP_SEC=$(python3 -c "print(max(float('$DUR')+0.3, float('$PER_IMAGE_SEC')))")
  else
    CLIP_SEC="$PER_IMAGE_SEC"
    # 無音トラック生成
    ffmpeg -y -loglevel error -f lavfi -t "$CLIP_SEC" \
      -i anullsrc=channel_layout=stereo:sample_rate=44100 \
      -c:a aac -b:a 128k "$audio"
  fi
  FRAMES=$(python3 -c "import math; print(int(math.ceil(float('$CLIP_SEC') * $FPS)))")
  clip="$TMP_DIR/c$idx.mp4"

  # Ken Burns ズームイン + 9:16 フィット（黒背景パッド）
  ffmpeg -y -loglevel error -loop 1 -i "$img" -i "$audio" \
    -filter_complex "[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,zoompan=z='min(zoom+0.0012,1.12)':d=${FRAMES}:s=${W}x${H}:fps=${FPS}[v]" \
    -map "[v]" -map 1:a \
    -t "$CLIP_SEC" \
    -c:v libx264 -pix_fmt yuv420p -preset medium -crf 20 \
    -c:a aac -b:a 128k -shortest \
    -movflags +faststart \
    "$clip"

  echo "file '$clip'" >> "$TMP_DIR/concat.txt"
done
exec 3<&-

# ---- 連結 ----
mkdir -p "$(dirname "$OUT_MP4")"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$TMP_DIR/concat.txt" \
  -c:v libx264 -c:a aac -b:a 128k -movflags +faststart "$OUT_MP4"

SIZE=$(du -h "$OUT_MP4" | cut -f1)
TOTAL_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT_MP4")
echo "[slideshow] done: $OUT_MP4  ($SIZE, ${TOTAL_DUR}s)"
