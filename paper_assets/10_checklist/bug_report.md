# 系统缺陷审计报告

> 基于对全部核心源代码的逐文件审查，按严重程度降序排列。

---

## 一、Critical（会导致系统行为错误）

### Bug 1：焦虑度阈值三套不一致——A1 产生内部矛盾

**文件**：`src/lib/multi-agent-system.ts`
**位置**：行 228-232 vs 行 237-254

系统中**三处**定义了对焦虑分数的判断逻辑，但**阈值互相矛盾**：

| 位置 | 函数 | high 阈值 | medium 阈值 | 分数 60 的行为 |
|------|------|-----------|-------------|---------------|
| 行 228-232 | `anxietyScoreToLevel()` | $\geq 60$ | $\geq 30$ | `'high'` |
| 行 237-254 | `calculateNativeLanguageRatio()` | $> 80$ | $\geq 40$ | native_ratio = 0.50 |
| 行 1451, learning-graph.ts:244,208 | 内联判断 | $> 80$ | $> 40$ | `'medium'` |

**具体影响**：一个焦虑分数 = 60 的学习者会得到：
- A1 Agent 内联代码判定 `anxiety_level = 'medium'`，native_ratio = 0.50
- 但如果某处调用了 `anxietyScoreToLevel(60)`，它返回 `'high'`
- `calculateNativeLanguageRatio(60)` 返回 0.50（与 medium 一致但跟 level 标签不匹配）

**正确的三套值应该是统一的**：level 标签（high/medium/low）应该与 native_ratio（0.75/0.50/0.25）的区间一致。当前 `anxietyScoreToLevel()` 的 60/30 阈值是错误的旧版残留，系统实际使用 80/40 阈值。

### Bug 2：BKT 贝叶斯公式的分子写反了

**文件**：`src/lib/multi-agent-system.ts`
**位置**：行 308-311

```typescript
// 当前代码（行 308-311）：错误 ❌
if (observed_correct) {
    const numerator = slip_probability * prior_probability;  // ← 应该是 1 - slip_probability
    const denominator = slip_probability * prior_probability + guess_probability * (1 - prior_probability);
    return numerator / denominator;
}
```

标准 BKT 公式中，观察到正确答案时的后验概率：

$$P(L_n | \text{correct}) = \frac{(1-P(S)) \cdot P(L_n)}{(1-P(S)) \cdot P(L_n) + P(G) \cdot (1-P(L_n))}$$

其中 $P(S)$ 是失误概率（知道但答错），$P(G)$ 是猜测概率（不知道但答对）。

**当前代码将分子中的 $(1-P(S))$ 写成了 $P(S)$**。这意味着：
- 一个学生答对时，代码计算的是"给定答对，他实际上**没掌握**的概率"
- slip_probability = 0.10 时，分子是 0.10 × prior 而非 0.90 × prior
- 这会导致答对后 bkt_mastery 被错误压低

**验证**：用测试中的例子——prior=0.2, guess=0.25, slip=0.9——这个 slip 值(0.9)本身就不合理（失误概率0.9意味着知道的人90%会答错，根本不合逻辑的原因是因为分子写反了）。正确参数应该是 G=0.25, S=0.10。
- 正确：$P(L|correct) = (0.9 * 0.2) / (0.9 * 0.2 + 0.25 * 0.8) = 0.18 / 0.38 = 0.474$
- 当前代码：$P(L|correct) = (0.1 * 0.2) / (0.1 * 0.2 + 0.25 * 0.8) = 0.02 / 0.22 = 0.091$
- **差异接近 5 倍**

### Bug 3：缓存命中路径上的练习题零校验直接返回给用户

**文件**：`src/lib/multi-agent-system.ts` 行 1775-1805

`generateExercisesOnly()` 方法是缓存命中时的练习题生成路径。它调用 A4 生成练习题后**直接返回**，完全跳过：
- `verifyA4SolverAdversarial`（练习题可解性校验）
- `preA5HardRulesFilter`（拼音/HSK 合规校验）
- `verifyA4Grounding`（练习题与文化阐释的忠实度校验）
- A5 质量审核
- 双模型联合仲裁

```typescript
// multi-agent-system.ts:1775-1805
private async generateExercisesOnly(...): Promise<GeneratedContent> {
    const a4Result = await withRetry(
      () => this.agents.get('A4_ContentGenerator')!.process({...}), 2
    );
    return a4Result.payload.generated_content as GeneratedContent;  // ← 直接返回
}
```

