# 三级记忆 / 三级存储设计方案

> 适用系统：母语驱动的跨文化对比式中文学习平台
> 设计日期：2026-05-14
> 版本：v1.0 MVP

## 1. 适配结论

**可以借鉴论文的三级记忆时间窗口思想，但必须做"中文学习场景化改造"。**

| 论文原概念 | 能借鉴 | 不能照搬 | 本系统对应物 |
|-----------|--------|---------|------------|
| real-time memory | ✅ 时间层级组织 | ❌ 心理咨询实时情绪 | L1 当前会话记忆：本轮逐题结果、耗时、维度 |
| short-term memory | ✅ 近期行为聚合 | ❌ complaint chain | L2 近期学习窗口：最近N轮记录、高频错点、趋势 |
| long-term memory | ✅ 稳定画像+快照 | ❌ 自评量表/症状追踪 | L3 稳定画像：learners主行 + 定期snapshot |
| emotion perturber | ✅ 动态参数调整 | ❌ 心理扰动模拟 | anxiety → native_language_ratio 映射（已有） |

## 2. 当前系统已有/缺失的记忆层

### 现状

| 层级 | 应有功能 | 当前实际 | 差距 |
|------|---------|---------|------|
| L1 实时层 | 本轮逐题结果持久化 | 前端内存 results[] 数组，做完就丢 | learning_records 有但字段薄 |
| L2 短期层 | 最近N轮学习汇总 | **完全缺失** | 无聚合查询，Agent 无法读取近期表现 |
| L3 长期层 | 稳定画像 + 历史快照 | learners 表只有1行 current 值 | 覆盖写，无历史轨迹，无 snapshot |

### 现有表定位

| 表名 | 最接近 | 当前问题 |
|------|--------|---------|
| `learners` | L3（不完整） | 单行覆盖写，无快照，无历史 |
| `learning_records` | L1↔L2 之间 | 字段薄，practice_result 结构不标准 |
| `assessment_records` | 应为 L2 核心 | 结构尚可(before/after vector)，但未被任何 Agent 读取 |

## 3. 三级记忆定义

### L1 实时记忆（Real-Time Session Memory）

- **存什么**：本轮每道题对错、作答选项、耗时、维度、当前总正确率
- **何时写入**：每提交一道答案 → 前端内存更新；完成整轮 → 一次性持久化到 learning_records
- **谁读取**：学习页自身（渲染+统计）
- **服务决策**：即时反馈、结果页统计、传给 results API 的原始数据
- **生命周期**：当前页面会话

### L2 短期记忆（Short-Term Learning Window）

- **存什么**：每轮的 知识点ID、场景类型、正确率、各维度得分、vector变化量、anxiety变化量、高频错题模式
- **何时写入**：每轮 results API 成功保存时 INSERT assessment_records
- **谁读取**：A1 Agent（算趋势）、A4 Agent（调难度/维度权重）、首页（最近表现）
- **服务决策**：① 弱维度强化 ② 场景去重 ③ 对比深度调整
- **保留策略**：滚动窗口，最近 10-20 条

### L3 长期记忆（Long-Term Learner Profile）

- **存什么**：(a) current 行：最新画像值 (b) snapshot：关键节点的完整快照
- **何时写入**：(a) current：每轮 results API 成功后 UPDATE (b) snapshot：anxiety变化>±10 或 vector维度变化>±15 或每10轮或HSK升级
- **谁读取**：全部5个 Agent + 首页 + 研究分析
- **服务决策**：① 焦虑度→母语占比 ② HSK→整体难度 ③ vector→维度倾斜

## 4. 数据表结构

### 4.1 learners（L3 主行，已有，微调）

```sql
-- 已有字段保持不变，新增：
ALTER TABLE learners ADD COLUMN IF NOT EXISTS total_sessions INTEGER DEFAULT 0;
ALTER TABLE learners ADD COLUMN IF NOT EXISTS last_scene_id VARCHAR;
ALTER TABLE learners ADD COLUMN IF NOT EXISTS preferred_dimensions JSONB DEFAULT '[]';
```

### 4.2 learner_profile_snapshots（L3 历史，新增）

```sql
CREATE TABLE learner_profile_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID NOT NULL REFERENCES learners(id),
    snapshot_reason VARCHAR NOT NULL,  -- 'session_complete' | 'significant_change' | 'periodic' | 'level_up'
    cultural_anxiety_score NUMERIC,
    ability_vector JSONB,
    hsk_level INTEGER,
    native_language VARCHAR,
    sessions_completed_at_this_point INTEGER,
    rolling_accuracy_5 NUMERIC,
    weak_dimensions JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_snapshot_learner_time ON learner_profile_snapshots(learner_id, created_at DESC);
```

