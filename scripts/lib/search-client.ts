/**
 * 本地 Web 搜索客户端
 * 替代已废弃的 coze-coding-dev-sdk SearchClient.webSearch。
 * 使用 DuckDuckGo HTML 接口做 best-effort 搜索；外部不可达时优雅返回空结果。
 */

export interface WebSearchItem {
  title: string;
  site_name: string;
  url: string;
  snippet: string;
  auth_info_des?: string;
}

export interface WebSearchResponse {
  summary: string;
  web_items: WebSearchItem[];
}

export async function webSearch(
  query: string,
  count: number = 10,
  withSummary: boolean = true
): Promise<WebSearchResponse> {
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research-bot/1.0)' } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const items: WebSearchItem[] = [];
    // DuckDuckGo HTML 结果块：标题在 .result__a，摘要在 .result__snippet
    const resultRegex =
      /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = resultRegex.exec(html)) !== null && items.length < count) {
      const rawHref = m[1];
      const title = stripHtml(m[2]);
      const snippet = stripHtml(m[3]);
      // DDG 通过 /l/?uddg= 重定向，需解码
      const decoded = rawHref.startsWith('/l/?uddg=')
        ? decodeURIComponent(rawHref.slice('/l/?uddg='.length))
        : rawHref;
      try {
        const u = new URL(decoded);
        items.push({
          title,
          site_name: u.hostname,
          url: decoded,
          snippet,
          auth_info_des: ''
        });
      } catch {
        // 跳过非法 URL
      }
    }

    return {
      summary: withSummary
        ? `找到 ${items.length} 条与"${query}"相关的结果（来源：DuckDuckGo）。`
        : '',
      web_items: items
    };
  } catch (error) {
    console.error('[webSearch] 搜索失败:', error);
    return { summary: '', web_items: [] };
  }
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