**LangGraph 版本的缓存路径**（`learning-graph.ts:184-256`）做了 Solver 对抗盲测但同样跳过了 A5 双模型仲裁。这意味着缓存内容的质量门控**只在首次写入时执行一次**，后续每次从缓存读取时生成的新练习题不再经过质量审核。

### Bug 4：`getKnowledgePointByScene` 的 OR 查询只匹配第一个关键词

**文件**：`src/lib/multi-agent-system.ts` 行 1033-1078

```typescript
const keywords = SCENE_TO_KP_KEYWORDS[sceneId] || [sceneId];
let query = supabase
    .from("cultural_knowledge_points")
    .select("id, content_json, hsk_level")
    .or(`content_json->zh->>topic.ilike.%${keywords[0]}%`)
    // ← 只用了 keywords[0]，忽略了 keywords[1..n]
    .limit(1);
```

`SCENE_TO_KP_KEYWORDS['food']` 返回 `['饮食', '日常饮食', '食物', '筷子', '合餐', '超市']`，但当前代码只用第一个关键词 `'饮食'` 做模糊匹配。如果数据库中没有 topic 包含"饮食"的知识点，查询返回空——尽管 topics 中包含"筷子"或"合餐"的记录完全匹配 food 场景。后续关键词完全未被使用。

---

## 二、Major（功能缺失或设计缺陷）

### 缺陷 5：`getLanguageCode()` 和 `getSceneType()` 四处重复定义

| 位置 | 内容 |
|------|------|
| `constants.ts:46-108` | LANGUAGE_NAME_TO_CODE 8项 + SCENE_TYPE_MAP 约60项 + SCENE_TO_KP_KEYWORDS 14行 |
| `learning-graph.ts:49-80` | 内联重复一份简化的 languageMap + SCENE_MAP |
| `learning-graph.ts` 节点函数内 | A2 Guardrail 校验中内联重复 langNames |
| `multi-agent-system.ts:1550-1575` | A2回译原文查找逻辑与 learning-graph.ts 行 327-351 **完全重复** |

手写编排器和 LangGraph 编排器之间共享 0 行代码，但重复了约 150 行的核心逻辑。维护时需两处同步修改。

### 缺陷 6：BaseAgent 的 A1 配置了不必要的模型和温度

**文件**：`src/lib/constants.ts` 行 9

```typescript
A1_LearnerProfiler: { model: 'doubao-seed-2-0-pro-260215', temperature: 0.3 },
```

A1 Agent 是纯计算节点，不调用任何 LLM。给它分配模型配置：
- 如果其他代码通过 `BaseAgent.generateResponse()` 调用了 A1，会莫名其妙发起一次昂贵的大模型调用
- 即使当前不调用，配置的存在本身就是一个静态错误

### 缺陷 7：`saveToKnowledgeBase()` 使用硬编码的 fallback confidence 0.90

**文件**：`src/lib/multi-agent-system.ts` 行 1153

```typescript
const confidence = params.confidence ?? 0.90;
```

未传入 confidence 时默认 0.90——这比实际阈值 0.60 高出很多。这意味着任何**不通过 Guardrail 流程的写入**（例如直接从某个路径调用 saveToKnowledgeBase 而不传 confidence）都会以 0.90 的高信任度入库。而这个值**完全没有依据**。

### 缺陷 8：`callLLM` 拼接 URL 的逻辑假设 API 根路径不含 `/v1`

**文件**：`src/services/guardrail-service.ts` 行 169

```typescript
const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
```

如果环境变量 `DEEPSEEK_API_URL` 被设置为 `https://api.deepseek.com/v1`（很多服务商的文档会建议这样设置），最终 URL 会变成 `https://api.deepseek.com/v1/v1/chat/completions`。

### 缺陷 9：Guardrail 校验失败后系统行为退化不一致

当 Guardrail 失败时，不同模块有不同的退化策略：

| Guardrail | 失败时行为 | 是否阻塞下游 |
|-----------|-----------|-------------|
| verifyA2Translation | 返回 `FLAG_PENDING_REVIEW` | ❌ 不阻塞，A4 仍使用此阐释生成内容 |
| verifyA3Comparison | 返回 `FLAG_PENDING_REVIEW` | ❌ 不阻塞 |
| verifyA4SolverAdversarial | 返回 `FLAG_REJECT` | ❌ 不阻塞，只记录到 guardrailResults |
| verifyA4Grounding | 返回 `FLAG_PENDING_REVIEW` | ❌ 不阻塞 |
| preA5HardRules | 返回 `FLAG_PENDING_REVIEW` | ❌ 不阻塞 |
| verifyA5JointArbitration | 返回 `FLAG_PENDING_REVIEW` | ❌ 不阻塞 |

