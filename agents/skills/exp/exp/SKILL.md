---
name: exp
description: 可指定底数的指数运算技能。计算 base ^ x 并返回结果。
---

# Exp Skill

## 脚本

- `python3 agents/skills/exp/scripts/exp_numbers.py --base <base> --x <x>` — 纯计算，返回 JSON `{ok, result, message}`。域错误时返回 `ok: false`

## 流程

1. 运行脚本：
   ```bash
   python3 agents/skills/exp/scripts/exp_numbers.py --base <base> --x <x>
   ```
2. 解析 JSON 输出：
   - `ok: true` → 直接返回 `result`
   - `ok: false` → 向主编排返回 `ERROR: {message}`
