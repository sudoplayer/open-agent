"""
Compute cosine of x (radians).

Usage:
    python3 cos_numbers.py --x <value>

Output: JSON with {ok, result, message}.
"""
import argparse
import json
import math
from typing import Any, Dict


def cos_numbers(x: float) -> Dict[str, Any]:
    result = math.cos(x)
    return {
        "ok": True,
        "result": result,
        "message": f"cos({x}) = {result}",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compute cos(x) in radians")
    parser.add_argument("--x", type=float, required=True, help="Angle in radians")
    args = parser.parse_args()
    print(json.dumps(cos_numbers(args.x), ensure_ascii=False, indent=2))
