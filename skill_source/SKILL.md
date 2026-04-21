---
name: jp-automation-pptx
description: Create Japanese business presentations (PPTX) that combine automation-style structured text with data-visualization charts and mermaid diagrams where appropriate. Use when the user wants to generate meeting minutes, reports, or proposals in Japanese that need both detailed text and selective visuals. Triggers - "資料作って", "議事録PPTX", "プレゼン資料", "ハイブリッド資料", "わかりやすい資料".
metadata:
  version: 1.0.0
  author: custom
  composes:
    - powerpoint-automation (aktsmm) — base layout philosophy
    - data-visualization (Anthropic) — chart generation rules
    - mermaid-diagrams (softaworks) — diagram generation
---

# Japanese Automation + Data Viz + Mermaid Hybrid PPTX

このスキルは3つの既存スキルを組み合わせた独自スキルです。

## 設計思想

1. **ベースは Automation スタイル**（日本企業標準の堅実な情報密度）
   - 游ゴシック、ネイビー+白、箱組みレイアウト、情報を漏らさず構造化
2. **数値・傾向があるときだけ data-visualization チャートを挿入**
   - matplotlib で CB-safe パレット、ゼロベースライン厳守、3D/円グラフ禁止
3. **関係・フロー・時系列があるときだけ mermaid 図を挿入**
   - kroki.io 経由でレンダリング（zero-install）

## 判定ルール (When to add visuals)

| 入力の性質 | 挿入する視覚要素 |
|---|---|
| 定量データ（件数・%・分布） | **data-viz** 棒/横棒/散布 |
| 時系列・期限・進捗 | **data-viz** ガント or **mermaid** gantt |
| ステークホルダー関係・意思決定フロー | **mermaid** flowchart / sequence |
| 状態遷移・合意形成プロセス | **mermaid** stateDiagram |
| 優先度・象限分類 | **data-viz** 散布（matrix） |
| 単純な項目列挙 | **テキスト箱のみ**（無理に図解しない） |

> **禁止事項**: 図のための図は作らない。各スライドは「テキスト主体」「数値→チャート」「関係→mermaid」の3種のみ。

## ワークフロー

### Step 1: 入力を解析
- 固有名詞・役職・専門用語・日時を抽出
- 誤字脱字・記載漏れを検出して補正案を準備
- ToDo や決定事項を構造化

### Step 2: スライド構成を決定
標準テンプレ（9-12枚）:
1. 表紙
2. エグゼクティブサマリー（KPIカード4枚）
3. アジェンダ
4. 本体セクション（3-4枚）— 必要に応じてチャート/図を挿入
5. 決定事項
6. ToDo 一覧（テーブル）
7. ロードマップ（data-viz ガント or mermaid）
8. 次回

### Step 3: チャート生成（必要なら）
`scripts/render_chart.py` で matplotlib 出力

### Step 4: Mermaid 図生成（必要なら）
`scripts/render_mermaid.py` で kroki.io 経由 PNG 取得

### Step 5: PPTX 組み立て
`scripts/build_pptx.py` で automation スタイルのレイアウトに画像を埋め込む

## 使い方

```bash
# データを input.json に書いて
python3 scripts/build_pptx.py input.json output.pptx
```

input.json のフォーマットは `references/INPUT_SCHEMA.md` 参照。

## 実装ファイル

- `scripts/render_chart.py` — data-visualization 原則に基づく matplotlib チャート
- `scripts/render_mermaid.py` — kroki.io で Mermaid → PNG
- `scripts/build_pptx.py` — automation スタイル本体
- `references/INPUT_SCHEMA.md` — 入力JSONスキーマ
