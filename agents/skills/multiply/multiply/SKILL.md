---
name: multiply
description: 两数乘法运算技能。计算 a * b 并返回结果。
---

# Multiply Skill

## 脚本

- `python3 agents/skills/multiply/scripts/multiply_numbers.py --a <a> --b <b>` — 纯计算，返回 JSON `{ok, result, message}`

## 流程

1. 运行脚本：
   ```bash
   python3 agents/skills/multiply/scripts/multiply_numbers.py --a <a> --b <b>
   ```
2. 解析 JSON 输出：
   - `ok: true` → 直接返回 `result`
   - `ok: false` → 向主编排返回 `ERROR: {message}`
