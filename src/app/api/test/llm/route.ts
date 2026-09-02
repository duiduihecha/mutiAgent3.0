/**
 * LLM测试API
 * POST /api/test/llm - 测试LLM输出
 */

import { NextRequest, NextResponse } from 'next/server';
import { UnifiedLLMService } from '@/lib/unified-llm-service';
import type { LLMPreset } from '@/lib/llm-config';
import { getModelRoutingSnapshot } from '@/lib/llm-config';

const VALID_PRESETS = ['mock', 'generation', 'judge', 'judge2', 'guardrail_backtranslation',
  'guardrail_binary', 'guardrail_solver', 'guardrail_final'] as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      preset = 'mock', // 显式角色路由；调试端默认离线 mock
      messages,        // 对话消息
      temperature,
      max_tokens
    } = body;

    // 构建消息
    const chatMessages = messages || [
      { role: 'user', content: '请用一句话介绍一下中国的春节。' }
    ];

    if (!VALID_PRESETS.includes(preset)) {
      return NextResponse.json({
        success: false,
        error: `无效的 preset: "${preset}"`,
        valid_presets: VALID_PRESETS,
      }, { status: 400 });
    }

    console.log(`[LLM Test] Using preset: ${preset}`);
    const service = new UnifiedLLMService(preset as LLMPreset);
    const result = await service.chat(chatMessages, {
      preset: preset as LLMPreset,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 2048,
    });

    return NextResponse.json({
      success: true,
      preset,
      response: result.content,
      usage: result.usage,
    });
  } catch (error) {
    console.error('[LLM Test] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined,
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    available_presets: VALID_PRESETS,
    model_routing: getModelRoutingSnapshot(),
    current_config: {
      real_calls_enabled: process.env.LLM_REAL_CALLS_ENABLED === 'true',
      node_env: process.env.NODE_ENV,
    }
  });
}
