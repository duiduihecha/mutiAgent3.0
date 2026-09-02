/**
 * 多语言阐释管理API
 * POST /api/explanations/generate - 触发生成(流式SSE)
 * GET /api/explanations/stats - 获取统计
 * GET /api/explanations/[kp_id] - 获取知识点所有语言阐释
 */

import { NextRequest, NextResponse } from 'next/server';
import { multiLanguageService, SUPPORTED_LANGUAGES } from '@/lib/multi-language-explanation-service';

// ==================== 生成接口 (SSE流式输出) ====================

export async function POST(_request: NextRequest) {
  try {
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: string) => {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        };

        try {
          // 发送开始事件
          sendEvent(JSON.stringify({ 
            type: 'start', 
            message: `开始生成多语言阐释... 共 ${SUPPORTED_LANGUAGES.length} 种语言` 
          }));

          // 使用流式生成
          const generator = multiLanguageService.generateExplanationsStream();
          
          for await (const event of generator) {
            sendEvent(JSON.stringify(event));
            
            // 如果是完成或错误，退出循环
            if (event.type === 'complete' || event.type === 'error') {
              break;
            }
          }

          // 发送完成事件
          sendEvent(JSON.stringify({ type: 'end', message: '生成完成' }));
        } catch (error) {
          sendEvent(JSON.stringify({ 
            type: 'error', 
            message: `生成失败: ${error instanceof Error ? error.message : 'Unknown error'}` 
          }));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: `启动生成失败: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// ==================== 统计接口 ====================

export async function GET() {
  try {
    const stats = await multiLanguageService.getExplanationStats();
    
    // 计算覆盖率
    const totalKps = stats.total_knowledge_points;
    const totalLanguages = SUPPORTED_LANGUAGES.length;
    const coverage = totalKps > 0 ? Math.round((stats.total_explanations / (totalKps * totalLanguages)) * 100) : 0;

    return NextResponse.json({
      success: true,
      data: {
        ...stats,
        coverage,
        supported_languages: SUPPORTED_LANGUAGES.map(l => ({
          code: l.code,
          name: l.name,
          native_name: l.native_name,
          count: stats.by_language[l.code] || 0,
        })),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: `获取统计失败: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
