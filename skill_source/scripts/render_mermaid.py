# -*- coding: utf-8 -*-
"""Mermaid diagrams を kroki.io 経由で PNG にレンダリング。
依存ゼロ（標準ライブラリのみ）。
"""
import base64
import zlib
import urllib.request
import os


def render_mermaid(mmd_text: str, out_png: str, diagram_type: str = "mermaid") -> str:
    """
    mmd_text:      Mermaid syntax
    out_png:       output file path
    diagram_type:  'mermaid' | 'plantuml' | 'graphviz' ...
    """
    compressed = zlib.compress(mmd_text.encode("utf-8"), 9)
    b64 = base64.urlsafe_b64encode(compressed).decode()
    url = f"https://kroki.io/{diagram_type}/png/{b64}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=25) as r:
        data = r.read()
    os.makedirs(os.path.dirname(os.path.abspath(out_png)) or ".", exist_ok=True)
    with open(out_png, "wb") as f:
        f.write(data)
    return out_png


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("usage: render_mermaid.py <mmd_file> <out_png>")
        sys.exit(1)
    with open(sys.argv[1], encoding="utf-8") as f:
        mmd = f.read()
    p = render_mermaid(mmd, sys.argv[2])
    print(f"wrote {p} ({os.path.getsize(p)} bytes)")
