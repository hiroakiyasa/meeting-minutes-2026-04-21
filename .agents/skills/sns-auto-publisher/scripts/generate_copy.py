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

PROMPT_SINGLE = """あなたはSNSバズらせ専門のコピーライターです。
添付の画像を見て、日本語で以下4プラットフォーム向けのキャプションを生成してください。

**画像の解析**:
まず画像に写っているもの・文字・雰囲気を正確に読み取る。

**コピーのルール**:
1. 最初の1行がフック（数字・逆説・疑問のいずれか）
2. 絵文字は TikTok/Instagram のみ最小限使用、X は使わない
3. URLや商品名は補足コンテキストに従う
4. 煽り・誇張はしない。事実ベースで驚きのある切り口

補足コンテキスト:
{context}

**出力は厳密に以下のJSON形式で**（他の文字を一切含めない）:
```json
{{
  "image_analysis": "画像に写っているものの客観的説明（50字）",
  "hook": "全プラットフォーム共通の核になるフック（30字）",
  "platforms": {{
    "x":         "X用キャプション（280字以内、ハッシュタグ1-3個）",
    "instagram": "Instagram用キャプション（最初3行が命、ハッシュタグ10-15個）",
    "tiktok":    "TikTok用キャプション（最初の1行フック型、ハッシュタグ3-5個）",
    "youtube":   {{
      "title":       "YouTube Shorts タイトル（60字以内）",
      "description": "概要欄本文（ハッシュタグ3-5個を末尾に）"
    }}
  }}
}}
```
"""

PROMPT_SLIDESHOW = """あなたはSNSバズらせ専門のコピーライターです。
添付の{n}枚の画像はスライドショーの順番です（1枚目が最初）。

**やってほしいこと**:
1. 各スライドの解説ナレーション（各8〜12秒・日本語で自然に読み上げる内容）
2. スライドショー全体のキャプション（X/Instagram/TikTok/YouTube）

**ナレーションのルール**:
- 1スライド1メッセージ
- 話し言葉。BGMなしでも成立する簡潔さ
- 漢字多用せず、読み上げで聞いて理解できる語り

**キャプションのルール**:
- 最初の1行がフック（数字・逆説・疑問）
- 絵文字: TikTok/IG のみ最小限、X は使わない
- 事実ベース、煽りなし

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
                "x": f"{ctx}のお知らせ。\n詳細はこちら → [URL]\n#マーケティング",
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
            "x": f"{ctx} まとめ。ポイントは{len(images)}つ。\n#まとめ",
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