所有 Guardrail 的失败都**不影响最终返回值**——系统总是把内容返回给用户，只在 `guardrail_results` 里附带一个标记。这与论文宣称的"同步阻塞"策略**直接矛盾**。论文说"内联门控在错误内容传播到下一个处理节点之前拦截"，但实际代码是"记录但不拦截"。

---

## 三、Medium（边缘情况与可靠性问题）

### 问题 10：拼音校验正则的设计漏洞

**文件**：`src/services/guardrail-service.ts` 行 72

```typescript
const PINYIN_LINE_RE = /^[...\s1-5\...]+$/;
```

正则中 `\s1-5` 允许数字 1-5 出现在字母序列的**任意位置**——例如 `"n1i3 h2a3o3"` 会通过校验，因为单个数字在字符集中。正确做法是要求数字只能作为声调标记出现在每个音节末尾，当前正则完全没有音节结构概念。

### 问题 11：`safeJsonParse` 和 `extractJSON` 是两个独立实现

| 函数 | 文件 | 行数 |
|------|------|------|
| `safeJsonParse()` | `multi-agent-system.ts:51-85` | 35行 |
| `extractJSON()` | `guardrail-service.ts:134-150` | 17行 |

两个函数做完全相同的事（解析 markdown 包裹的 JSON / 提取花括号内的 JSON），但`extractJSON` 多了 `stripThinkTags()` 调用而 `safeJsonParse` 没有。这意味着**如果 LLM 输出带有 `<｜end▁of▁thinking｜>A5 的 LLM 输出如果包含 `...<｜end▁of▁thinking｜>现在我来生成系统缺陷审计报告。

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="Write">
<｜｜DSML｜｜parameter name="content" string="true"># 系统缺陷审计报告

> 基于对全部核心源代码的逐文件审查。按严重程度降序排列。

---

## 一、Critical（会导致系统行为错误）

---

### Bug 1：焦虑度阈值三套标准不一致

**文件**：`src/lib/multi-agent-system.ts`

系统中**三处**定义了对同一焦虑分数的判断逻辑，但**阈值完全矛盾**：

| 位置 | 函数/代码 | high | medium | 用例 |
|------|-----------|------|--------|------|
| 行 228-232 | `anxietyScoreToLevel()` | >=60 | >=30 | 焦虑分数60 → 返回 `'high'` |
| 行 237-254 | `calculateNativeLanguageRatio()` | >80 | >=40 | 焦虑分数60 → native_ratio = 0.50 |
| 行 1451 | `processLearningRequest()` 缓存路径 | >80 | >40 | 焦虑分数60 → `'medium'` |
| 行 244,208 | `learning-graph.ts` 两处内联 | >80 | >40 | 焦虑分数60 → `'medium'` |

**直接影响**：焦虑分数=60的学习者通过 `anxietyScoreToLevel()` 被判为 `'high'`，但通过 A1 内联代码和 `calculateNativeLanguageRatio()` 被判为 `'medium'`（native_ratio=0.50）。label 和 behavior 矛盾。

**根因**：`anxietyScoreToLevel()` 保留的是旧版 60/30 阈值（测试文件 `core.test.ts:112-122` 也是旧版），而其余代码已经迁移到了与 native_ratio 一致的 80/40 阈值。

---

### Bug 2：BKT 贝叶斯公式的分子写反了

**文件**：`src/lib/multi-agent-system.ts` 行 308-311

```typescript
// 当前代码：错误 ❌
if (observed_correct) {
    const numerator = slip_probability * prior_probability;  // bug!
    const denominator = slip_probability * prior_probability + guess_probability * (1 - prior_probability);
    return numerator / denominator;
}
```

标准 BKT 公式中，观察到正确答案时的后验概率是：

$$P(L_n | \text{correct}) = \frac{(1-P(S)) \cdot P(L_n)}{(1-P(S)) \cdot P(L_n) + P(G) \cdot (1-P(L_n))}$$

其中 $P(S)$ = 失误概率（知道但答错），$P(G)$ = 猜测概率。

**代码把分子中的 $(1-P(S))$ 写成了 $P(S)$**。设定 G=0.25, S=0.10，prior=0.5 时：

