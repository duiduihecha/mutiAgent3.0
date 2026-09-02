
// src/lib/multi-agent/index.ts —— 命名空间内部 barrel（可选）
// 对外兼容入口仍是 src/lib/multi-agent-system.ts（方案一保留 2 周）

export * from './types';
export * from './errors';
export * from './utils';
export * from './algorithms';
export * from './a2-slots';
export * from './base-agent';
export * from './kp-semantics';
export * from './scene-mapper';
export * from './cache-io';
export * from './trend-io';
export * from './agents/learner-profiler.agent';
export * from './agents/mother-tongue-explainer.agent';
export * from './agents/cultural-comparator.agent';
export * from './agents/content-generator.agent';
export * from './agents/quality-controller.agent';
export * from './coordinator';
