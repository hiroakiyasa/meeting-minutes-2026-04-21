#!/usr/bin/env bash
# run.sh — sns-auto-publisher オーケストレーター
#
# モード:
#   single  IMAGE                 — 1枚画像を解析→コピー生成→4媒体投稿
#   slideshow IMG1 IMG2 ...       — 複数画像→ナレーション付きMP4→4媒体投稿
#   slideshow-dir DIR             — ディレクトリ内の画像を名前順でスライドショー化
#
# オプション:
#   --dry-run                     — 投稿せずコピー/動画の生成だけ
#   --platforms x,instagram,...   — 投稿先を限定（既定: 全部）
#   --context "補足"              — 画像に対する補足コンテキスト
#
# 必要:
#   .env に4媒体APIキー + ANTHROPIC_API_KEY
#   brew install ffmpeg
#   pip3 install anthropic

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

if [[ -f "$ROOT/.env" ]]; then
  set -a; . "$ROOT/.env"; set +a
fi

DRY_RUN=0
CONTEXT=""
PLATFORMS="x,instagram,tiktok,youtube"
MODE="${1:-}"
shift || true

POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --context) CONTEXT="$2"; shift 2 ;;
    --platforms) PLATFORMS="$2"; shift 2 ;;
    *) POSITIONAL+=("$1"); shift ;;
  esac
done
set -- "${POSITIONAL[@]}"

[[ -z "$MODE" ]] && { echo "Usage: run.sh <single|slideshow|slideshow-dir> ..." >&2; exit 1; }

DATE="$(date +%Y-%m-%d)"
TS="$(date +%H%M%S)"
OUT_BASE="$ROOT/docs/copy/${DATE}-${TS}"
VIDEO_PATH="$ROOT/docs/experiments/${DATE}-${TS}-slideshow.mp4"
LOG_FILE="$ROOT/logs/${DATE}.md"
mkdir -p "$ROOT/docs/copy" "$ROOT/docs/experiments" "$ROOT/logs"

case "$MODE" in
  single)
    IMG="${1:?need image path}"
    echo "[run] mode=single  image=$IMG"
    python3 "$SCRIPT_DIR/generate_copy.py" \
      --images "$IMG" --out "$OUT_BASE" --mode single --context "$CONTEXT"
    COPY_JSON="${OUT_BASE}.json"
    MEDIA_ARG=("--image" "$IMG")
    ;;
  slideshow)
    [[ $# -lt 2 ]] && { echo "Need >=2 images" >&2; exit 1; }
    echo "[run] mode=slideshow  images=$#"
    python3 "$SCRIPT_DIR/generate_copy.py" \
      --images "$@" --out "$OUT_BASE" --mode slideshow --context "$CONTEXT"
    COPY_JSON="${OUT_BASE}.json"
    echo "[run] building MP4 slideshow..."
    bash "$SCRIPT_DIR/slideshow_to_mp4.sh" "$COPY_JSON" "$VIDEO_PATH"
    MEDIA_ARG=("--video" "$VIDEO_PATH")
    ;;
  slideshow-dir)
    DIR="${1:?need dir}"
    IMGS=()
    while IFS= read -r -d '' f; do IMGS+=("$f"); done < <(find "$DIR" -maxdepth 1 \
      \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.webp" \) \
      -print0 | sort -z)
    [[ ${#IMGS[@]} -eq 0 ]] && { echo "No images in $DIR" >&2; exit 1; }
    echo "[run] mode=slideshow-dir  found=${#IMGS[@]}  dir=$DIR"
    python3 "$SCRIPT_DIR/generate_copy.py" \
      --images "${IMGS[@]}" --out "$OUT_BASE" --mode slideshow --context "$CONTEXT"
    COPY_JSON="${OUT_BASE}.json"
    bash "$SCRIPT_DIR/slideshow_to_mp4.sh" "$COPY_JSON" "$VIDEO_PATH"
    MEDIA_ARG=("--video" "$VIDEO_PATH")
    ;;
  *)
    echo "Unknown mode: $MODE" >&2
    exit 1
    ;;
esac

echo "[run] copy written: $COPY_JSON"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[run] DRY RUN: skipping upload"
  echo "  - copy MD preview: ${OUT_BASE}.md"
  [[ "$MODE" != "single" ]] && echo "  - video:          $VIDEO_PATH"
  echo "## ${TS} sns-auto-publisher [$MODE] DRY-RUN" >> "$LOG_FILE"
  exit 0
fi

# ---------- 投稿 ----------
# 各スクリプトは個別に受け付けるので順に叩く
IFS=',' read -ra PLATS <<< "$PLATFORMS"
PY_EXTRACT="import json,sys; d=json.load(open('$COPY_JSON')); p=d['platforms']; key=sys.argv[1]; v=p[key]; print(v if isinstance(v,str) else v.get('description',''))"

post_x() {
  TEXT=$(python3 -c "$PY_EXTRACT" x)
  node "$ROOT/scripts/post-to-x.js" --text "$TEXT" "${MEDIA_ARG[@]}" || echo "[x] failed"
}
post_ig() {
  CAP=$(python3 -c "$PY_EXTRACT" instagram)
  if [[ -z "${IG_PUBLIC_MEDIA_URL:-}" ]]; then
    echo "[ig] skipped: set IG_PUBLIC_MEDIA_URL=... in .env (publicly-accessible URL)"
    return
  fi
  if [[ "$MODE" == "single" ]]; then
    node "$ROOT/scripts/post-to-instagram.js" --caption "$CAP" --image-url "$IG_PUBLIC_MEDIA_URL" || echo "[ig] failed"
  else
    node "$ROOT/scripts/post-to-instagram.js" --caption "$CAP" --video-url "$IG_PUBLIC_MEDIA_URL" --reels || echo "[ig] failed"
  fi
}
post_tt() {
  CAP=$(python3 -c "$PY_EXTRACT" tiktok)
  if [[ "$MODE" == "single" ]]; then
    echo "[tt] single-image mode not supported; convert to video first"
    return
  fi
  node "$ROOT/scripts/post-to-tiktok.js" --caption "$CAP" --video "$VIDEO_PATH" || echo "[tt] failed"
}
post_yt() {
  TITLE=$(python3 -c "import json; d=json.load(open('$COPY_JSON')); print(d['platforms']['youtube']['title'])")
  DESC=$(python3 -c "import json; d=json.load(open('$COPY_JSON')); print(d['platforms']['youtube']['description'])")
  if [[ "$MODE" == "single" ]]; then
    [[ ! -f "$VIDEO_PATH" ]] && bash "$ROOT/scripts/image-to-video.sh" "${MEDIA_ARG[1]}" "$VIDEO_PATH"
  fi
  node "$ROOT/scripts/post-to-youtube.js" \
    --video "$VIDEO_PATH" --title "$TITLE" --description "$DESC" --privacy public \
    --tags "ハイエース,バンライフ,車中泊,DIY,個人開発" || echo "[yt] failed"
}

for P in "${PLATS[@]}"; do
  case "$P" in
    x)         post_x ;;
    instagram) post_ig ;;
    tiktok)    post_tt ;;
    youtube)   post_yt ;;
    *) echo "Unknown platform: $P" ;;
  esac
done

echo "## ${TS} sns-auto-publisher [$MODE] platforms=$PLATFORMS" >> "$LOG_FILE"
echo "  - copy: $COPY_JSON" >> "$LOG_FILE"
echo "  - media: ${MEDIA_ARG[@]}" >> "$LOG_FILE"

echo "[run] complete"