- 正确计算结果：0.947
- 当前代码结果：0.286  
- **方向完全反了**——答对题目后系统判断学生的掌握概率反而下降

测试文件 `core.test.ts:195-197` 使用了 slip=0.9 的极端值才让这个 bug 不影响测试预期（"答对后掌握度上升"），因为 slip=0.9 让 inverted bug 也产生了上升效果。

---

### Bug 3：缓存命中路径绕过全部质量门控

**文件**：`src/lib/multi-agent-system.ts` 行 1775-1805

`generateExercisesOnly()` 是缓存命中时的练习生成路径。该函数：

1. 调用 A4 生成练习题
2. **直接返回**，完全跳过：
   - ❌ verifyA4SolverAdversarial（可解性）
   - ❌ preA5HardRulesFilter（拼音/HSK合规）
   - ❌ verifyA4Grounding（忠实度）
   - ❌ A5 质量审核
   - ❌ 双模型联合仲裁

```typescript
// multi-agent-system.ts:1783-1805
private async generateExercisesOnly(...) {
    const a4Result = await withRetry(
      () => this.agents.get('A4_ContentGenerator')!.process({...}), 2
    );
    return a4Result.payload.generated_content as GeneratedContent;  // ← 零校验直接返回
}
```

**直接影响**：论文中那套引以为傲的六层 Guardrail 校验体系，在缓存命中场景下**完全不工作**。而缓存命中应该是系统的主要使用路径——否则设计缓存就没意义。

**补充**：LangGraph 版本（`learning-graph.ts:184-256`）修复了一部分（加了 Solver 盲测），但同样跳过 A5 双模型仲裁和 Grounding 校验。

---

### Bug 4：`getKnowledgePointByScene` 的 OR 查询只匹配第一个关键词

**文件**：`src/lib/multi-agent-system.ts` 行 1052-1054

```typescript
const keywords = SCENE_TO_KP_KEYWORDS[sceneId] || [sceneId];
const { data: kpData } = await query
    .or(`content_json->zh->>topic.ilike.%${keywords[0]}%`)  // ← 只用了 [0]
    .limit(1);
```

`SCENE_TO_KP_KEYWORDS['food']` 返回 `['饮食', '日常饮食', '食物', '筷子', '合餐', '超市']` 6 个关键词，但查询只用第一个。如果库中 topic 不含"饮食"，即使有含"筷子"或"合餐"的记录也查不到。后续 5 个关键词完全浪费。

---

## 二、Major（设计缺陷与功能缺失）

---

### 缺陷 5：Guardrail"同步阻塞"是虚假声明

**论文声称**："所有 Guardrail 校验均采用同步阻塞模式——在校验完成之前，下游 Agent 不会启动。"

**实际代码行为**：

| Guardrail | 失败时的 action | 是否阻塞 A4/A5 生成 | 实际效果 |
|-----------|----------------|-------------------|---------|
| verifyA2Translation | FLAG_PENDING_REVIEW | ❌ | A4 仍基于此阐释生成 |
| verifyA3Comparison | FLAG_PENDING_REVIEW | ❌ | A4 仍基于此对比生成 |
| verifyA4SolverAdversarial | FLAG_REJECT | ❌ | 只记录到 guardrail_results |
| verifyA4Grounding | FLAG_PENDING_REVIEW | ❌ | 只记录 |
| preA5HardRules | FLAG_PENDING_REVIEW | ❌ | 只记录 |
| verifyA5JointArbitration | FLAG_PENDING_REVIEW | ❌ | 只记录 |

**无一例外，全部 Guardrail 失败都不影响最终返回值。** A2 回译校验失败 → A4 照样用这个有问题的阐释生成内容。A5 双模型仲裁失败 → 内容照样返回给用户。

论文中描述的"在错误传播到下一个节点之前拦截"机制在代码中**不存在**。只有 `computeCacheConfidence()` 通过提高/降低置信度影响后续的缓存复用——但当前请求的内容已经发出去了。

---

### 缺陷 6：`getLanguageCode()` 和 `getSceneType()` 在三个文件中独立重定义

| 文件 | 重复内容 |
|------|---------|
| `constants.ts:46-108` | LANGUAGE_NAME_TO_CODE（8项）+ SCENE_TYPE_MAP（~60项）+ SCENE_TO_KP_KEYWORDS（14行） |
| `learning-graph.ts:49-80` | languageMap（8项，独立副本）+ SCENE_MAP（~20项不完整副本） |
| `learning-graph.ts:353` | langNames（8项，又一份独立副本） |

