#!/usr/bin/env bash
# incoming-push.sh
# ローカル画像を受け取り、GitHub にアップロードして raw URL を返す
#
# 使い方:
#   ./scripts/incoming-push.sh <画像パス>
#   ./scripts/incoming-push.sh                 # 引数なし → incoming/ の最新画像
#
# 出力:
#   標準出力に GitHub raw URL を1行
#
# 動作:
#   1. 画像を docs/presentations/incoming/YYYYMMDD-HHMMSS-filename.ext にコピー
#   2. HEIC なら PNG に変換
#   3. git add → commit → push
#   4. https://github.com/USER/REPO/raw/main/incoming/FILE.png を出力

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$ROOT/docs/presentations"
INCOMING_REPO="$REPO_DIR/incoming"
INCOMING_LOCAL="$ROOT/incoming"
mkdir -p "$INCOMING_REPO" "$INCOMING_LOCAL"

SRC="${1:-}"

# 引数なし → incoming/ の最新画像を採用
if [[ -z "$SRC" ]]; then
  SRC=$(find "$INCOMING_LOCAL" -maxdepth 1 -type f \
    \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.heic" -o -iname "*.webp" \) \
    -exec ls -t {} + 2>/dev/null | head -1)
  if [[ -z "$SRC" ]]; then
    echo "Error: no argument and incoming/ is empty" >&2
    exit 1
  fi
fi

[[ ! -f "$SRC" ]] && { echo "Not found: $SRC" >&2; exit 1; }

TS=$(date +%Y%m%d-%H%M%S)
EXT="${SRC##*.}"
EXT_LOWER=$(echo "$EXT" | tr 'A-Z' 'a-z')
BASENAME=$(basename "${SRC%.*}" | tr ' ' '_' | tr -cd 'A-Za-z0-9_-')
[[ -z "$BASENAME" ]] && BASENAME="image"

# HEIC → PNG 変換
if [[ "$EXT_LOWER" == "heic" ]]; then
  DST="$INCOMING_REPO/${TS}-${BASENAME}.png"
  sips -s format png "$SRC" --out "$DST" >/dev/null 2>&1
else
  DST="$INCOMING_REPO/${TS}-${BASENAME}.${EXT_LOWER}"
  cp "$SRC" "$DST"
fi

# git push
cd "$REPO_DIR"
git add "${DST#$REPO_DIR/}" >&2
git -c user.email=hiroakiyasa@gmail.com -c user.name=hiroakiyasa \
    commit -qm "incoming: $(basename "$DST")" >&2
git push -q >&2

# GitHub raw URL を取得
REMOTE=$(git config --get remote.origin.url)
# https://github.com/user/repo.git or git@github.com:user/repo.git
REPO_PATH=$(echo "$REMOTE" | sed -E 's|.*github\.com[/:]||; s|\.git$||')
BRANCH=$(git rev-parse --abbrev-ref HEAD)
FILENAME=$(basename "$DST")

URL="https://github.com/${REPO_PATH}/raw/${BRANCH}/incoming/${FILENAME}"
echo "$URL"
