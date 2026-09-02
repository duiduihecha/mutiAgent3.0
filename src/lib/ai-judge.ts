/**
 * AI 裁判模块 — 主裁判+按需校准裁判
 *
 * 设计原则：
 *   1. 裁判模型 ≠ 生成模型；候选条件对裁判匿名
 *   2. qwen3.8-max 是主裁判；glm-5.2 只用于校准子集或分歧复核
 *   3. 盲评：裁判不知道样本来自哪个实验条件
 *   4. 评分维度与人工评估完全一致（5维 × 1-5分 + Rubric）
 *
 * 用法：
 *   import { AIJudge } from './ai-judge';
 *   const judge = new AIJudge();
 *   const rating = await judge.rateSample(blindSample);
 */

import { UnifiedLLMService, type LLMMessage } from "./unified-llm-service";
import { HUMAN_EVAL_DIMENSIONS, type HumanEvalSample, type HumanRating } from "./evaluation-metrics";
import { getLLMConfig, type LLMConfig } from "./llm-config";
import { createHash } from "node:crypto";

// ============================================================================
// 裁判配置 — 来自 llm-config 预设
// ============================================================================

function buildJudgeConfigs(): Array<LLMConfig & { id: string }> {
  const judge = getLLMConfig('judge');
  const judge2 = getLLMConfig('judge2');
  return [
    { id: "judge_primary", ...judge },
    { id: "judge_secondary", ...judge2 },
  ];
}

/** Reproducible blind ordering. `swapOrder` supports an explicit order-effect check. */
export function orderBlindSamples(
  samples: HumanEvalSample[],
  seed: string,
  swapOrder = false,
): HumanEvalSample[] {
  const ordered = [...samples].sort((a, b) => {
    const ah = createHash("sha256").update(`${seed}:${a.blind_id}`).digest("hex");
    const bh = createHash("sha256").update(`${seed}:${b.blind_id}`).digest("hex");
    return ah.localeCompare(bh);
  });
  return swapOrder ? ordered.reverse() : ordered;
}

// ============================================================================
// 评分 Prompt 构建
// ============================================================================

function buildJudgeSystemPrompt(): string {
  const dimDescriptions = HUMAN_EVAL_DIMENSIONS.map(d => {
    const rubricLines = Object.entries(d.rubric)
      .map(([score, desc]) => `  ${score}分 = ${desc}`)
      .join("\n");
    return `### ${d.name}（${d.description}）\n${rubricLines}`;
  }).join("\n\n");

  return `<system_prompt>
你是一位国际中文教育（TCSL）领域的资深教学评估专家。你的任务是对AI生成的中文学习内容进行质量评分。

<evaluation_dimensions>
${dimDescriptions}
</evaluation_dimensions>

<important_rules>
1. 你必须对每个维度给出1-5的整数评分，不能跳过任何维度
2. 评分要严格参照Rubric，不能凭感觉
3. 不要因为内容是用非中文的语言解释的就降低评分（那是目标学习者的母语，理应如此）
4. 注意区分"内容本身有错"和"内容适合目标等级"——适合低等级学习者的简化内容不应被判为"不准确"
5. 忽略样本来自哪个系统/条件——你只需要根据内容本身评分
</important_rules>

<output_format>
你必须以严格的JSON格式输出，不得包含任何额外的问候、解释或Markdown标记：
{
  "scores": {
    "accuracy": <1-5>,
    "cultural_appropriateness": <1-5>,
    "pedagogical_effectiveness": <1-5>,
    "personalization": <1-5>,
    "overall_quality": <1-5>
  },
  "brief_justification": "<每个维度一句话解释为什么给这个分数，用中文>"
}
</output_format>
</system_prompt>`;
}

function buildJudgeUserMessage(sample: HumanEvalSample): string {
  const c = sample.content;
  const exercisesFormatted = c.exercises.map((ex, i) =>
    `[第${i + 1}题] 题型: ${ex.type}
     题目: ${ex.question}
     选项: ${(ex.options || []).join(" | ")}
     正确答案: ${ex.correct_answer}
     解释: ${ex.explanation || "无"}`
  ).join("\n\n");

  return `<evaluation_task>
请对以下AI生成的汉语学习内容进行5维质量评分。

<learner_context>
母语: ${sample.native_language}
HSK等级: ${sample.hsk_level}
</learner_context>

<generated_content>

<cultural_explanation>
${c.cultural_context_explanation || "（无文化阐释内容）"}
</cultural_explanation>

<cultural_comparison>
${c.comparison_summary || "（无跨文化对比内容）"}
</cultural_comparison>

<language_points>
${c.language_points.map(lp => `- ${lp.zh} → ${lp.translation}`).join("\n") || "（无语言点）"}
</language_points>

<exercises>
${exercisesFormatted}
</exercises>

</generated_content>

请严格按照评分维度和Rubric进行评分，输出JSON格式的评分结果。
</evaluation_task>`;
}

