# 母语驱动的跨文化对比式中文学习系统 - 项目设计文档

## 项目概述

这是一个基于**动态混合知识底座 + 多智能体网状协同**的智能中文学习系统，面向全球8大主流母语文化圈（英语、日语、韩语、西班牙语、阿拉伯语、俄语、法语、东南亚语系）的HSK1-9级留学生。

### 核心学习范式
```
母语阐释打底 → 跨文化异同精准匹配 → 场景化中文应用闭环
```

### 核心痛点解决
- 传统系统："文化与语言脱节、个性化不足、文化灌输式教学"
- 本系统方案："文化理解促进语言习得，语言应用深化文化认知"的双向赋能

---

## 一、系统架构设计

### 1.1 三层技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                      应用层 (Application Layer)              │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐    │
│  │  场景化学习 │  多模态口语 │  跨文化交际 │  双维度评估 │    │
│  │    平台    │    练习系统  │    模拟系统  │    系统    │    │
│  └─────────────┴─────────────┴─────────────┴─────────────┘    │
├─────────────────────────────────────────────────────────────┤
│                    多智能体协同层 (Multi-Agent Layer)         │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐    │
│  │ 学习者建模  │  母语阐释   │  文化对比   │  内容生成   │    │
│  │   Agent    │   Agent     │   Agent     │   Agent     │    │
│  └─────────────┴─────────────┴─────────────┴─────────────┘    │
│                        ↓                                      │
│               ┌───────────────┐                               │
│               │  质量管控Agent │                              │
│               └───────────────┘                               │
├─────────────────────────────────────────────────────────────┤
│                   动态混合知识底座 (Knowledge Base)           │
│  ┌─────────────┬─────────────┬─────────────┐                   │
│  │  核心知识图谱 │ 大模型知识库 │ 人类专家知识库│              │
│  │ (静态权威)   │ (RAG增强)    │ (争议校正)  │               │
│  └─────────────┴─────────────┴─────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 系统形式化定义

```
S = <K, A, ℒ, ℰ, ℱ, U>

其中：
- K: 动态混合知识底座
- A: 多智能体协同集合
- ℒ: 学习者集合
- ℰ: 学习场景集合
- ℱ: 评估函数集合
- U: 更新算子集合
```

---

## 二、数据库Schema设计

### 2.1 核心数据表

#### 2.1.1 学习者表 (learners)
```sql
CREATE TABLE learners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uid VARCHAR(50) UNIQUE NOT NULL,  -- 学习者唯一标识
    native_language VARCHAR(50) NOT NULL,  -- 母语文化圈
    hsk_level INTEGER CHECK (hsk_level BETWEEN 1 AND 9),  -- 当前HSK等级
    learning_style VARCHAR(20),  -- 视觉型/听觉型/动觉型
    learning_motivation VARCHAR(50),  -- 旅游/留学/工作/兴趣/考试
    cultural_anxiety_score DECIMAL(5,2) DEFAULT 50,  -- 文化焦虑度 0-100
    ability_vector JSONB,  -- 能力短板向量 [语法,听力,口语,文化语用,阅读]
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 2.1.2 文化知识点表 (cultural_knowledge_points)
```sql
CREATE TABLE cultural_knowledge_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hsk_level INTEGER NOT NULL,  -- 对应HSK等级
    layer INTEGER CHECK (layer BETWEEN 1 AND 3),  -- 层级 1-3
    language_binding_points TEXT[],  -- 绑定的语言点集合
    content_json JSONB NOT NULL,  -- 多语言内容
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 2.1.3 跨文化对比表 (cross_cultural_comparisons)
```sql
CREATE TABLE cross_cultural_comparisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_culture_id UUID REFERENCES cultural_knowledge_points(id),
    target_culture VARCHAR(50) NOT NULL,  -- 目标文化圈
    similarities JSONB,  -- 相同点集合
    differences JSONB,  -- 不同点集合
    pragmatic_hints JSONB,  -- 语言应用提示
    regional_variants TEXT[],  -- 地域/代际差异
    bias_score DECIMAL(3,2),  -- 偏见度评分
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 2.1.4 知识图谱节点表 (knowledge_graph_nodes)
```sql
CREATE TABLE knowledge_graph_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_type VARCHAR(20) NOT NULL,  -- culture/language/level/dimension/pragmatic/region
    node_id VARCHAR(100) NOT NULL,
    properties JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(node_type, node_id)
);
```

#### 2.1.5 知识图谱边表 (knowledge_graph_edges)
```sql
CREATE TABLE knowledge_graph_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_node_id UUID REFERENCES knowledge_graph_nodes(id),
    target_node_id UUID REFERENCES knowledge_graph_nodes(id),
    edge_type VARCHAR(30) NOT NULL,  -- correspond/contain/match/taboo/homology/difference
    properties JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 2.1.6 学习场景表 (learning_scenes)
