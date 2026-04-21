---
description: "画像+テキストをX/Instagram/TikTok/YouTubeに自動投稿。画像1枚からバイラルコピーを生成し4媒体に並列アップロード。"
argument-hint: "<画像パス> [--context \"補足\"] [--dry-run] [--platforms x,instagram,tiktok,youtube]"
---

# /sns — 画像+テキスト自動投稿

画像を1枚渡すだけで、Claude Vision がバイラルな日本語キャプションを4媒体別に生成し、API経由で自動投稿します。

## 使い方

```
/sns ~/Downloads/image.png
/sns ~/Downloads/image.png --context "TrailFusion AI の PR"
/sns ~/Downloads/image.png --dry-run
/sns ~/Downloads/image.png --platforms x,instagram
```

## 処理内容

1. **画像解析**: Claude Vision で画像の内容を読み取り（人物・文字・雰囲気）
2. **コピー生成**: プラットフォーム別にバイラルな日本語キャプションを生成
   - X: 280字以内、ハッシュタグ1-3
   - Instagram: 最初3行が命、ハッシュタグ10-15
   - TikTok: 最初の1行フック型、ハッシュタグ3-5（動画必須のため静止画は動画化）
   - YouTube Shorts: タイトル60字+概要欄（静止画は15秒動画化）
3. **動画化**: TikTok/YouTube向けに ffmpeg で静止画→9:16 15秒動画（ケンバーンズ効果）
4. **API投稿**: 4媒体に並列アップロード

## 実行

ユーザーから画像パスが渡されたら、以下を実行:

```bash
cd /Users/user/Applications/marketing && \
bash .agents/skills/sns-auto-publisher/scripts/run.sh single "$ARGUMENTS"
```

`$ARGUMENTS` には画像パスとフラグが入ります。

## 必要な .env 設定

- `ANTHROPIC_API_KEY` (コピー生成・必須)
- `X_API_KEY/SECRET`, `X_ACCESS_TOKEN/SECRET` (X投稿)
- `IG_USER_ID`, `IG_ACCESS_TOKEN`, `IG_PUBLIC_MEDIA_URL` (Instagram)
- `TIKTOK_ACCESS_TOKEN` (TikTok)
- `YT_CLIENT_ID/SECRET`, `YT_REFRESH_TOKEN` (YouTube)

未設定の場合は `--dry-run` でコピー生成のみ確認できます。

## 出力

- `docs/copy/YYYY-MM-DD-HHMMSS.json` — 生成されたコピー
- `docs/copy/YYYY-MM-DD-HHMMSS.md` — 人間向けプレビュー
- `docs/experiments/YYYY-MM-DD-HHMMSS-slideshow.mp4` — TikTok/YT用の動画化済みファイル
- `logs/YYYY-MM-DD.md` — 投稿ログ
