---
description: "画像+テキストを X/Instagram/TikTok/YouTube に自動投稿。iPhone Shortcut → GitHub → /sns で完全自動。"
argument-hint: "[画像パス or URL] [--context \"補足\"] [--dry-run] [--platforms x,instagram,tiktok,youtube]"
---

# /sns — 画像+テキスト自動投稿

## 🎯 最推奨ワークフロー（iPhone Shortcut経由）

1. iPhone で **「/sns送信」ショートカット**実行（初回15分でセットアップ）
2. GitHub の `incoming/` に即アップロード（1-3秒）
3. Claude Code Remote で `/sns` とだけ打つ

→ 最新画像を GitHub から自動取得してバイラル投稿

セットアップ手順: `docs/iphone-shortcut-setup.md`

## 使い方

### パターンA: 引数なし（GitHub最新画像を使用）
```
/sns
/sns --context "MCP総まとめ投稿"
```

### パターンB: ローカル画像パス
```
/sns ~/Downloads/image.png
```

### パターンC: GitHub URL直接
```
/sns https://github.com/hiroakiyasa/meeting-minutes-2026-04-21/raw/main/incoming/xxx.png
```

## 実行

### 引数なし → GitHub最新をフェッチして使用
```bash
cd /Users/user/Applications/marketing && \
  LATEST=$(bash scripts/fetch-latest-from-github.sh) && \
  echo "Using latest from GitHub: $LATEST" && \
  bash .agents/skills/sns-auto-publisher/scripts/run.sh single "$LATEST"
```

### 引数あり → そのまま渡す
```bash
cd /Users/user/Applications/marketing && \
  bash .agents/skills/sns-auto-publisher/scripts/run.sh single "$ARGUMENTS"
```

## 必要な環境変数

- `ANTHROPIC_API_KEY`（コピー生成）
- `X_API_KEY/SECRET`, `X_ACCESS_TOKEN/SECRET`（X投稿）
- `IG_USER_ID`, `IG_ACCESS_TOKEN`（Instagram）
- `TIKTOK_ACCESS_TOKEN`（TikTok、審査通過後）
- `YT_CLIENT_ID/SECRET`, `YT_REFRESH_TOKEN`（YouTube）
- `GITHUB_TOKEN`（プライベートリポの場合のみ）
