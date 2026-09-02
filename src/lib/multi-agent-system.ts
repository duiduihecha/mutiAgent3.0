// ==============================================================
// 兼容 barrel —— 11 处外部 import 的老路径一行不改即可运行
// src/lib/multi-agent-system.ts 已按方案一横向拆分到子目录 multi-agent/。
// 如果 2 周内 ts-check 全绿、无回归，可择期：
//   1) 批量把 '@/lib/multi-agent-system' 引用迁到子模块
//   2) 删除本兼容 barrel
// ==============================================================

export * from './multi-agent/types';
export * from './multi-agent/errors';
export * from './multi-agent/utils';
export * from './multi-agent/algorithms';
export * from './multi-agent/a2-slots';
export * from './multi-agent/base-agent';
export * from './multi-agent/kp-semantics';
export * from './multi-agent/scene-mapper';
export * from './multi-agent/cache-io';
export * from './multi-agent/trend-io';
export * from './multi-agent/agents/learner-profiler.agent';
export * from './multi-agent/agents/mother-tongue-explainer.agent';
export * from './multi-agent/agents/cultural-comparator.agent';
export * from './multi-agent/agents/content-generator.agent';
export * from './multi-agent/agents/quality-controller.agent';
export * from './multi-agent/coordinator';
