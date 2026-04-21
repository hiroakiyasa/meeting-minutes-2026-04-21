---
description: "画像+テキストを X/Instagram/TikTok/YouTube に自動投稿。画像パス/URL/incoming自動検出に対応。"
argument-hint: "[画像パス or URL] [--context \"補足\"] [--dry-run] [--platforms x,instagram,tiktok,youtube]"
---

# /sns — 画像+テキスト自動投稿（iPhone同期対応）

引数なしで実行すると **`incoming/` フォルダの最新画像** を自動ピックして使用します。

## 使い方（パターン別）

### パターンA: ローカル画像パス
```
/sns ~/Downloads/image.png
```

### パターンB: GitHub raw URL
```
/sns https://github.com/hiroakiyasa/meeting-minutes-2026-04-21/raw/main/incoming/xxx.png
```

### パターンC: incoming/ の最新画像を自動利用（iPhoneから送ったケース）
```
/sns
/sns --context "MCPまとめ"
```

## 動作フロー

1. **画像ソース判定**
   - 引数がパス → ローカル読込
   - 引数がhttps URL → ダウンロード
   - 引数なし → `incoming/` の最新ファイル

2. **GitHub自動push**（未pushならscripts/incoming-push.sh実行）
   - → raw URLを取得
   - 他媒体（Instagram等）からも参照可能に

3. **画像解析**（Claude Vision / AI）
4. **プラットフォーム別コピー生成**
5. **API経由で投稿**

## 実行コマンド

引数がある場合:
```bash
cd /Users/user/Applications/marketing && \
  bash .agents/skills/sns-auto-publisher/scripts/run.sh single "$ARGUMENTS"
```

引数なしの場合（incoming自動検出）:
```bash
cd /Users/user/Applications/marketing && \
  LATEST=$(ls -t incoming/*.{png,jpg,jpeg,heic,webp} 2>/dev/null | head -1) && \
  [[ -n "$LATEST" ]] && \
  bash .agents/skills/sns-auto-publisher/scripts/run.sh single "$LATEST"
```

## iPhoneから画像を送る方法

### 方法1: iCloud Drive 経由（推奨）
1. iPhone の「ファイル」アプリ
2. iCloud Drive → Applications → marketing → incoming （初回のみmkdir）
3. 写真を共有 → 「ファイルに保存」 → 上記フォルダ
4. Mac側に数秒で同期
5. Claude Code Remote で `/sns` と打つ

### 方法2: AirDrop → Downloads
1. iPhone で画像を選択 → 共有 → AirDrop → 自分のMac
2. Downloads に届く
3. `/sns ~/Downloads/filename.png` と指示

### 方法3: iPhone Shortcut（最速・要初回設定）
ショートカット アプリで作成:
- 入力: 共有シート（画像）
- アクション:
  1. ファイルに保存 → `iCloud Drive/Applications/marketing/incoming/`
- 名前: "マーケに送る"

→ iPhone写真アプリ → 共有 → "マーケに送る" → Macに同期 → Claude Codeで `/sns`

## 必要な .env
- `ANTHROPIC_API_KEY`（コピー生成用）
- `X_API_KEY/SECRET`, `X_ACCESS_TOKEN/SECRET`（X投稿）
- 他媒体のキー（Instagram, TikTok, YouTube）

## 出力
- `docs/presentations/incoming/<date>-<name>.png` — GitHub push済み
- `docs/copy/<date>-<time>.md` — 生成コピー
- `logs/<date>.md` — 投稿ログ
