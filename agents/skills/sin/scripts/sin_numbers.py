"""
Compute sine of x (radians).

Usage:
    python3 sin_numbers.py --x <value>

Output: JSON with {ok, result, message}.
"""
import argparse
import json
import math
from typing import Any, Dict


def sin_numbers(x: float) -> Dict[str, Any]:
    result = math.sin(x)
    return {
        "ok": True,
        "result": result,
        "message": f"sin({x}) = {result}",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compute sin(x) in radians")
    parser.add_argument("--x", type=float, required=True, help="Angle in radians")
    args = parser.parse_args()
    print(json.dumps(sin_numbers(args.x), ensure_ascii=False, indent=2))