### 4.3 assessment_records（L2 核心，已有，增强）

```sql
-- 新增字段：
ALTER TABLE assessment_records ADD COLUMN IF NOT EXISTS scene_type VARCHAR;
ALTER TABLE assessment_records ADD COLUMN IF NOT EXISTS hsk_level_at_time INTEGER;
ALTER TABLE assessment_records ADD COLUMN IF NOT EXISTS dimension_scores JSONB DEFAULT '{}';
-- 格式: {"grammar": 80, "listening": 60, "speaking": 40, "cultural_pragmatic": 50, "reading": 70}
ALTER TABLE assessment_records ADD COLUMN IF NOT EXISTS error_patterns JSONB DEFAULT '[]';
-- 格式: [{"type": "confused_similar", "dimension": "grammar", "count": 2}]

CREATE INDEX IF NOT EXISTS idx_assessment_learner_time ON assessment_records(learner_id, created_at DESC);
```

### 4.4 learning_records（L1 持久化，已有，增强 practice_result 结构）

practice_result jsonb 标准化格式：
```json
{
  "exercises": [
    {"question_index": 0, "user_answer": "B", "correct_answer": "A", "is_correct": false, "dimension": "grammar", "time_spent_ms": 8500}
  ],
  "total_correct": 1,
  "total_count": 6,
  "score_percent": 17
}
```

## 5. 更新流程

### 用户开始学习
1. 前端 POST /api/learning
2. API 读 L3 learners.current → 得到 baseline 画像
3. API（未来）读 L2 assessment_records 最近5轮 → 得到近期趋势
4. 传入多智能体系统：A1 用 L3+L2 决定参数 → A4 用 L2 调整维度分布

### 用户学习过程中
1. 前端 validateAnswer() → results[] 数组（L1 内存）
2. 即时反馈渲染

### 用户完成练习
1. handleNext() → setShowResult(true)（立即显示结果页）
2. saveResults() fire-and-forget:
   - POST /api/learning/results
   - API 内部：
     a. 计算新 anxiety + 新 vector
     b. **INSERT assessment_records**（L2 写入）
     c. **UPDATE learners**（L3 current 更新）
     d. 判断阈值 → 可能 **INSERT snapshot**（L3 快照）
     e. SELECT 返回 updated_learner
   - 前端 setLearner(updated_learner) → Context 更新

### 下一轮内容生成
- 优先读 L3 current（baseline 总是需要的）
- 有 L2 数据时：A1 聚合趋势 → A4 按弱维度分配题目
- 无 L2 数据时（首轮）：退化为当前行为（均匀分布）

## 6. 为什么比"只存当前 learner"更合理

1. **单行覆盖丢失方向和速度**：anxiety 从 50→75，是缓慢爬升还是突然飙升？snapshot 记录轨迹
2. **没有短期层，内容生成失忆**：用户连续 3 轮语法错，第 4 轮仍均匀分布 5 维度。L2 让 A4 知道"该人多出语法题"
3. **实时层不持久化，异常中断丢数据**：浏览器崩溃 = 前 N 题结果全丢。L1 持久化支持"继续上次"

## 7. 实施路线图

### Phase 1：最小改造（1-2天）
- [ ] 修复 saveResults 浏览器到达率（ReferenceError 崩溃问题）
- [ ] 确认 assessment_records INSERT 生效
- [ ] 验证完整链路：做题 → DB 写入 → Context 更新 → 首页显示

### Phase 2：L2 接入 Agent（3-5天）
- [ ] assessment_records 加 scene_type/dimension_scores/error_patterns 字段
- [ ] results API 写入新字段
- [ ] 新增 getRecentLearningTrend() 查询函数
- [ ] A1 读取 L2 输出 weak_dimensions + accuracy_trend
- [ ] A4 根据 weak_dimensions 调整 prompt 维度分配
- [ ] learners 加 total_sessions / last_scene_id

### Phase 3：完整闭环（1-2周）
- [ ] 新建 learner_profile_snapshots 表 + 自动生成逻辑
- [ ] L1 practice_result 标准化
- [ ] 首页历史趋势面板
- [ ] 高频错误强化机制
- [ ] 动态难度调整
- [ ] 专家审核反哺
- [ ] 研究 分析 API
