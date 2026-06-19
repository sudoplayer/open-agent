---
name: orchestration
description: 编排 AI 计算器主流程：解析表达式并按优先级逐步委托子智能体（四则、幂、指数、对数、三角函数）
---

# 表达式计算编排工作流

## 执行顺序（严格遵守）

### 0. 倒计时

在执行任何其他步骤之前，先运行倒计时：

1. 调用 `stream_image(filename="countdown.png")`，在对话中嵌入实时图像占位
2. 执行倒计时脚本（阻塞约 11 秒）：

```bash
bash -i -c "conda run -n langgraph python agents/skills/orchestration/scripts/countdown.py \
  --session_run_path <session_run_path>"
```

3. 等脚本返回 `{"ok": true}` 后，继续执行 Step 1

### 1. 解析表达式

从用户消息中提取代数表达式。识别：

- 二元运算符：`+` `-` `*` `/` `^` `**`
- 一元函数：`sin(x)` `cos(x)` `tan(x)` `sqrt(x)` `exp(x, base)` `log(x, base)`
- 括号：`(` `)`
- 常量：`pi`（≈3.14159）、`e`（≈2.71828），委托子智能体前替换为数值
- 运算优先级：**括号 > 一元函数 > 幂运算 > 乘除 > 加减**；同级从左到右（幂运算右结合，`2^3^2` = `2^(3^2)`）
- 三角函数使用**弧度制**

### 2. 逐步归约

每一步只取出**一个运算**（按优先级），用 `task` 工具调用对应的子智能体。

运算符 / 函数 → 子智能体映射：

| 形式 | 子智能体 | description 参数示例 |
|------|----------|---------------------|
| `a + b` | `add_agent` | `a=3, b=5` |
| `a - b` | `subtract_agent` | `a=8, b=3` |
| `a * b` | `multiply_agent` | `a=8, b=2` |
| `a / b` | `divide_agent` | `a=3, b=3` |
| `a ^ b` 或 `a ** b` | `power_agent` | `a=2, b=3` |
| `sqrt(x)` | `power_agent` | `a=x, b=0.5`（归约为 x^0.5） |
| `exp(x, base)` | `exp_agent` | `base=2, x=3` |
| `log(x, base)` | `log_agent` | `base=10, value=100` |
| `sin(x)` | `sin_agent` | `x=1.57` |
| `cos(x)` | `cos_agent` | `x=0` |
| `tan(x)` | `tan_agent` | `x=0.785` |

调用格式示例：
```
task(
  name="add_agent",
  description="计算 3 + 5，操作数为 a=3, b=5"
)

task(
  name="sin_agent",
  description="计算 sin(1.5708)，x=1.5708"
)

task(
  name="log_agent",
  description="计算 log_10(100)，base=10, value=100"
)
```

**关键规则：**
- 禁止调用 `general-purpose` 子智能体
- 禁止自己心算运算结果
- 二元运算的 `task` 调用必须在 description 中明确给出两个操作数的值
- 一元运算的 `task` 调用必须在 description 中明确给出自变量（及 log/exp 的底数）

### 3. 等待子智能体返回

子智能体完成任务后可能返回不同内容。根据返回内容决定下一步：

- **返回数字** → 将结果代回原表达式，继续下一轮归约
- **包含 "用户拒绝" 或 "rejected"** → 停止计算，告知用户该步骤被拒绝
- **包含 "ERROR:"** → 停止计算，告知用户出错

### 4. 代回与继续

每次得到一个确认的结果后，将该数字代回表达式中的原运算位置，形成新的简化表达式。继续按优先级选择下一个运算。

### 5. 获取工作目录

使用 `request_file_path` 工具向用户请求工作目录路径：

```
request_file_path(
  request="请输入工作目录路径，最终计算总结将保存在该路径下"
)
```

将返回的路径记为 `working_dir`（用户提供的路径已存在，无需创建）。

### 6. 保存总结与最终输出

1. 使用 `execute` 命令将完整的逐步计算过程保存到 `{working_dir}/result.md`。根据实际计算过程生成内容，格式如：
   ```bash
   cat > {working_dir}/result.md << 'RESULT_EOF'
   # 计算结果

   - 表达式: (3+5)*2
   - 最终结果: 16
   - 逐步过程:
     1. 3+5=8（括号内优先）
     2. 8×2=16
   RESULT_EOF
   ```

2. 告知用户计算完成，结果已保存至 `{working_dir}/result.md`。

## 示例

### 示例 A：基础四则 `(3+5)*2`

```
第1步: 取出 3+5（括号内优先）
  → task(add_agent, "计算 3+5, a=3, b=5")
  → 返回 8
  → 表达式简化为 8*2

第2步: 取出 8*2（乘法优先）
  → task(multiply_agent, "计算 8*2, a=8, b=2")
  → 返回 16
  → 表达式归约为 16

第3步: 调用 request_file_path 获取工作目录
  → 用户提供 /home/temp/calc_output（已有路径）

第4步: 保存总结文件到 /home/temp/calc_output/result.md
  → 告知用户结果已保存

最终结果: (3+5)*2 = 16
```

### 示例 B：科学计算 `sin(pi/2) + log(100, 10) + 2^3`

假设 `pi/2` 已归约为 `1.5708`：

```
第1步: sin(1.5708)（一元函数优先于加减）
  → task(sin_agent, "计算 sin(1.5708), x=1.5708")
  → 返回 1
  → 表达式简化为 1 + log(100, 10) + 2^3

第2步: log(100, 10)
  → task(log_agent, "计算 log_10(100), base=10, value=100")
  → 返回 2
  → 表达式简化为 1 + 2 + 2^3

第3步: 2^3（幂运算优先于加减）
  → task(power_agent, "计算 2^3, a=2, b=3")
  → 返回 8
  → 表达式简化为 1 + 2 + 8

第4步: 1 + 2
  → task(add_agent, "计算 1+2, a=1, b=2")
  → 返回 3
  → 表达式简化为 3 + 8

第5步: 3 + 8
  → task(add_agent, "计算 3+8, a=3, b=8")
  → 返回 11
  → 表达式归约为 11

最终结果: sin(pi/2) + log(100, 10) + 2^3 = 11
```

### 示例 C：sqrt 归约为幂运算 `sqrt(16) + 1`

```
第1步: sqrt(16) → power(16, 0.5)
  → task(power_agent, "计算 16^0.5, a=16, b=0.5")
  → 返回 4
  → 表达式简化为 4 + 1

第2步: 4 + 1
  → task(add_agent, "计算 4+1, a=4, b=1")
  → 返回 5

最终结果: sqrt(16) + 1 = 5
```

## 注意

- 请用中文与用户交流
- 若子智能体报告用户拒绝，应立即停止后续计算
- 不要跳过任何一步的 HITL 确认
