# -*- coding: utf-8 -*-
"""
generate_copy.py
Claude Vision API を使って画像（1枚 or 複数）を解析し、
プラットフォーム別のバイラル日本語コピーを生成する。

出力:
  - copy.json    (各プラットフォームのキャプション + スライドショー用ナレーション)
  - copy.md      (人間向けのプレビュー)

使い方:
  python3 generate_copy.py --images img1.png [img2.png ...] --out copy
    [--mode single|slideshow] [--context "補足: TrailFusion AIのPR"]

必要:
  pip3 install anthropic
  export ANTHROPIC_API_KEY=...
"""
import argparse
import base64
import json
import os
import sys
import re

try:
    from anthropic import Anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False


MODEL = "claude-opus-4-7"  # 2026年時点の最新モデル

PROMPT_SINGLE = """あなたはSNSで「保存・拡散・コメント・フォロー」を最大化する日本語コピーライターです。
添付画像を分析し、各プラットフォームの**アルゴリズムと文化に最適化された**キャプションを生成してください。

**画像分析（最優先）**:
- 写っている物・人・文字・場所・雰囲気・色彩・季節感を**精密に読み取る**
- 画像の「**情緒的フック**」を特定する（驚き・共感・憧れ・好奇心・笑い のどれが強いか）
- 隠れた価値（ストーリー性・希少性・実用性・教訓）を見つける

**プラットフォーム別最適化（必須）**:

🐦 **X (Twitter)**:
- **必ず110字以内**（ハッシュタグ・改行・URL全て込みで合計110字以内・厳守）
- 1行目で**数字 or 逆説 or 質問**で止まらせる
- リアルタイム性・議論喚起を意識（「これ知ってる？」「実は…」）
- 短さで強さを出す（無駄語ゼロ・1単語でも削る）
- 引用RT/返信したくなる余白を残す
- 絵文字は使わない、ハッシュタグ1-2個

📷 **Instagram**:
- 最初3行で勝負（フィードでは3行しか見えない）
- 1行目: フック / 2行目: 共感ポイント / 3行目: 続きが読みたくなる引き
- ストーリー性のある本文（200-500字）
- ハッシュタグは**ジャンル+ニッチ+大衆**の組み合わせで10-15個
- 絵文字は1-3個アクセント程度

🎵 **TikTok**:
- 1行目で**滞在時間を稼ぐ**フック（「最後まで見て」「これ知らないと損」「結末がヤバい」）
- 動画と連動するコメント誘導（「○○な人いる？」「あなたはどっち派？」）
- ハッシュタグ: トレンド系2-3 + ジャンル系2-3
- 絵文字は1-2個

🎬 **YouTube Shorts**:
- タイトル: **検索意図 + 感情ワード**（例「○○の正体」「実は○○だった話」）
- 概要欄: 動画内容の要約 + チャンネル登録誘導 + ハッシュタグ3-5個
- 60字タイトル制限を活用

**バズらせる7つのテクニック（必ず1つ以上使う）**:
1. **数字の具体性**（「3つ」「7秒で」「99%が知らない」）
2. **逆説**（「実は逆」「常識が間違っていた」）
3. **権威/希少性**（「プロだけが知る」「日本に3人」）
4. **損失回避**（「知らないと損」「○○する前に見て」）
5. **共感トリガー**（「○○あるある」「わかる人〜」）
6. **物語の引き**（「結末はコメント欄に」「続きは…」）
7. **感情のピーク**（驚き→納得→感動 の3秒構成）

**禁止事項**:
- 嘘・誇張・煽り（信頼を損なう）
- 抽象的な美辞麗句（「素晴らしい」「最高」だけは禁止）
- 全プラットフォーム同じコピーの使い回し
- 平凡な「お知らせ系」の出だし

補足コンテキスト:
{context}

**出力は厳密に以下のJSON形式のみ**（他の文字一切含めない）:
```json
{{
  "image_analysis": "画像の客観的描写（80字以内、何が写っているか具体的に）",
  "emotional_hook_type": "驚き|共感|憧れ|好奇心|笑い|教訓 のどれか",
  "core_message": "この投稿で伝えたい核（30字）",
  "platforms": {{
    "x":         "X用キャプション（必ず110字以内・絵文字禁止・ハッシュタグ1-2個・1行目に強フック）",
    "instagram": "Instagram用キャプション（最初3行が命・本文200-500字・ハッシュタグ10-15個・絵文字最小限）",
    "tiktok":    "TikTok用キャプション（1行目で滞在誘導・コメント誘導文付き・ハッシュタグ3-5個）",
    "youtube":   {{
      "title":       "YouTube Shorts タイトル（60字以内・検索意図と感情の両立）",
      "description": "概要欄本文（動画要約2-3行＋登録誘導＋ハッシュタグ3-5個）"
    }}
  }}
}}
```
"""

