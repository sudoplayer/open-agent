---
name: divide
description: 两数除法运算技能。计算 a / b 并向用户确认结果。除数为零时直接报错。
---

# Divide Skill

## 脚本

- `python3 agents/skills/divide/scripts/divide_numbers.py --a <a> --b <b>` — 纯计算，返回 JSON `{ok, result, message}`。除数为 0 时返回 `ok: false`，`message` 包含错误信息
- `ask_user_question(question, options)` — 向用户确认计算结果

## 流程

1. 运行脚本得到结果：
   ```bash
   python3 agents/skills/divide/scripts/divide_numbers.py --a <a> --b <b>
   ```
   解析 JSON 输出。
2. **如果 `ok` 为 `false`** → 直接向主编排报告 `message` 中的错误信息，**不要**调用 `ask_user_question`，流程结束
3. 否则（`ok` 为 `true`），取 `result` 作为计算结果，调用 `ask_user_question` 向用户确认。问题中包含操作数和计算结果，选项如 `["确认", "拒绝", "结果有误需要修改"]`
4. 根据用户回复决定返回内容

## 用户反馈处理规则

- **用户确认**（如"正确""对""确认""好的"等）→ 直接返回计算结果
- **用户给出修正值**（如"应该是2""改成2"）→ 返回用户修正后的值，不再重试
- **用户指出操作数错误** → 用正确的操作数重新运行脚本，再次确认
- **用户拒绝且无具体修正**（如"拒绝""错了""n"）→ 向主编排报告"用户拒绝了 {a}/{b} 的结果"
- **禁止**忽略用户反馈、**禁止**返回已被用户否定的计算结果
