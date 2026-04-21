# -*- coding: utf-8 -*-
"""data-visualization スキルの原則に基づく matplotlib チャート生成。
  - CB-safe パレット
  - ゼロベースライン厳守
  - 3D / 円グラフ / 二重軸 禁止
  - top/right spine 非表示、グリッド最小限
  - 棒グラフに数値アノテーション
"""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np
import pandas as pd

PAL = ["#4C72B0", "#DD8452", "#55A868", "#C44E52", "#8172B3", "#937860"]

plt.rcParams.update({
    "figure.dpi": 180,
    "font.family": "Hiragino Sans",
    "font.size": 11,
    "axes.titlesize": 15,
    "axes.titleweight": "bold",
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.grid": True,
    "grid.alpha": 0.25,
})


def _save(fig, path):
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    fig.tight_layout()
    fig.savefig(path, dpi=180, bbox_inches="tight")
    plt.close(fig)
    return path


def bar_horizontal(data: dict, title: str, xlabel: str, out: str, unit: str = ""):
    """data = {"label1": value1, "label2": value2}"""
    df = pd.DataFrame({"k": list(data.keys()), "v": list(data.values())}).sort_values("v")
    fig, ax = plt.subplots(figsize=(10, max(3.5, 0.55 * len(df) + 1.5)))
    ax.barh(df["k"], df["v"], color=PAL[0])
    xmax = max(df["v"]) * 1.18
    ax.set_xlim(0, xmax)
    for i, v in enumerate(df["v"]):
        ax.text(v + xmax * 0.01, i, f"{v}{unit}", va="center", fontsize=10)
    ax.set_xlabel(xlabel)
    ax.set_title(title)
    return _save(fig, out)


def bar_compare(categories, current, target, title, out, ylabel="%", percent=True):
    x = np.arange(len(categories))
    w = 0.38
    fig, ax = plt.subplots(figsize=(10, 5.5))
    ax.bar(x - w / 2, current, w, label="現状", color=PAL[3])
    ax.bar(x + w / 2, target, w, label="目標", color=PAL[2])
    ax.set_xticks(x)
    ax.set_xticklabels(categories)
    if percent:
        ax.set_ylim(0, 100)
        ax.yaxis.set_major_formatter(mticker.PercentFormatter())
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    for i, (c, t) in enumerate(zip(current, target)):
        ax.annotate(f"-{t - c}", xy=(i, (c + t) / 2), ha="center", fontsize=9, color="#888")
    ax.legend(loc="lower right", frameon=False)
    return _save(fig, out)


def gantt(tasks, title, out, marker_date=None, marker_label=""):
    """tasks = [(name, start_iso, end_iso, color_index), ...]"""
    fig, ax = plt.subplots(figsize=(10, max(3.5, 0.5 * len(tasks) + 1.5)))
    for i, (name, s, e, ci) in enumerate(tasks):
        sd = pd.Timestamp(s)
        ed = pd.Timestamp(e)
        ax.barh(i, (ed - sd).days, left=sd, color=PAL[ci % len(PAL)], height=0.55)
        ax.text(sd, i, f"  {name}", va="center", fontsize=10)
    ax.set_yticks(range(len(tasks)))
    ax.set_yticklabels([""] * len(tasks))
    ax.invert_yaxis()
    ax.set_title(title)
    ax.xaxis_date()
    if marker_date:
        md = pd.Timestamp(marker_date)
        ax.axvline(md, color=PAL[3], linestyle="--", linewidth=1)
        ax.text(md, -0.8, f"  ▼ {marker_label}", color=PAL[3], fontsize=10)
    fig.autofmt_xdate()
    return _save(fig, out)


def priority_matrix(items, title, out, xlabel="効果の大きさ →", ylabel="緊急度 →"):
    """items = [(name, x, y), ...]"""
    fig, ax = plt.subplots(figsize=(8, 6))
    xs = [i[1] for i in items]
    ys = [i[2] for i in items]
    ax.scatter(xs, ys, s=320, c=PAL[0], alpha=0.75, edgecolors="white", linewidths=2)
    for name, x, y in items:
        ax.annotate(name, (x, y), textcoords="offset points", xytext=(8, 6), fontsize=10)
    ax.axhline(7.5, color="#888", linewidth=0.8, linestyle=":")
    ax.axvline(7.5, color="#888", linewidth=0.8, linestyle=":")
    ax.set_xlim(4.5, 10)
    ax.set_ylim(4.5, 10)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    ax.text(9.5, 9.5, "最優先", ha="right", va="top", fontsize=10,
            color=PAL[3], fontweight="bold")
    ax.text(5.0, 5.0, "後回し", ha="left", va="bottom", fontsize=10, color="#888")
    return _save(fig, out)


def bar_vertical(data: dict, title: str, out: str, ylabel=""):
    df = pd.DataFrame({"k": list(data.keys()), "v": list(data.values())}) \
        .sort_values("v", ascending=False)
    fig, ax = plt.subplots(figsize=(9, 4.8))
    colors = [PAL[0] if v == max(df["v"]) else PAL[2] for v in df["v"]]
    bars = ax.bar(df["k"], df["v"], color=colors)
    for b, v in zip(bars, df["v"]):
        ax.text(b.get_x() + b.get_width() / 2, v + max(df["v"]) * 0.02,
                str(v), ha="center", fontsize=11, fontweight="bold")
    ax.set_ylim(0, max(df["v"]) * 1.2)
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    ax.yaxis.set_major_locator(mticker.MaxNLocator(integer=True))
    return _save(fig, out)
