---
description: "複数画像からナレーション付きスライドショーMP4を生成し、X/Instagram/TikTok/YouTubeに自動投稿。3秒×N枚+日本語TTS音声付き。"
argument-hint: "<画像1> <画像2> ... | <ディレクトリ> [--context \"補足\"] [--dry-run] [--platforms x,instagram,tiktok,youtube]"
---

# /snsmovie — スライドショー動画自動生成＋SNS投稿

複数画像から**3秒/枚のスライドショーMP4**を自動生成し、日本語ナレーションを付けて4媒体に並列投稿します。

## 使い方

```
/snsmovie slide1.png slide2.png slide3.png
/snsmovie ~/slides/week16/                    # ディレクトリ指定
/snsmovie s1.png s2.png s3.png --context "AI推進定例会Week16まとめ"
/snsmovie ~/slides/ --dry-run                 # 投稿せずMP4生成のみ
```

## 処理内容

1. **画像順序の確定**: ディレクトリ指定時はファイル名順
2. **ナレーション生成**: 各スライドの解説文 + 全体キャプション4媒体分を Claude Vision で一括生成
3. **音声合成 (TTS)**: 日本語TTS（macOS `say` / OpenAI TTS）で各ナレーションをMP3化
4. **動画合成 (ffmpeg)**:
   - 解像度 1080×1920（9:16縦・TikTok/Reels/Shorts最適）
   - 各画像を音声長に合わせて表示（最低3秒保証）
   - **ケンバーンズ風ズームイン効果**
   - 音声と完全同期
5. **API投稿**: X/Instagram Reels/TikTok/YouTube Shorts に並列投稿

## 実行

ユーザーが `/snsmovie` で画像（複数）またはディレクトリを指定したら:

```bash
cd /Users/user/Applications/marketing

# 引数に拡張子があれば slideshow モード
# ディレクトリなら slideshow-dir モード
# ここでは $ARGUMENTS をそのまま渡す
bash .agents/skills/sns-auto-publisher/scripts/run.sh slideshow $ARGUMENTS
```

もしくはディレクトリ指定時:
```bash
bash .agents/skills/sns-auto-publisher/scripts/run.sh slideshow-dir $ARGUMENTS
```

## 必要な .env 設定

- `ANTHROPIC_API_KEY`（ナレーション生成・必須）
- 各SNSのトークン（`/sns` と同じ）
- `OPENAI_API_KEY`（任意・高品質TTSを使う場合のみ）

## 出力

- `docs/copy/YYYY-MM-DD-HHMMSS.json/.md` — ナレーションとキャプション
- `docs/experiments/YYYY-MM-DD-HHMMSS-slideshow.mp4` — 9:16 MP4（1080×1920）
- `logs/YYYY-MM-DD.md` — 投稿ログ

## デザインガイド

- **1枚1メッセージ**: 1枚に詰め込みすぎない
- **縦構図推奨**: 元画像が16:9だと左右に黒帯が入る
- **ナレーションは話し言葉**: 漢字多用せず聞いて分かる文章に自動生成

## Tips

- 投稿前に `--dry-run` で MP4とコピーだけ生成して内容確認推奨
- TikTok は審査通過前は `SELF_ONLY` になる（`.env` の `TIKTOK_AUDIT_PASSED=1` で解除）
