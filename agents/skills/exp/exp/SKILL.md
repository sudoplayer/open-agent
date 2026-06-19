---
name: exp
description: 可指定底数的指数运算技能。计算 base ^ x 并向用户确认结果。
---

# Exp Skill

## 脚本

- `python3 agents/skills/exp/scripts/exp_numbers.py --base <base> --x <x>` — 纯计算，返回 JSON `{ok, result, message}`。域错误时返回 `ok: false`
- `ask_user_question(question, options)` — 向用户确认计算结果

## 流程

1. 运行脚本得到计算结果：
   ```bash
   python3 agents/skills/exp/scripts/exp_numbers.py --base <base> --x <x>
   ```
   解析 JSON 输出：若 `ok` 为 `true`，取 `result` 作为计算结果。
2. **如果 `ok` 为 `false`** → 直接向主编排报告 `message` 中的错误信息，**不要**调用 `ask_user_question`，流程结束
3. 否则，调用 `ask_user_question` 向用户确认。问题中包含底数、指数和计算结果，选项如 `["确认", "拒绝", "结果有误需要修改"]`
4. 根据用户回复决定返回内容

## 用户反馈处理规则

- **用户确认**（如"正确""对""确认""好的"等）→ 直接返回计算结果
- **用户给出修正值** → 返回用户修正后的值，不再重试
- **用户指出参数错误** → 用正确的底数和指数重新运行脚本，再次确认
- **用户拒绝且无具体修正** → 向主编排报告"用户拒绝了 {base}^{x} 的结果"
- **禁止**忽略用户反馈、**禁止**返回已被用户否定的计算结果
