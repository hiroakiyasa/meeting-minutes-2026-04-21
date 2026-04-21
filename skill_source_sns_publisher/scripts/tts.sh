#!/usr/bin/env bash
# tts.sh — 日本語 text-to-speech
# 使い方:
#   ./tts.sh "読み上げテキスト" output.mp3
#
# 2つのバックエンドをサポート:
#   1) macOS `say` + ffmpeg (デフォルト・無料・追加インストール不要)
#   2) OpenAI TTS API (env OPENAI_API_KEY 指定時に自動使用)
#
# 環境変数:
#   TTS_ENGINE=say | openai   (明示指定)
#   TTS_VOICE                 (say: "Kyoko" / openai: "alloy","nova","shimmer"等)
#   TTS_SPEED=1.0             (openaiのみ)

set -euo pipefail

TEXT="${1:?Usage: tts.sh <text> <output.mp3>}"
OUT="${2:?Usage: tts.sh <text> <output.mp3>}"

mkdir -p "$(dirname "$OUT")"

ENGINE="${TTS_ENGINE:-auto}"
if [[ "$ENGINE" == "auto" ]]; then
  if [[ -n "${OPENAI_API_KEY:-}" ]]; then
    ENGINE="openai"
  else
    ENGINE="say"
  fi
fi

case "$ENGINE" in
  say)
    VOICE="${TTS_VOICE:-Kyoko}"
    AIFF="${OUT}.tmp.aiff"
    say -v "$VOICE" -o "$AIFF" "$TEXT"
    # 出力拡張子に応じてエンコード
    case "${OUT##*.}" in
      mp3)       ffmpeg -y -loglevel error -i "$AIFF" -c:a libmp3lame -b:a 128k "$OUT" ;;
      m4a|aac)   ffmpeg -y -loglevel error -i "$AIFF" -c:a aac -b:a 128k "$OUT" ;;
      *)         ffmpeg -y -loglevel error -i "$AIFF" -c:a libmp3lame -b:a 128k "$OUT" ;;
    esac
    rm -f "$AIFF"
    ;;
  openai)
    VOICE="${TTS_VOICE:-nova}"
    SPEED="${TTS_SPEED:-1.0}"
    # application/json, receive audio
    RESP_TMP="$(mktemp -t tts_resp).mp3"
    curl -sS -X POST https://api.openai.com/v1/audio/speech \
      -H "Authorization: Bearer $OPENAI_API_KEY" \
      -H "Content-Type: application/json" \
      -d "$(python3 -c "import json,os; print(json.dumps({'model':'gpt-4o-mini-tts','voice':os.environ.get('TTS_VOICE','nova'),'input':os.environ['__T'],'speed':float(os.environ.get('TTS_SPEED','1.0'))}))" )" \
      -o "$RESP_TMP" && mv "$RESP_TMP" "$OUT"
    ;;
  *)
    echo "Unknown TTS_ENGINE: $ENGINE" >&2
    exit 1
    ;;
esac

echo "[tts] ($ENGINE) wrote: $OUT"