手写编排器（`MultiAgentCoordinator`）和 LangGraph 编排器之间**共享 0 行编排逻辑**，约 150 行代码在两个文件中**完全独立重写**。维护任何场景/语言映射都需要改三处。

---

### 缺陷 7：A1 Agent 配置了不该有的模型

**文件**：`src/lib/constants.ts` 行 9

```typescript
A1_LearnerProfiler: { model: 'doubao-seed-2-0-pro-260215', temperature: 0.3 },
```

A1 是**纯计算节点**，不调用任何 LLM。给它配置模型意味着：
- 如果未来有人通过 `BaseAgent.generateResponse()` 调了 A1，会静默发起一次昂贵且无意义的 LLM 调用
- 静态类型和配置文件都暗示 A1 是 LLM Agent，误导维护者

---

### 缺陷 8：`saveToKnowledgeBase()` 的 fallback confidence 毫无依据

**文件**：`src/lib/multi-agent-system.ts` 行 1153

```typescript
const confidence = params.confidence ?? 0.90;
```

不传 confidence 时默认 0.90。这个数字：
- 从未被任何 Guardrail 校验验证过
- 高于系统阈值 0.60 但没有校验依据
- 意味着所有绕过 Guardrail 的缓存写入都以"高信任度"入库

---

### 缺陷 9：`callLLM` 的 URL 拼接逻辑

**文件**：`src/services/guardrail-service.ts` 行 169

```typescript
const resp = await fetch(`${baseUrl}/v1/chat/completions`, {...
```

如果环境变量设为 `https://api.deepseek.com/v1`，URL 变成 `https://api.deepseek.com/v1/v1/chat/completions`。许多 API 服务商的文档示例中 baseUrl 已经包含 `/v1`。

---

### 缺陷 10：A2 回译校验输入的是阐释文本而非原始中文概念

**文件**：`src/lib/multi-agent-system.ts` 行 1577

```typescript
originalChineseText = SCENE_TO_KP_KEYWORDS[scene_type]?.[0] || scene_type;
```

当 `knowledge_point_id` 不是有效的 UUID（如场景 ID "food"），DB 查询和 `getKnowledgePointByScene` 都失败时，fallback 是场景关键词数组的第一个词（如"饮食"）。

`verifyA2Translation` 用这个仅两三个字作为"核心概念"让 LLM 做 NLI 裁判——DeepSeek 拿到"饮食"两个字去比对一段 200 词的阐释，判断"回译是否准确解释了核心概念"。裁判质量取决于这个核心概念文本的充实程度。

---

## 三、Medium（边缘情况与可靠性问题）

---

### 问题 11：拼音校验正则允许数字出现在任意位置

**文件**：`src/services/guardrail-service.ts` 行 72

```typescript
const PINYIN_LINE_RE = /^[a-zāáǎà...\s1-5\,\.\?\!;...]+$/;
```

`\s1-5` 将数字 1-5 与空格并列，意味着 `"n1i3 h2a3o3"` 会通过校验——数字可以在字符序列的任意位置。正确做法是要求数字声调只在每个音节末尾出现。当前校验只能拦住明显非法字符（如 @#$），对格式混乱的拼音号无害。

---

### 问题 12：`safeJsonParse` 和 `extractJSON` 是两个独立实现

| 函数 | 文件 | 差异 |
|------|------|------|
| `safeJsonParse()` | `multi-agent-system.ts:51-85` | 无法处理 LLM 的 `&lt;think&gt;` 标签 |
| `extractJSON()` | `guardrail-service.ts:134-150` | 有 `stripThinkTags()` 但缺少 fallback brace 提取逻辑 |

