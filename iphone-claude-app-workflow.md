# iPhone Claudeアプリから4媒体一括投稿する3つの方式

iPhoneのClaudeアプリ（Web/Native）に画像/動画を貼り付けて、X/Instagram/TikTok/YouTube に一気に投稿する仕組み。

---

## 🎯 結論

| 方式 | iPhone単独完結 | Mac起動必要 | 即時性 | 推奨度 |
|---|---|---|---|---|
| **A. Shortcut + GitHub Actions** | ✅ | ❌ 不要 | 1〜2分 | ⭐⭐⭐⭐⭐ |
| **B. Claude Code Remote** | ✅（Mac経由） | ✅ Mac起動中 | 即時 | ⭐⭐⭐ |
| **C. iPhone専用Webアプリ自作** | ✅ | ❌ 不要 | 即時 | ⭐⭐⭐⭐ |

**Claudeアプリ単独で投稿は不可能**ですが、**Shortcutを介すことで体感的に同等**の操作が可能です。

---

## 方式A: Shortcut + GitHub Actions（推奨）

### 仕組み

```
iPhone写真 → Shortcut「マーケに送る」
  → GitHub Contents API で incoming/ にPUT
  → GitHub Actions が自動発火（push検知）
  → Claude Vision で画像/動画解析 → コピー生成
  → X / Instagram / TikTok / YouTube に並列投稿
```

### メリット
- **Mac完全不要**（GitHub上で全完結）
- iPhone1タップで全媒体投稿
- 24時間稼働
- 履歴がGit履歴に残る

### セットアップ（30分）

#### 1. GitHub Secrets に APIキーを保存

リポジトリの **Settings → Secrets and variables → Actions → New repository secret**

```
ANTHROPIC_API_KEY        (バイラルコピー生成)
X_API_KEY
X_API_SECRET
X_ACCESS_TOKEN
X_ACCESS_TOKEN_SECRET
IG_USER_ID
IG_ACCESS_TOKEN
TIKTOK_ACCESS_TOKEN
TIKTOK_AUDIT_PASSED
YT_CLIENT_ID
YT_CLIENT_SECRET
YT_REFRESH_TOKEN
YT_EXPECTED_CHANNEL_ID
```

`.env` の値をそのままコピーすればOK。

#### 2. ワークフロー有効化

`.github/workflows/auto-post.yml` を `incoming/` フォルダのあるレポジトリ
（推奨: `meeting-minutes-2026-04-21` または専用 `marketing-incoming`）にコピー。

### 使い方

1. iPhoneで写真選択 → 共有 → 「マーケに送る」
2. 数秒待つ → GitHub Actions が起動
3. **2分以内に4媒体すべてに投稿完了**

---

## 方式B: Claude Code Remote から指示

### 仕組み

```
iPhone Claude Code Remote → 画像をペースト + 「全SNSに投稿して」
  → Mac側Claudeが Bash 経由で:
     - クリップボード/ペースト画像を /tmp に保存（pbpaste等）
     - GitHub にPUT
     - 4媒体投稿
```

### 制約
- Macが起動して Claude Code が動いている必要がある
- ペースト画像をディスク化する手間が発生

### メリット
- Claudeが対話的にコピーを微調整できる
- 投稿前に確認できる

---

## 方式C: 専用Webアップローダー自作

`trailfusionai.com/upload` のようなページを作る。

### 構成
```
iPhone Safari → upload.html
  → JavaScript fetch で GitHub Contents API に PUT
  → GitHub Actions が起動
  → 4媒体投稿
```

### 実装目安
- 半日（HTML/JS + GitHub Pages）

### メリット
- iPhone Shortcut の代わりに**ブラウザだけで完結**
- Android でも使える
- ファイル選択UIがリッチ

---

## 🚀 今すぐ動かす最短手順（方式A）

1. **GitHub Actions Secrets 登録**（10分）
   - 既存の `.env` の中身を Secrets にコピー
2. **ワークフロー配置**（1分）
   - `auto-post.yml` を `incoming/` のあるリポにcommit
3. **iPhone Shortcut 設定**（5分・既に作成済なら不要）
   - https://github.com/.../tree/main で incoming/ にPUT
4. **テスト投稿**
   - iPhoneから1枚画像送信 → 2分後に4媒体に投稿される

---

## 📋 動作確認

成功すると Actions タブで以下のログが見える:

```
✓ Detect changed files: incoming/20260425-...png (mode=image)
✓ Generate copy
✓ Post to all platforms
  ✓ x (exit=0)
  ✓ instagram (exit=0)
  ✓ tiktok (exit=0)
  - youtube: skipped (image mode)
```

---

## 🆘 トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| Workflow失敗 `secret X_API_KEY not found` | Secrets未登録 | Settings→Secretsで追加 |
| `IG_PUBLIC_URL` 必須 | Instagram用URL自動生成失敗 | git-pages 有効化、または Workflow 内で raw URL使用（実装済） |
| `403 Forbidden` from X | 課金切れ | X Developer Portalで確認 |
| `quotaExceeded` from YouTube | 1日6本上限 | 翌日 PT00:00 リセット待ち |

---

## 🎨 拡張アイデア

- **Slack/LINE Bot** から画像送って投稿（bridge作成）
- **Telegram Bot** 経由
- **AirDrop watch folder**（Mac側で監視）
- **Apple Watch から音声入力 → /sns**（Shortcut連携）