```sql
CREATE TABLE learning_scenes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scene_type VARCHAR(50) NOT NULL,  -- 12类核心场景
    scene_subtype VARCHAR(100),
    hsk_level_range INTEGER[],  -- 适用的HSK等级范围
    cultural_background JSONB,  -- 文化背景说明
    language_points TEXT[],  -- 核心语言点
    cross_cultural_notes JSONB,  -- 跨文化注意事项
    scene_content JSONB,  -- 场景完整内容
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 2.1.7 学习记录表 (learning_records)
```sql
CREATE TABLE learning_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID REFERENCES learners(id),
    scene_id UUID REFERENCES learning_scenes(id),
    knowledge_point_id UUID REFERENCES cultural_knowledge_points(id),
    practice_result JSONB,  -- 练习结果
    comprehension_score DECIMAL(5,2),  -- 理解得分
    pragmatic_score DECIMAL(5,2),  -- 语用得分
    time_spent INTEGER,  -- 学习时长(秒)
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 2.1.8 评估记录表 (assessment_records)
```sql
CREATE TABLE assessment_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID REFERENCES learners(id),
    assessment_type VARCHAR(30),  -- language/cultural/pragmatic/comprehensive
    scores JSONB,  -- 各维度得分
    overall_score DECIMAL(5,2),  -- 综合得分
    pragmatic_error_rate DECIMAL(5,4),  -- 跨文化语用失误率
    assessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 2.1.9 多智能体消息表 (agent_messages)
```sql
CREATE TABLE agent_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(100) NOT NULL,
    sender_agent VARCHAR(50) NOT NULL,
    receiver_agent VARCHAR(50),
    learner_id UUID REFERENCES learners(id),
    message_type VARCHAR(30),  -- profile_update/content_request/comparison_result
    payload JSONB,
    status VARCHAR(20) DEFAULT 'pending',  -- pending/processing/passed/pending_review/rejected
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 三、知识库设计

### 3.1 知识库架构

```
动态混合知识底座 (K)
├── 核心知识图谱 (K_graph)
│   ├── 节点: V_culture, V_language, V_level, V_dimension, V_pragmatic, V_region
│   └── 边: E_correspond, E_contain, E_match, E_taboo, E_homology, E_difference
├── 大模型知识库 (K_llm)
│   └── RAG增强的长尾知识
└── 人类专家知识库 (K_expert)
    └── 争议内容与校正规则
```

### 3.2 知识库分类

#### 3.2.1 文化知识点 (3层级 × 8文化圈)
- **基础层 (HSK1-3)**: 日常语言直接绑定的文化常识
- **进阶层 (HSK4-6)**: 核心文化概念内涵与语用规则
- **高阶层 (HSK7-9)**: 哲学思想与社会背景

#### 3.2.2 跨文化对比数据 (12个核心维度)
- 时间观念
- 空间观念
- 集体主义vs个人主义
- 权力距离
- 不确定性规避
- 长期vs短期导向
- 面子与尊严
- 送礼文化
- 饮食文化
- 人际交往距离
- 称呼与礼仪
- 宗教信仰影响

---

## 四、多智能体架构设计

### 4.1 五大智能体定义

```typescript
Agent_i = <S_i, I_i, O_i, T_i, F_i>

- S_i: 智能体状态集合
- I_i: 输入消息集合
- O_i: 输出消息集合
- T_i: 状态转移函数 S_i × I_i → S_i
- F_i: 输出函数 S_i × I_i → O_i
```

### 4.2 智能体详细设计

#### 4.2.1 学习者建模智能体 (A1_LearnerProfiler)
```typescript
interface LearnerProfilerAgent {
    // 职责
    - 实时更新学习者画像
    - 计算文化焦虑度
    - 追踪能力短板向量
    - 管理贝叶斯知识追踪
    
    // 核心算法
    - 文化焦虑度计算: a = 0.4*e_c + 0.3*t_c_ratio + 0.2*f_c + 0.1*n_c
    - 贝叶斯知识追踪: P(L_t|E_t) = [P(E_t|L_t) * P(L_{t-1})] / ...
}
```

#### 4.2.2 母语阐释智能体 (A2_MotherTongueExplainer)
```typescript
interface MotherTongueExplainerAgent {
    // 职责
    - 生成多语言文化阐释
    - 动态调整母语占比
    - 适配不同文化圈认知习惯
    
    // 核心算法
    - 母语占比计算:
      r_m = {
        0.7 + 0.1*(80-a)/20, if a > 80 (高焦虑)
        0.4 + 0.2*(80-a)/40, if 40 ≤ a ≤ 80 (中焦虑)
        0.2 + 0.1*(80-a)/20, if a < 40 (低焦虑)
      }
}
```

