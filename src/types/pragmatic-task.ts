// ============================================================================
// 三级语用任务类型定义 — Domain → Scene → Pragmatic Task
// 数据来源: GET /api/knowledge/graph?action=pragmatic_tree (Neo4j)
// ============================================================================

/** 与 Neo4j KnowledgePoint 节点的元数据字段对齐 */
export interface PragmaticTask {
  /** 知识点 ID，对应现有 API 的 knowledge_point_id */
  id: string;
  /** 交际任务名称（中文） */
  name: string;
  /** 交际意图说明 —— 引导 A2/A3 LLM 生成 */
  pragmatic_intent: string;
  /** 文化复杂度 (1-5)，1=浅层社交礼仪，5=深层文化价值观冲突 */
  cultural_complexity: number;
  /** 是否属于高语境交际 */
  high_context: boolean;
  /** 各母语圈的冲突点（Neo4j 中为 JSON 字符串，前端使用时需解析） */
  l1_conflict_points: Record<string, string> | string;
  /** HSK 等级要求 */
  hsk_level: number;
}

export interface Scene {
  /** 场景 ID，如 'ordering', 'treat' */
  id: string;
  /** 场景中文名 */
  name: string;
  /** 场景英文名 */
  name_en: string;
  /** 场景图标（emoji） */
  icon: string;
  /** 场景简述 */
  description: string;
  /** 包含的语用任务数量（来自 API） */
  task_count?: number;
  /** 包含的语用任务列表（懒加载，选择 Scene 后通过 scene_tasks API 获取） */
  tasks: PragmaticTask[];
}

export interface Domain {
  /** 领域 ID，如 'food', 'campus' */
  id: string;
  /** 领域中文名 */
  name: string;
  /** 领域英文名 */
  name_en: string;
  /** 领域图标 */
  icon: string;
  /** 领域简述 */
  description: string;
  /** 包含的场景列表（来自 API，不含 tasks，需懒加载） */
  scenes: Scene[];
}

/** API 返回的 Domain 摘要（不含 tasks） */
export interface DomainSummary {
  id: string;
  name: string;
  name_en: string;
  icon: string;
  description: string;
  scenes: SceneSummary[];
}

/** API 返回的 Scene 摘要（仅含 task_count，不含完整 tasks） */
export interface SceneSummary {
  id: string;
  name: string;
  name_en: string;
  icon: string;
  description: string;
  task_count: number;
}
