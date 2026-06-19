---
name: tan
description: 正切运算技能。计算 tan(x)（弧度制）并向用户确认结果。
---

# Tan Skill

## 脚本

- `python3 agents/skills/tan/scripts/tan_numbers.py --x <x>` — 纯计算，返回 JSON `{ok, result, message}`。无定义或溢出时返回 `ok: false`
- `ask_user_question(question, options)` — 向用户确认计算结果

## 流程

1. 运行脚本得到结果：
   ```bash
   python3 agents/skills/tan/scripts/tan_numbers.py --x <x>
   ```
   解析 JSON 输出。
2. **如果 `ok` 为 `false`** → 直接向主编排报告 `message` 中的错误信息，**不要**调用 `ask_user_question`，流程结束
3. 否则，调用 `ask_user_question` 向用户确认。问题中包含自变量和计算结果，选项如 `["确认", "拒绝", "结果有误需要修改"]`
4. 根据用户回复决定返回内容

## 用户反馈处理规则

- **用户确认**（如"正确""对""确认""好的"等）→ 直接返回计算结果
- **用户给出修正值** → 返回用户修正后的值，不再重试
- **用户指出自变量错误** → 用正确的 x 重新运行脚本，再次确认
- **用户拒绝且无具体修正** → 向主编排报告"用户拒绝了 tan({x}) 的结果"
- **禁止**忽略用户反馈、**禁止**返回已被用户否定的计算结果
