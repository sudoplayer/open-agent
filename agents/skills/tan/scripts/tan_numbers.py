"""
Compute tangent of x (radians).

Usage:
    python3 tan_numbers.py --x <value>

Output: JSON with {ok, result, message}.
"""
import argparse
import json
import math
from typing import Any, Dict


def tan_numbers(x: float) -> Dict[str, Any]:
    cos_x = math.cos(x)
    if abs(cos_x) < 1e-15:
        return {
            "ok": False,
            "result": None,
            "message": f"ERROR: tan({x}) 无定义（接近 π/2 + kπ）",
        }
    try:
        result = math.tan(x)
        if not math.isfinite(result):
            return {
                "ok": False,
                "result": None,
                "message": f"ERROR: tan({x}) 结果溢出",
            }
    except (ValueError, OverflowError) as e:
        return {
            "ok": False,
            "result": None,
            "message": f"ERROR: tan({x}) 无法计算 ({e})",
        }
    return {
        "ok": True,
        "result": result,
        "message": f"tan({x}) = {result}",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compute tan(x) in radians")
    parser.add_argument("--x", type=float, required=True, help="Angle in radians")
    args = parser.parse_args()
    print(json.dumps(tan_numbers(args.x), ensure_ascii=False, indent=2))
