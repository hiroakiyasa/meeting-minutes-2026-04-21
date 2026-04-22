# iPhone Shortcut → GitHub → /sns 完全自動化

iPhone から **共有ボタン1つ** で画像をGitHub経由でアップロード → `/sns` で全SNS投稿する仕組み。

## 最終的な使い方（設定後の日常）

1. **iPhone**: 写真選択 → 共有 → 「**/sns送信**」
2. **Claude Code（Mac/Web/Remote）**: `/sns` と打つ
3. 自動でX/IG/TikTok/YouTubeに投稿

---

## 初回セットアップ（15分）

### Step 1: GitHub Personal Access Token を作成（3分）

iPhone のブラウザで：

1. https://github.com/settings/tokens/new を開く
2. **Note**: `iphone-sns-upload`
3. **Expiration**: `No expiration` or `90 days`
4. **Select scopes**: `repo` にチェック
5. **Generate token** → 表示された `ghp_xxxxxxxx...` を**必ずコピー**
6. パスワードマネージャに保存（二度と表示されません）

### Step 2: iPhone「ショートカット」アプリで新規作成（10分）

#### 2-1. 基本情報

- ショートカット アプリを開く → 右上 `+`
- 右上の設定ボタン（ⓘ）:
  - **名前**: `/sns送信`
  - **共有シートに表示**: **オン**
  - **受け付ける入力**: **イメージ** のみ
  - **アイコン**: 📸 等お好みで

#### 2-2. アクションを以下の順で追加

##### アクション1: 日時取得
- 「**現在の日付**」を検索して追加

##### アクション2: 日時フォーマット
- 「**日付をフォーマット**」を追加
- 日付フォーマット: **カスタム**
- フォーマット文字列: `yyyyMMdd-HHmmss`

##### アクション3: ファイル名変数
- 「**変数を設定**」を追加
- 変数名: `filename`
- 値: `[フォーマット済み日付].png`（前のアクション出力 + `.png`）

##### アクション4: 入力画像取得
- 「**入力から画像を取得**」を追加
- 入力: **ショートカットの入力**

##### アクション5: Base64変換
- 「**Base64エンコード**」を追加
- 入力: 前のアクション
- エンコード: **エンコード**

##### アクション6: JSON辞書作成
- 「**辞書**」を追加
- 項目追加:
  - キー `message` = 値（テキスト）`upload from iphone`
  - キー `content` = 値 [Base64エンコード結果]
  - キー `branch` = 値（テキスト）`main`

##### アクション7: GitHub API にPUT
- 「**URLの内容を取得**」を追加
- URL:
  ```
  https://api.github.com/repos/hiroakiyasa/meeting-minutes-2026-04-21/contents/incoming/[変数:filename]
  ```
- 方法: **PUT**
- ヘッダー:
  - `Authorization` = `token ghp_YOUR_TOKEN_HERE`
  - `Accept` = `application/vnd.github+json`
  - `User-Agent` = `iphone-shortcut`
- 本文を要求: **JSON**
  - JSON入力: 前のアクションの「辞書」

##### アクション8: 成功通知
- 「**通知を表示**」を追加
- タイトル: `✅ アップロード完了`
- 本文: `GitHub に [変数:filename] を保存しました`

#### 2-3. 保存

右上の「**完了**」をタップ → 共有シートから使えるようになる

### Step 3: 動作テスト

1. iPhone 写真アプリで任意の画像を選択
2. 共有ボタン（□↑）をスクロール → **「/sns送信」** をタップ
3. 2-3秒待つ → 「✅ アップロード完了」通知が出れば成功

GitHub で確認:
- https://github.com/hiroakiyasa/meeting-minutes-2026-04-21/tree/main/incoming
- `YYYYMMDD-HHMMSS.png` がアップロードされている

### Step 4: Claude Code 側で確認

Mac/リモートから：
```
/sns
```

→ GitHub最新画像を自動取得してコピー生成→投稿

---

## トラブルシューティング

### 「GitHub API 401 Bad credentials」
→ Token が間違っている or 期限切れ。再発行して Shortcut のヘッダーを更新。

### 「413 Payload Too Large」
→ 画像が25MB超。iPhoneの写真設定で「互換性優先」にするか、事前圧縮。

### 「422 Invalid request」
→ ファイル名に同名が既存。Shortcut の filename 変数に秒まで含まれるので通常発生しない。手動で GitHub の古いファイル削除。

### 画像が回転している
→ iPhone撮影画像はEXIF方向情報を持つ。GitHub/X側で正しく向きを判定するので問題にならないが、気になる場合は Shortcut に「画像を回転」アクションを追加。

---

## セキュリティ

- GitHub Token はShortcut内にのみ保存（クラウド同期される）
- 公開リポジトリなので、個人情報や社外秘の画像は入れない
- Token漏洩時は https://github.com/settings/tokens で即 Revoke

---

## 発展: 複数画像の一括アップロード（将来）

複数枚選択 → `/snsmovie` で動画化する場合は Shortcut を拡張：
- 「リピート」アクションで画像1枚ずつ順番にGitHub PUT
- ファイル名に番号を含める: `[YYYYMMDD-HHMMSS]-01.png`, `-02.png`...

Claude Code 側の `/snsmovie` が `incoming/[YYYYMMDD-HHMMSS]-*.png` を順序取得してスライドショー動画化。
