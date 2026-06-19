"""
Compute the quotient of two numbers.

Usage:
    python3 divide_numbers.py --a <value> --b <value>

Output: JSON with {ok, result, message}.
Division by zero returns ok=false.
"""
import argparse
import json
from typing import Any, Dict


def divide_numbers(a: float, b: float) -> Dict[str, Any]:
    if b == 0:
        return {
            "ok": False,
            "result": None,
            "message": "ERROR: 除数不能为零",
        }
    result = a / b
    return {
        "ok": True,
        "result": result,
        "message": f"{a} / {b} = {result}",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compute a / b")
    parser.add_argument("--a", type=float, required=True, help="Dividend")
    parser.add_argument("--b", type=float, required=True, help="Divisor")
    args = parser.parse_args()
    print(json.dumps(divide_numbers(args.a, args.b), ensure_ascii=False, indent=2))
