---
name: tan
description: 正切运算技能。计算 tan(x)（弧度制）并返回结果。
---

# Tan Skill

## 脚本

- `python3 agents/skills/tan/scripts/tan_numbers.py --x <x>` — 纯计算，返回 JSON `{ok, result, message}`。无定义或溢出时返回 `ok: false`

## 流程

1. 运行脚本：
   ```bash
   python3 agents/skills/tan/scripts/tan_numbers.py --x <x>
   ```
2. 解析 JSON 输出：
   - `ok: true` → 直接返回 `result`
   - `ok: false` → 向主编排返回 `ERROR: {message}`
