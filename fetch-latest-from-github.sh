#!/usr/bin/env bash
# fetch-latest-from-github.sh
# GitHub リポジトリの incoming/ フォルダから最新画像を取得してローカルに保存
#
# 使い方:
#   ./scripts/fetch-latest-from-github.sh
#   → 最新画像を incoming/ にDL、パスを標準出力
#
# 環境変数:
#   GITHUB_REPO (default: hiroakiyasa/meeting-minutes-2026-04-21)
#   GITHUB_BRANCH (default: main)
#   GITHUB_TOKEN (任意・プライベートレポのみ)

set -euo pipefail

REPO="${GITHUB_REPO:-hiroakiyasa/meeting-minutes-2026-04-21}"
BRANCH="${GITHUB_BRANCH:-main}"
FOLDER="incoming"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="$ROOT/incoming"
mkdir -p "$DEST_DIR"

# ディレクトリ一覧取得
API_URL="https://api.github.com/repos/${REPO}/contents/${FOLDER}?ref=${BRANCH}"
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  JSON=$(curl -sfL -H "Authorization: token $GITHUB_TOKEN" -H "User-Agent: sns-fetch" "$API_URL" || echo "[]")
else
  JSON=$(curl -sfL -H "User-Agent: sns-fetch" "$API_URL" || echo "[]")
fi

# 最新ファイルのdownload_urlを抽出（filename逆ソートで最新）
LATEST=$(echo "$JSON" | python3 -c '
import sys, json
try:
    items = json.load(sys.stdin)
    files = [i for i in items if i.get("type") == "file" and any(
        i["name"].lower().endswith(ext) for ext in [".png",".jpg",".jpeg",".webp",".heic"])]
    files.sort(key=lambda x: x["name"], reverse=True)
    if files:
        print(files[0]["download_url"] + "\t" + files[0]["name"])
except Exception as e:
    pass
')

if [[ -z "$LATEST" ]]; then
  echo "Error: no images in ${REPO}/${FOLDER}" >&2
  exit 1
fi

URL=$(echo "$LATEST" | cut -f1)
NAME=$(echo "$LATEST" | cut -f2)

DEST="$DEST_DIR/$NAME"
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  curl -sfL -H "Authorization: token $GITHUB_TOKEN" "$URL" -o "$DEST"
else
  curl -sfL "$URL" -o "$DEST"
fi

echo "$DEST"
