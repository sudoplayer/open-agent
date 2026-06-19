"""
Compute logarithm of value with specified base.

Usage:
    python3 log_numbers.py --base <value> --value <value>

Output: JSON with {ok, result, message}.
"""
import argparse
import json
import math
from typing import Any, Dict


def log_numbers(base: float, value: float) -> Dict[str, Any]:
    if value <= 0:
        return {
            "ok": False,
            "result": None,
            "message": f"ERROR: 真数必须大于 0，当前 value={value}",
        }
    if base <= 0:
        return {
            "ok": False,
            "result": None,
            "message": f"ERROR: 底数必须大于 0，当前 base={base}",
        }
    if base == 1:
        return {
            "ok": False,
            "result": None,
            "message": "ERROR: 底数不能为 1",
        }
    try:
        result = math.log(value, base)
    except (ValueError, OverflowError) as e:
        return {
            "ok": False,
            "result": None,
            "message": f"ERROR: log_{base}({value}) 无法计算 ({e})",
        }
    return {
        "ok": True,
        "result": result,
        "message": f"log_{base}({value}) = {result}",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compute log_base(value)")
    parser.add_argument("--base", type=float, required=True, help="Logarithm base")
    parser.add_argument("--value", type=float, required=True, help="Value (must be > 0)")
    args = parser.parse_args()
    print(json.dumps(log_numbers(args.base, args.value), ensure_ascii=False, indent=2))
