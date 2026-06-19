---
name: divide
description: 两数除法运算技能。计算 a / b 并返回结果。除数为零时直接报错。
---

# Divide Skill

## 脚本

- `python3 agents/skills/divide/scripts/divide_numbers.py --a <a> --b <b>` — 纯计算，返回 JSON `{ok, result, message}`。除数为 0 时返回 `ok: false`

## 流程

1. 运行脚本：
   ```bash
   python3 agents/skills/divide/scripts/divide_numbers.py --a <a> --b <b>
   ```
2. 解析 JSON 输出：
   - `ok: true` → 直接返回 `result`
   - `ok: false` → 向主编排返回 `ERROR: {message}`