// ============================================================================
// AI 裁判类
// ============================================================================

export class AIJudge {
  private llm: UnifiedLLMService;

  constructor() {
    this.llm = new UnifiedLLMService("judge");
  }

  /**
   * 用一个裁判模型对单个样本评分
   */
  async rateSample(
    sample: HumanEvalSample,
    judgeConfig: LLMConfig & { id: string },
  ): Promise<HumanRating> {
    const systemPrompt = buildJudgeSystemPrompt();
    const userMessage = buildJudgeUserMessage(sample);

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];

    const startTime = Date.now();

    try {
      const response = await this.llm.chat(messages, {
        provider: judgeConfig.provider,
        model: judgeConfig.model,
        temperature: judgeConfig.temperature,
        response_format: { type: "json_object" },
      });

      const content = response.content || "{}";
      // 容错解析
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(content);
      } catch {
        // 尝试提取JSON
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      }

      const rawScores = (parsed.scores || parsed) as Record<string, unknown>;
      const scores: Record<string, number> = {};

      for (const dim of HUMAN_EVAL_DIMENSIONS) {
        const val = Number(rawScores[dim.id]);
        scores[dim.id] = (val >= 1 && val <= 5) ? val : 0;
      }

      console.log(
        `[AIJudge] ${judgeConfig.id} rated ${sample.blind_id} | ` +
        `accuracy=${scores.accuracy} cultural=${scores.cultural_appropriateness} ` +
        `pedagogical=${scores.pedagogical_effectiveness} ` +
        `personalization=${scores.personalization} overall=${scores.overall_quality} ` +
        `(${Date.now() - startTime}ms)`
      );

      return {
        rater_id: judgeConfig.id,
        sample_id: sample.blind_id,
        scores,
        notes: parsed.brief_justification as string,
        timestamp: Date.now(),
      };
    } catch (err) {
      console.error(`[AIJudge] ${judgeConfig.id} failed on ${sample.blind_id}:`, err);
      return {
        rater_id: judgeConfig.id,
        sample_id: sample.blind_id,
        scores: Object.fromEntries(HUMAN_EVAL_DIMENSIONS.map(d => [d.id, 0])),
        notes: `ERROR: ${(err as Error).message}`,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 用两个裁判模型对单个样本评分（顺序执行，避免并发限流）
   */
  async rateSampleWithTwoJudges(
    sample: HumanEvalSample,
    options: { includeSecondary?: boolean; swapOrder?: boolean } = {},
  ): Promise<HumanRating[]> {
    const ratings: HumanRating[] = [];
    const configs = buildJudgeConfigs();
    const selected = options.includeSecondary ? configs : configs.slice(0, 1);
    if (options.swapOrder) selected.reverse();
    for (const config of selected) {
      const rating = await this.rateSample(sample, config);
      ratings.push(rating);
      // 裁判间间隔 1s，避免限流
      await new Promise(r => setTimeout(r, 1000));
    }
    return ratings;
  }

  /**
   * 批量评分：默认仅主裁判；二级裁判必须由调用方显式限定到校准子集。
   *
   * @param samples 盲评样本列表
   * @param onProgress 每完成一个样本的回调
   * @returns 所有评分记录（样本数 × 2裁判）
   */
  async rateBatch(
    samples: HumanEvalSample[],
    onProgress?: (completed: number, total: number) => void,
    options: { includeSecondary?: boolean; orderSeed?: string; swapOrder?: boolean } = {},
  ): Promise<HumanRating[]> {
    const allRatings: HumanRating[] = [];
    const ordered = orderBlindSamples(samples, options.orderSeed || "judge-order-v1", options.swapOrder);
    const total = ordered.length;

    console.log(`[AIJudge] 开始盲评: ${total} 个样本 | secondary=${Boolean(options.includeSecondary)}`);

    for (let i = 0; i < ordered.length; i++) {
      const sample = ordered[i];
      console.log(`[AIJudge] [${i + 1}/${total}] ${sample.blind_id}`);
      const ratings = await this.rateSampleWithTwoJudges(sample, {
        includeSecondary: options.includeSecondary,
        swapOrder: options.swapOrder,
      });
      allRatings.push(...ratings);

      if (onProgress) onProgress(i + 1, total);

      // 每5个样本多歇1秒
      if ((i + 1) % 5 === 0) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    console.log(`[AIJudge] 评分完成: ${allRatings.length} 条记录`);
    return allRatings;
  }
}

// ============================================================================
// 单例
// ============================================================================

let _judge: AIJudge | null = null;

export function getAIJudge(): AIJudge {
  if (!_judge) _judge = new AIJudge();
  return _judge;
}
