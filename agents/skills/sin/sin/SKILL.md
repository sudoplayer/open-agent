---
name: sin
description: 正弦运算技能。计算 sin(x)（弧度制）并返回结果。
---

# Sin Skill

## 脚本

- `python3 agents/skills/sin/scripts/sin_numbers.py --x <x>` — 纯计算，返回 JSON `{ok, result, message}`

## 流程

1. 运行脚本：
   ```bash
   python3 agents/skills/sin/scripts/sin_numbers.py --x <x>
   ```
2. 解析 JSON 输出：
   - `ok: true` → 直接返回 `result`
   - `ok: false` → 向主编排返回 `ERROR: {message}`
