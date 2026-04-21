---
name: sns-auto-publisher
description: Viral SNS auto-publisher. Takes a single image or multiple images, generates attention-grabbing Japanese SNS copy via AI (vision), creates a narrated slideshow MP4 for multi-image inputs (3 seconds per image with TTS voiceover), and auto-posts to X (Twitter), Instagram, TikTok, and YouTube via native APIs. Triggers - "SNS投稿", "自動投稿", "バズらせて", "スライドショー動画", "画像投稿", "動画投稿".
metadata:
  version: 1.0.0
  author: custom
  composes:
    - post-to-x.js (existing)
    - post-to-instagram.js (existing)
    - post-to-tiktok.js (existing)
    - post-to-youtube.js (existing)
    - image-to-video.sh (existing)
---

# SNS Auto Publisher

画像を渡すだけで、バイラルなSNSキャプション自動生成 → 4プラットフォーム自動投稿 までやる統合スキル。

## ワークフロー

### Mode 1: 単一画像
```
image
  ↓ generate_copy.py (Claude vision API)
  ↓ プラットフォーム別のバイラルコピー生成
  ↓ image-to-video.sh (必要なら静止画→15秒動画)
  ↓ post_all.js
  → X / Instagram / TikTok / YouTube
```

### Mode 2: 複数画像（スライドショー）
```
image1, image2, image3, ...
  ↓ generate_copy.py
  ↓ 各スライドの解説テキスト + 全体キャプション生成
  ↓ tts.sh (各解説→音声)
  ↓ slideshow_to_mp4.sh (3秒×N枚 + ナレーション結合)
  ↓ 1本の MP4 + 全体キャプション
  ↓ post_all.js
  → YouTube / TikTok / Instagram Reels / X
```

## 呼び方

```bash
# 単一画像
./scripts/run.sh single /path/to/image.png

# 複数画像（スライドショーMP4を自動生成）
./scripts/run.sh slideshow /path/to/img1.png /path/to/img2.png /path/to/img3.png

# ディレクトリ丸ごと（ファイル名順）
./scripts/run.sh slideshow-dir /path/to/images_dir/

# 投稿せずコピー生成とMP4生成だけ（ドライラン）
./scripts/run.sh slideshow --dry-run /path/to/dir/
```

## 必要な設定

- `.env` に4媒体のAPIキー（既存の `docs/setup-sns-apis.md` 参照）
- `ANTHROPIC_API_KEY`（バイラルコピー生成用・必須）
- `OPENAI_API_KEY`（OpenAI TTSを使う場合のみ・任意。省略時はmacOS `say` コマンド使用）
- `brew install ffmpeg`
- `pip3 install anthropic` (copy gen)

## 出力

- `docs/copy/YYYY-MM-DD-generated.md` — 生成されたプラットフォーム別コピー
- `docs/experiments/YYYY-MM-DD-slideshow.mp4` — 生成されたスライドショー動画
- `logs/YYYY-MM-DD.md` — 投稿ログ

## 実装ファイル

- `scripts/generate_copy.py` — Claude Vision で画像解析→バイラル日本語コピー
- `scripts/tts.sh` — 日本語TTS（macOS `say` / OpenAI TTS 選択可）
- `scripts/slideshow_to_mp4.sh` — 複数画像+音声→9:16 MP4
- `scripts/run.sh` — オーケストレーター（single/slideshow判定）
