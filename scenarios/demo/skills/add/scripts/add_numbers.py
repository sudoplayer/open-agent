"""
Compute the sum of two numbers.

Usage:
    python3 add_numbers.py --a <value> --b <value>

Output: JSON with {ok, result, message}.
"""
import argparse
import json
from typing import Any, Dict


def add_numbers(a: float, b: float) -> Dict[str, Any]:
    result = a + b
    return {
        "ok": True,
        "result": result,
        "message": f"{a} + {b} = {result}",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compute a + b")
    parser.add_argument("--a", type=float, required=True, help="First operand")
    parser.add_argument("--b", type=float, required=True, help="Second operand")
    args = parser.parse_args()
    print(json.dumps(add_numbers(args.a, args.b), ensure_ascii=False, indent=2))