PROMPT_SLIDESHOW = """あなたはSNSで「最後まで見させる」「保存させる」プロのコンテンツディレクターです。
添付の{n}枚の画像はスライドショーの順番です（1枚目が最初）。

**やってほしいこと**:
1. 各スライドの解説ナレーション（各8〜12秒・聞き取りやすい話し言葉）
2. スライドショー全体のキャプション（X/Instagram/TikTok/YouTube別最適化）

**ナレーション設計**:
- 1スライド目: 「**つかみ**」最初の3秒で離脱させない強フック
- 中盤: 各メッセージは1スライドに1つだけ
- 最後のスライド: **CTA or 余韻**（コメント誘導 or 印象的な締め）
- 漢字を使いすぎない、聞いて分かる語り

**キャプション最適化（プラットフォーム別）**:
🐦 X: 必ず110字以内（厳守）、1行目で止まらせる（数字/逆説/質問）、絵文字なし、ハッシュタグ1-2
📷 IG: 最初3行で勝負、本文200-500字、ハッシュタグ10-15、絵文字1-3
🎵 TikTok: 滞在時間誘導フック、コメント誘導、ハッシュタグ3-5、絵文字1-2
🎬 YouTube: 検索意図×感情、概要欄に登録誘導とハッシュタグ3-5

**バズらせる必須テクニック（1つ以上使う）**:
- 数字の具体性 / 逆説 / 損失回避 / 物語の引き / 共感トリガー / 結末予告

補足コンテキスト:
{context}

**出力は厳密に以下のJSON形式で**:
```json
{{
  "overall_hook": "動画全体の核になるフック（30字）",
  "narrations": [
    "スライド1のナレーション文",
    "スライド2のナレーション文",
    ...
  ],
  "platforms": {{
    "x":         "X用キャプション",
    "instagram": "Instagram用キャプション",
    "tiktok":    "TikTok用キャプション",
    "youtube":   {{
      "title":       "YouTube タイトル（60字以内）",
      "description": "概要欄本文"
    }}
  }}
}}
```
"""


def encode_image(path):
    with open(path, "rb") as f:
        data = f.read()
    ext = os.path.splitext(path)[1].lower().lstrip(".")
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
            "webp": "image/webp", "gif": "image/gif"}.get(ext, "image/png")
    return mime, base64.standard_b64encode(data).decode()


def extract_json(text):
    """LLM応答から最初のJSONブロックを抜き出す"""
    # ```json ... ``` を優先
    m = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
    if m:
        return json.loads(m.group(1))
    # そのまま { ... } を探す
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        return json.loads(m.group(0))
    raise ValueError("No JSON found in response: " + text[:500])


def build_content(images, prompt):
    content = []
    for p in images:
        mime, b64 = encode_image(p)
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": mime, "data": b64},
        })
    content.append({"type": "text", "text": prompt})
    return content


