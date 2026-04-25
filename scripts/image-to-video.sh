#!/usr/bin/env bash
# image-to-video.sh
# 静止画から 15秒 9:16 動画を生成（ケンバーンズ・ズームイン効果 + 無音 or BGM）
#
# 使い方:
#   ./scripts/image-to-video.sh INPUT_IMAGE [OUTPUT_VIDEO] [BGM_PATH]
#   ./scripts/image-to-video.sh ~/Downloads/IMG_7329.PNG
#   ./scripts/image-to-video.sh ~/Downloads/IMG_7329.PNG output.mp4 ./bgm.mp3
#
# 依存: ffmpeg（brew install ffmpeg）

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 INPUT_IMAGE [OUTPUT_VIDEO] [BGM_PATH]" >&2
  exit 1
fi

INPUT="$1"
OUTPUT="${2:-./docs/experiments/$(date +%Y-%m-%d)-$(basename "${INPUT%.*}").mp4}"
BGM="${3:-}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Error: ffmpeg is required. Install with: brew install ffmpeg" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"

DURATION=15   # 秒
FPS=30
# Reels/Shorts/TikTok 推奨サイズ
W=1080
H=1920

# Ken Burns: 画像を1.0→1.15倍にゆっくりズームインしながら中央をフォロー
# scale で 9:16 キャンバスにフィット、pad で黒帯
FRAMES=$((DURATION * FPS))

echo "[info] Encoding $INPUT → $OUTPUT ($DURATION sec, ${W}x${H}, ${FPS}fps)"

if [[ -n "$BGM" && -f "$BGM" ]]; then
  ffmpeg -y \
    -loop 1 -i "$INPUT" \
    -i "$BGM" \
    -filter_complex "[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,zoompan=z='min(zoom+0.0015,1.15)':d=${FRAMES}:s=${W}x${H}:fps=${FPS}[v]" \
    -map "[v]" -map 1:a \
    -t "$DURATION" \
    -c:v libx264 -pix_fmt yuv420p -preset medium -crf 20 \
    -c:a aac -b:a 128k -shortest \
    -movflags +faststart \
    "$OUTPUT"
else
  # BGMなし: 無音トラック付与（一部プラットフォームが音声トラック必須のため）
  ffmpeg -y \
    -loop 1 -i "$INPUT" \
    -f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100" \
    -filter_complex "[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,zoompan=z='min(zoom+0.0015,1.15)':d=${FRAMES}:s=${W}x${H}:fps=${FPS}[v]" \
    -map "[v]" -map 1:a \
    -t "$DURATION" \
    -c:v libx264 -pix_fmt yuv420p -preset medium -crf 20 \
    -c:a aac -b:a 128k -shortest \
    -movflags +faststart \
    "$OUTPUT"
fi

echo "[done] $OUTPUT"
echo "size: $(du -h "$OUTPUT" | cut -f1)"