#### 4.2.3 文化对比智能体 (A3_CulturalComparator)
```typescript
interface CulturalComparatorAgent {
    // 职责
    - 生成结构化跨文化对比
    - 识别文化异同点
    - 关联中文语用规则
    
    // 核心算法
    - 跨文化匹配: M(c,u) = α*M_exact + β*M_semantic + γ*M_filter
    - 偏见检测: B(x) = max(sim(x,k_b)) + max(sim(x,t_s))
}
```

#### 4.2.4 内容生成智能体 (A4_ContentGenerator)
```typescript
interface ContentGeneratorAgent {
    // 职责
    - 生成场景化学习内容
    - 创建多模态练习材料
    - 设计跨文化交际场景
    
    // 核心流程
    "文化背景(母语) → 核心语言点 → 跨文化对比 → 场景化练习"
}
```

#### 4.2.5 质量管控智能体 (A5_QualityController)
```typescript
interface QualityControllerAgent {
    // 职责
    - 审核生成内容
    - 检测偏见与刻板印象
    - 评估内容质量
    - 专家审核队列管理
    
    // 审核标准
    - 准确率 ≥ 98%
    - 偏见度 θ < 0.7
    - 无宗教/政治敏感内容
}
```

### 4.3 网状协同机制

```
事件触发流程:
e → A1(并行) → A2 ─┐
                  ├──→ A4 → A5 → 用户
      A3 ──────────┘
```

---

## 五、工作流编排设计

### 5.1 核心业务流程

#### 工作流1: 学习请求处理
```yaml
name: LearningRequestWorkflow
trigger: 用户发起学习请求
steps:
  - step: "接收学习请求"
    handler: gateway
  - step: "加载学习者画像"
    handler: A1_LearnerProfiler
  - step: "分析学习需求"
    handler: A1_LearnerProfiler
  - parallel:
      - step: "获取母语阐释"
        handler: A2_MotherTongueExplainer
      - step: "获取文化对比"
        handler: A3_CulturalComparator
  - step: "生成学习内容"
    handler: A4_ContentGenerator
  - step: "质量审核"
    handler: A5_QualityController
  - step: "推送学习内容"
    handler: gateway
```

#### 工作流2: 学习效果评估
```yaml
name: AssessmentWorkflow
trigger: 完成学习/定期评估
steps:
  - step: "收集学习数据"
    handler: A1_LearnerProfiler
  - step: "计算语言准确性得分"
    handler: evaluation_module
  - step: "计算文化理解度得分"
    handler: evaluation_module
  - step: "计算语用得体性得分"
    handler: evaluation_module
  - step: "综合评分"
    handler: evaluation_module
  - step: "更新学习者画像"
    handler: A1_LearnerProfiler
```

### 5.2 事件驱动架构

```
事件类型:
- LearnerProfileUpdate: 学习者画像更新
- KnowledgeBaseUpdate: 知识底座更新
- ContentGenerationRequest: 内容生成请求
- AssessmentTrigger: 评估触发
- ExpertReviewRequired: 专家审核请求
```

---

## 六、API设计

### 6.1 核心API端点

#### 学习者管理
- `POST /api/learners` - 创建学习者
- `GET /api/learners/{id}` - 获取学习者信息
- `PUT /api/learners/{id}` - 更新学习者画像
- `GET /api/learners/{id}/profile` - 获取完整画像

#### 学习内容
- `POST /api/learning/start` - 开始学习
- `GET /api/learning/scenes` - 获取场景列表
- `GET /api/learning/scenes/{id}` - 获取场景详情
- `POST /api/learning/practice` - 提交练习

#### 文化对比
- `GET /api/culture/compare` - 获取文化对比
- `POST /api/culture/explain` - 获取文化阐释

#### 评估
- `POST /api/assessment/start` - 开始评估
- `GET /api/assessment/{id}/result` - 获取评估结果

---

## 七、技术实现路线

### 阶段一：基础架构搭建 (1-2周)
- [ ] 项目初始化与配置
- [ ] 数据库Schema设计与迁移
- [ ] 基础API框架搭建
- [ ] 知识库基础架构

### 阶段二：核心功能开发 (3-4周)
- [ ] 学习者建模功能
- [ ] 母语阐释功能
- [ ] 文化对比功能
- [ ] 基础内容生成

### 阶段三：智能体系统 (5-6周)
- [ ] 多智能体框架搭建
- [ ] 网状协同机制实现
- [ ] 质量管控流程

### 阶段四：场景与评估 (7-8周)
- [ ] 场景化学习平台
- [ ] 多模态练习系统
- [ ] 双维度评估系统

### 阶段五：集成与优化 (9-10周)
- [ ] 系统集成测试
- [ ] 性能优化
- [ ] 用户体验完善
