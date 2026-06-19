"""
Compute base raised to the power of x.

Usage:
    python3 exp_numbers.py --base <value> --x <value>

Output: JSON with {ok, result, message}.
"""
import argparse
import json
from typing import Any, Dict


def exp_numbers(base: float, x: float) -> Dict[str, Any]:
    try:
        result = base ** x
        if isinstance(result, complex):
            return {
                "ok": False,
                "result": None,
                "message": f"ERROR: {base} ^ {x} 结果为复数，无法计算",
            }
    except (ValueError, OverflowError) as e:
        return {
            "ok": False,
            "result": None,
            "message": f"ERROR: {base} ^ {x} 无法计算 ({e})",
        }
    return {
        "ok": True,
        "result": result,
        "message": f"{base} ^ {x} = {result}",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compute base ^ x")
    parser.add_argument("--base", type=float, required=True, help="Base")
    parser.add_argument("--x", type=float, required=True, help="Exponent")
    args = parser.parse_args()
    print(json.dumps(exp_numbers(args.base, args.x), ensure_ascii=False, indent=2))