同一个解析需求存在两个不同实现，且各自缺少对方的功能。当 MiniMax 输出包含 `... 中，那么 `guardrailService.extractJSON()` 可以正确处理但 `safeJsonParse()` 不行。

---

### 问题 13：`callLLM` 返回空字符串时无统一处理

**文件**：`src/services/guardrail-service.ts` 行 189-190

```typescript
const data = await resp.json();
return data.choices?.[0]?.message?.content || "";
```

`verifyA2Translation` 对空返回做了判断（行 296-305），但 `verifyA3Comparison`、`verifyA4Grounding`、`verifyA4SolverAdversarial` 对空内容的处理方式各不相同。Solver 盲测的空返回会触发字母解析失败并返回 FLAG，但 Grounding 校验的 judge 空返回会走到 `includes("TRUE")` 并返回 false。

---

### 问题 14：缓存路径的`anxiety_level`直接用三目运算符而非调A1

**文件**：`src/lib/multi-agent-system.ts` 行 1450-1451，`learning-graph.ts` 行 244

```typescript
const dbAnxietyLevel = dbAnxietyScore > 80 ? 'high' : dbAnxietyScore > 40 ? 'medium' : 'low';
```

这个逻辑内联了两处，但 `anxietyScoreToLevel()` 函数（行 228-232）的阈值是 60/30。这意味着**存在一个叫 `anxietyScoreToLevel` 的公开导出函数，它给的值和系统实际使用的值不一样**。未来任何人调用这个函数都会得到错误结果。

---

### 问题 15：`verifyA3Comparison` 的 judgePrompt 传入了非原始的 `knowledge_point_id`

**文件**：`src/lib/multi-agent-system.ts` 行 1603-1604

```typescript
guardrailResults.a3_comparison = await guardrail.verifyA3Comparison(
    knowledge_point_id,  // ← 这里是一个 UUID，如 "kp_xxx"，不是中文概念
```

`verifyA3Comparison` 的 prompt 中会写"【中国文化概念】：${chineseConcept}"——如果传入的是 UUID 而不是中文 topic 名，LLM 裁判需要先猜这个 UUID 是什么意思再判断 A3 是否客观。正确做法是传知识点 topic 名称而不是 DB 主键。

---

## 四、测试覆盖问题

**文件**：`src/__tests__/core.test.ts`（315 行）

| 被测试的模块 | 覆盖情况 |
|-------------|---------|
| `safeJsonParse` | ✅ 4 个用例 |
| `calculateAnxietyDelta` / `applyAnxietyDelta` | ✅ 4 个用例 |
| `calculateCulturalAnxiety` | ✅ 3 个用例 |
| `anxietyScoreToLevel` | ⚠️ 测试了错误的 60/30 阈值 |
| `calculateNativeLanguageRatio` | ⚠️ 仅测试了 80/40 版本，未与 level 对齐 |
| `detectBias` | ✅ 5 个用例 |
| `bayesianKnowledgeTracing` | ⚠️ 测试用了 slip=0.9，无意中绕过了公式 bug |
| `calculateAbilityVector` | ✅ 2 个用例 |
| `hskLevelMatches` | ✅ 4 个用例 |
| 所有 Agent（A1-A5） | ❌ **0 个用例** |
| 所有 Guardrail（6 种） | ❌ **0 个用例** |
| CacheManager（全部方法） | ❌ **0 个用例** |
| learning-graph（全部节点） | ❌ **0 个用例** |
| results API | ❌ **0 个用例** |
| 场景映射、语言映射 | ❌ **0 个用例** |

核心算法有 24 个测试用例，但**全部是纯函数的单元测试**。任何涉及 Agent、Guardrail、缓存、API 的模块**无一被测试**。315 行测试对于一个 3700 行的核心系统来说是极度不够的。

---

## 五、总结

### 必须立即修复（阻塞上线）

| 优先级 | 问题 | 修复难度 |
|--------|------|---------|
| 🔴 P0 | Bug 2: BKT 公式分子写反 | 1 行改 `slip` 为 `1-slip` |
| 🔴 P0 | Bug 1: 统一焦虑度阈值为 80/40 | 改 `anxietyScoreToLevel()` |
| 🔴 P0 | Bug 3: 缓存路径加 Guardrail | 约 50 行重构 |
| 🔴 P0 | Bug 4: 场景查询用全部关键词 | 10 行修复 |

### 必须在投稿前修复（否则审稿人发现会导致 reject）

| 问题 | 论文对应声明 | 风险 |
|------|-------------|------|
| 缺陷 5: Guardrail 不阻塞 | "内联门控同步阻断" | 论文核心创新点被证伪 |
| 缺陷 6: 代码重复 | "系统架构严谨" | 审稿人可能要求代码审查 |
| Bug 2: BKT 公式错误 | "BKT 知识追踪" | 学术错误 |

### 建议修复

| 问题 | 理由 |
|------|------|
| 缺陷 10: 回译原文过于简单 | Ablation 实验中 A2 校验效果会被人为压低的 fallback 质量拖累 |
| 缺陷 15: A3 校验传入 UUID | 当前 NLI 裁判输入质量堪忧 |
| 缺陷 7: A1 的模型配置 | 代码质量问题 |