def template_fallback(images, mode, context):
    """API未設定時のテンプレートコピー生成（デモ・テスト用）"""
    ctx = context or "コンテンツ"
    filename = os.path.basename(images[0])
    if mode == "single":
        return {
            "image_analysis": f"[テンプレート] 画像 {filename} を解析しました",
            "hook": f"{ctx}をご覧ください",
            "platforms": {
                "x": (f"{ctx}を公開。\n#マーケティング")[:110],
                "instagram": (f"{ctx}を公開しました。\n\n"
                               "詳しくはプロフィールのリンクから。\n\n"
                               "#マーケティング #SaaS #日本"),
                "tiktok": f"{ctx}を紹介します。\n#マーケティング #新着",
                "youtube": {
                    "title": f"{ctx} 紹介（自動生成テンプレ）",
                    "description": (f"{ctx}についての紹介動画。\n\n"
                                     "チャンネル登録をお願いします。\n"
                                     "#Shorts #マーケティング"),
                },
            },
        }
    # slideshow
    narrations = [f"スライド{i+1}番目の解説です。" for i in range(len(images))]
    return {
        "overall_hook": f"{ctx} まとめ",
        "narrations": narrations,
        "platforms": {
            "x": (f"{ctx}まとめ：{len(images)}ポイント\n#まとめ")[:110],
            "instagram": (f"{ctx}の全{len(images)}ポイント公開。\n\n"
                          "詳細はリンクから。\n\n#まとめ #日本"),
            "tiktok": f"{ctx} を{len(images)}枚で解説。\n#まとめ #解説",
            "youtube": {
                "title": f"{ctx} 全{len(images)}ポイントまとめ",
                "description": (f"{ctx}の要点を{len(images)}枚のスライドで解説。\n\n"
                                 "#Shorts #まとめ"),
            },
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", nargs="+", required=True)
    ap.add_argument("--out", required=True, help="output basename (no extension)")
    ap.add_argument("--mode", choices=["single", "slideshow"], default="auto",
                    help="single/slideshow/auto (auto: 1枚なら single)")
    ap.add_argument("--context", default="")
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--template-fallback", action="store_true",
                    help="APIキー未設定時にテンプレートで代替（デモ用）")
    args = ap.parse_args()

    mode = args.mode
    if mode == "auto" or mode is None:
        mode = "single" if len(args.images) == 1 else "slideshow"

    use_fallback = args.template_fallback or not HAS_ANTHROPIC or not os.environ.get("ANTHROPIC_API_KEY")

    if use_fallback:
        reason = ("anthropic not installed" if not HAS_ANTHROPIC
                  else "ANTHROPIC_API_KEY not set" if not os.environ.get("ANTHROPIC_API_KEY")
                  else "explicit fallback")
        print(f"[copy] using TEMPLATE fallback ({reason}) mode={mode}",
              file=sys.stderr)
        data = template_fallback(args.images, mode, args.context)
    else:
        if mode == "single":
            prompt = PROMPT_SINGLE.format(context=args.context or "（なし）")
        else:
            prompt = PROMPT_SLIDESHOW.format(
                n=len(args.images), context=args.context or "（なし）"
            )
        client = Anthropic()
        print(f"[copy] mode={mode}, images={len(args.images)}, model={args.model}",
              file=sys.stderr)
        resp = client.messages.create(
            model=args.model,
            max_tokens=4000,
            messages=[{"role": "user", "content": build_content(args.images, prompt)}],
        )
        text = "".join(b.text for b in resp.content if hasattr(b, "text"))
        data = extract_json(text)
    data["_mode"] = mode
    data["_image_paths"] = [os.path.abspath(p) for p in args.images]

    # Hard-enforce X 110-char limit (truncate gracefully if LLM overshoots)
    if "platforms" in data and isinstance(data["platforms"].get("x"), str):
        x_text = data["platforms"]["x"]
        if len(x_text) > 110:
            print(f"[copy] X overshoot: {len(x_text)}c → trimming to 110c", file=sys.stderr)
            # Trim at a word/symbol boundary if possible
            trimmed = x_text[:110]
            for sep in ["\n", "。", "、", " "]:
                idx = trimmed.rfind(sep)
                if idx > 80:
                    trimmed = trimmed[:idx + (1 if sep != "\n" else 0)]
                    break
            data["platforms"]["x"] = trimmed.rstrip()

    out_json = args.out + ".json"
    out_md = args.out + ".md"
    os.makedirs(os.path.dirname(os.path.abspath(out_json)) or ".", exist_ok=True)
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # Markdown preview
    md = [f"# 自動生成コピー ({mode})\n"]
    if mode == "single":
        md.append(f"**画像解析**: {data.get('image_analysis', '')}\n")
        md.append(f"**共通フック**: {data.get('hook', '')}\n")
    else:
        md.append(f"**全体フック**: {data.get('overall_hook', '')}\n\n## スライド別ナレーション\n")
        for i, n in enumerate(data.get("narrations", []), 1):
            md.append(f"- スライド{i}: {n}")
    p = data.get("platforms", {})
    md.append("\n## プラットフォーム別キャプション\n")
    md.append(f"### X\n```\n{p.get('x', '')}\n```\n")
    md.append(f"### Instagram\n```\n{p.get('instagram', '')}\n```\n")
    md.append(f"### TikTok\n```\n{p.get('tiktok', '')}\n```\n")
    yt = p.get("youtube", {})
    if isinstance(yt, dict):
        md.append(f"### YouTube\nTitle: {yt.get('title','')}\n```\n{yt.get('description','')}\n```\n")
    with open(out_md, "w", encoding="utf-8") as f:
        f.write("\n".join(md))

    print(f"[copy] wrote: {out_json}")
    print(f"[copy] wrote: {out_md}")


if __name__ == "__main__":
    main()
