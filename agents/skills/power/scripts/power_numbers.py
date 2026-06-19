"""
Compute a raised to the power of b.

Usage:
    python3 power_numbers.py --a <value> --b <value>

Output: JSON with {ok, result, message}.
"""
import argparse
import json
from typing import Any, Dict


def power_numbers(a: float, b: float) -> Dict[str, Any]:
    try:
        result = a ** b
        if isinstance(result, complex):
            return {
                "ok": False,
                "result": None,
                "message": f"ERROR: {a} ^ {b} 结果为复数，无法计算",
            }
    except (ValueError, OverflowError) as e:
        return {
            "ok": False,
            "result": None,
            "message": f"ERROR: {a} ^ {b} 无法计算 ({e})",
        }
    return {
        "ok": True,
        "result": result,
        "message": f"{a} ^ {b} = {result}",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compute a ^ b")
    parser.add_argument("--a", type=float, required=True, help="Base")
    parser.add_argument("--b", type=float, required=True, help="Exponent")
    args = parser.parse_args()
    print(json.dumps(power_numbers(args.a, args.b), ensure_ascii=False, indent=2))
