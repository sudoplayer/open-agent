---
name: cos
description: 余弦运算技能。计算 cos(x)（弧度制）并返回结果。
---

# Cos Skill

## 脚本

- `python3 agents/skills/cos/scripts/cos_numbers.py --x <x>` — 纯计算，返回 JSON `{ok, result, message}`

## 流程

1. 运行脚本：
   ```bash
   python3 agents/skills/cos/scripts/cos_numbers.py --x <x>
   ```
2. 解析 JSON 输出：
   - `ok: true` → 直接返回 `result`
   - `ok: false` → 向主编排返回 `ERROR: {message}`
