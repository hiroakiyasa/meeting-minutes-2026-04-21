# iPhone → Mac → GitHub → SNS 自動化フロー

iPhoneから画像を送ると、自動でGitHubに保存され、`/sns` で即投稿できるワークフロー。

---

## 🏗️ 構成

```
[iPhone 写真]
    │ ① 共有→「マーケに送る」ショートカット
    ▼
[iCloud Drive/Applications/marketing/incoming/]
    │ ② Mac側にiCloud自動同期
    ▼
[Mac: ~/Applications/marketing/incoming/]
    │ ③ /sns コマンドが最新ファイルを自動ピック
    ▼
[scripts/incoming-push.sh が docs/presentations/incoming/ へコピー+GitHub push]
    │
    ▼
[GitHub raw URL 取得]
    │
    ▼
[X/IG/TikTok/YT に自動投稿]
```

---

## 📱 iPhone Shortcut セットアップ（初回のみ・2分）

### 手順

1. iPhone で **ショートカット** アプリを開く
2. 右上 `+` をタップ → 新規ショートカット
3. アクションを追加:
   - **「ファイルを保存」** を検索して選択
   - 保存先: `iCloud Drive > Applications > marketing > incoming`（初回は作成）
   - 「保存前にファイル名を確認」→ オフ（自動連番推奨）
4. 右上 `︙` → 詳細:
   - 名前: **「マーケに送る」**
   - 共有シートに表示: **オン**
   - 入力を受け入れる: **イメージ、メディア**
5. 完了

### 使い方
1. 写真アプリで画像選択 → 共有 → **「マーケに送る」**
2. 数秒でMacにiCloud同期
3. Mac側 Claude Code で `/sns` と打つだけ

---

## 💻 Mac側 incoming フォルダのiCloud化

`~/Applications/marketing/incoming/` をiCloud同期するには2通り:

### 方法A: シンボリックリンク（推奨）
```bash
# incomingをiCloud側に移動し、ローカルにシンボリックリンク
mkdir -p ~/Library/Mobile\ Documents/com~apple~CloudDocs/Applications/marketing/incoming
rm -rf ~/Applications/marketing/incoming
ln -s ~/Library/Mobile\ Documents/com~apple~CloudDocs/Applications/marketing/incoming ~/Applications/marketing/incoming
```

### 方法B: iCloudフォルダを直接使う
`/sns` コマンドに iCloud パスを渡すだけ:
```
/sns ~/Library/Mobile\ Documents/com~apple~CloudDocs/Applications/marketing/incoming/最新画像.png
```

---

## 🧪 テスト

### テスト1: 既存画像で動作確認
```bash
cd /Users/user/Applications/marketing
./scripts/incoming-push.sh /Users/user/Downloads/IMG_7343.PNG
# → https://github.com/.../raw/main/incoming/YYYYMMDD-HHMMSS-IMG_7343.png が出力
```

### テスト2: /sns 自動検出
```bash
# incomingに画像を置いて
cp ~/Downloads/IMG_7343.PNG incoming/
# 引数なしで実行 → 最新を自動検出
bash .agents/skills/sns-auto-publisher/scripts/run.sh single incoming/IMG_7343.PNG --dry-run
```

---

## ⚠️ 注意

- **iCloudの同期遅延**: WiFi切断時は数分かかる場合あり
- **同名ファイル**: `incoming-push.sh` がタイムスタンプを付けるので衝突しない
- **セキュリティ**: `.env` はiCloudに同期しないこと（シンボリックリンク方式なら `incoming/` のみ同期）

---

## 🎯 ユースケース

| シーン | 操作 |
|---|---|
| 外出先で思いついた投稿 | iPhone で画像→共有→「マーケに送る」→ 後でMacで `/sns` |
| 会議中のホワイトボード撮影 | 同上 |
| スクリーンショット即投稿 | iPhoneでスクショ→共有→「マーケに送る」→ `/sns` で数分後投稿 |
| Claude Code Remote で完結 | iPhoneの Claude Code Remote Control で `/sns` と打つだけ |
