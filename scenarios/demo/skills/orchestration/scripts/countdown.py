#!/usr/bin/env python3
"""
在 session_run_path 下生成倒计时图片（10 → 0），每秒覆盖写入 countdown.png。
用于测试 stream_image 工具的实时图像刷新效果。

用法：
    python countdown.py --session_run_path /path/to/session

输出：
    stdout 打印一行 JSON：{ok, message}
"""

import argparse
import json
import os
import sys
import time

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


def draw_frame(n: int, output_path: str) -> None:
    fig, ax = plt.subplots(figsize=(4, 4))
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    fig.patch.set_facecolor("#1a1a2e")

    color = "#e94560" if n > 0 else "#00b4d8"
    label = str(n) if n > 0 else "GO!"
    ax.text(
        0.5, 0.5, label,
        ha="center", va="center",
        fontsize=120, fontweight="bold",
        color=color,
        transform=ax.transAxes,
    )
    ax.text(
        0.5, 0.12, "countdown" if n > 0 else "done",
        ha="center", va="center",
        fontsize=18, color="#aaaaaa",
        transform=ax.transAxes,
    )

    fig.tight_layout(pad=0)
    tmp_path = output_path + ".tmp"
    fig.savefig(tmp_path, dpi=100, facecolor=fig.get_facecolor(), format="png")
    plt.close(fig)
    os.replace(tmp_path, output_path)  # 原子重命名：mtime 只变化一次，文件一定完整


def main() -> None:
    parser = argparse.ArgumentParser(description="生成倒计时图片序列")
    parser.add_argument("--session_run_path", required=True, help="会话工作目录")
    args = parser.parse_args()

    output_path = os.path.join(args.session_run_path, "countdown.png")

    for n in range(10, -1, -1):
        try:
            draw_frame(n, output_path)
        except Exception as e:
            print(f"绘图失败 n={n}: {e}", file=sys.stderr)
        if n > 0:
            time.sleep(1)

    print(json.dumps({"ok": True, "message": "倒计时完成"}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
