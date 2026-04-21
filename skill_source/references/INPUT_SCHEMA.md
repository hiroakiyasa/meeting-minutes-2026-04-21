# input.json スキーマ

```jsonc
{
  "cover": {
    "title": "表紙タイトル",
    "subtitle": "日時・副題",
    "footer": "作成者"
  },
  "summary": {
    "header": "エグゼクティブサマリー",
    "kpis": [ ["参加", "8名", "8部門"], ... ],
    "blocks": [ ["①品質WG", "Teams会議情報活用"], ... ]
  },
  "agenda": ["アジェンダ1", "アジェンダ2", ...],
  "sections": [
    {
      "header": "品質WG",
      "lead": "テーマ: Teams会議情報の活用",
      "bullets": ["ポイント1", "ポイント2", ...],
      "visual": {                              // 省略可 = テキストのみ
        "type": "bar_horizontal" | "bar_compare" | "priority_matrix" | "mermaid",
        "id": "unique_id",
        // --- bar_horizontal ---
        "data": {"A": 10, "B": 20},
        "xlabel": "分",
        "unit": "分",
        // --- bar_compare ---
        "categories": ["録音", "文字起こし"],
        "current": [92, 58],
        "target":  [95, 90],
        // --- priority_matrix ---
        "items": [["項目A", 8, 7], ...],
        // --- mermaid ---
        "code": "flowchart LR\n  A-->B",
        "title": "タイトル",
        "caption": "チャート下のコメント"
      }
    }
  ],
  "full_visuals": [
    { "id": "roadmap", "type": "gantt",
      "header": "ロードマップ",
      "title": "2ヶ月計画",
      "tasks": [ ["タスク名", "2026-04-21", "2026-05-20", 0], ... ],
      "marker_date": "2026-06-15",
      "marker_label": "経営層報告",
      "note": "▼ 補足コメント"
    },
    { "id": "org_flow", "type": "mermaid",
      "header": "連携体制",
      "code": "flowchart TD\n  ..."
    }
  ],
  "decisions": ["決定事項1", "決定事項2", ...],
  "todos": {
    "with_load_chart": true,
    "items": [ ["担当", "アクション", "期限"], ... ]
  },
  "closing": {
    "title": "次回: 2026-05",
    "subtitle": "マイルストーン: ...",
    "footer": "スキル: jp-automation-pptx v1.0"
  }
}
```
