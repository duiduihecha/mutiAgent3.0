import { NextRequest, NextResponse } from 'next/server';

/**
 * 直接通过 HTTP 拉取 Coze 附件内容（替代已废弃的 coze-coding-dev-sdk FetchClient）。
 * best-effort 取文本：markdown/文本文件直接读；docx 等二进制取原始文本（可能不完整）。
 */
async function fetchDocContent(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const contentType = res.headers.get('content-type') || '';
  const raw = await res.text();
  return {
    title: decodeURIComponent(url.split('/').pop()?.split('?')[0] || url),
    content: raw,
    filetype: contentType || (url.endsWith('.md') ? 'text/markdown' : 'application/octet-stream'),
    url,
  };
}

// 研究文档URL列表
const RESEARCH_DOCS = [
  {
    id: 'doc1',
    name: '母语迁移的跨文化对比式中文学习系统：形式化模型与验证方法',
    url: 'https://coze-coding-project.tos.coze.site/create_attachment/2026-04-15/2992202428717888_a597d51995cfcbf0783847e0f50b9bdb_%E5%89%AF%E6%9C%AC%E6%AF%8D%E8%AF%AD%E9%A9%B1%E5%8A%A8%E7%9A%84%E8%B7%A8%E6%96%87%E5%8C%96%E5%AF%B9%E6%AF%94%E5%BC%8F%E4%B8%AD%E6%96%87%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%EF%BC%9A%E5%BD%A2%E5%BC%8F%E5%8C%96%E6%A8%A1%E5%9E%8B%E4%B8%8E%E9%AA%8C%E8%AF%81%E6%96%B9%E6%B3%95.docx?sign=4898290407-48b0028905-0-185d7ee9d7504d396dc987ccd00eb12bd9d5b8b37a45c6b1105a41141f2eb3d3'
  },
  {
    id: 'doc2',
    name: '母语迁移的跨文化对比式中文学习系统：研究项目标签、内容与多智能体技术路线（修订版v2026040304）',
    url: 'https://coze-coding-project.tos.coze.site/create_attachment/2026-04-15/2992202428717888_7bbfd620c860e9ee6d317dedabff7532_%E6%AF%8D%E8%AF%AD%E9%A9%B1%E5%8A%A8%E7%9A%84%E8%B7%A8%E6%96%87%E5%8C%96%E5%AF%B9%E6%AF%94%E5%BC%8F%E4%B8%AD%E6%96%87%E5%AD%A6%E4%B9%A0%E7%B3%BB%E7%BB%9F%EF%BC%9A%E7%A0%94%E7%A9%B6%E7%9B%AE%E6%A0%87%E3%80%81%E5%86%85%E5%AE%B9%E4%B8%8E%E5%A4%9A%E6%99%BA%E8%83%BD%E4%BD%93%E6%8A%80%E6%9C%AF%E8%B7%AF%E7%BA%BF%EF%BC%88%E4%BF%AE%E8%AE%A2%E7%89%88v2026040304%EF%BC%89.docx?sign=4898290407-962271da60-0-5aeec42dcc55d450b77d4d4e9a7d78148123c7e36a96610da81a1c19b6e5e9ae'
  },
  {
    id: 'doc3',
    name: '研究内容1：面向二语习得的中国文化分层母语化筛选体系构建',
    url: 'https://coze-coding-project.tos.coze.site/create_attachment/2026-04-15/2992202428717888_00da85ca9fa577824a3127b40bc2b6f4_%E7%A0%94%E7%A9%B6%E5%86%85%E5%AE%B91%EF%BC%9A%E9%9D%A2%E5%90%91%E4%BA%8C%E8%AF%AD%E4%B9%A0%E5%BE%97%E7%9A%84%E4%B8%AD%E5%9B%BD%E6%96%87%E5%8C%96%E5%88%86%E5%B1%82%E6%AF%8D%E8%AF%AD%E5%8C%96%E9%98%90%E9%87%8A%E4%BD%93%E7%B3%BB%E6%9E%84%E5%BB%BA.md?sign=4898290407-1a4bf9114e-0-c0d2cb8c35061ed0669d40a01f410849890a451c6843eb7b7a1eae6399f0ca29'
  },
  {
    id: 'doc4',
    name: '研究内容2：细粒度跨文化异同步能匹配体系构建',
    url: 'https://coze-coding-project.tos.coze.site/create_attachment/2026-04-15/2992202428717888_53b5a1fb0fce23e68d274c9ef085cf15_%E7%A0%94%E7%A9%B6%E5%86%85%E5%AE%B92%EF%BC%9A%E7%BB%86%E7%B2%92%E5%BA%A6%E8%B7%A8%E6%96%87%E5%8C%96%E5%BC%82%E5%90%8C%E6%99%BA%E8%83%BD%E5%8C%B9%E9%85%8D%E4%BD%93%E7%B3%BB%E6%9E%84%E5%BB%BA.md?sign=4898290407-075b8c1500-0-ce17cc65ba96c53eafd35350d00c47897b9ba754abea36d00b80e5885bfa4739'
  },
  {
    id: 'doc5',
    name: '研究内容3：文化驱动的场景化中文学习于应用体系构建',
    url: 'https://coze-coding-project.tos.coze.site/create_attachment/2026-04-15/2992202428717888_ad58e6713f0017e67b28aaa1a7fb930c_%E7%A0%94%E7%A9%B6%E5%86%85%E5%AE%B93%EF%BC%9A%E6%96%87%E5%8C%96%E9%A9%B1%E5%8A%A8%E7%9A%84%E5%9C%BA%E6%99%AF%E5%8C%96%E4%B8%AD%E6%96%87%E5%AD%A6%E4%B9%A0%E4%B8%8E%E5%BA%94%E7%94%A8%E4%BD%93%E7%B3%BB%E6%9E%84%E5%BB%BA.md?sign=4898290407-130229738c-0-da238656c14ac8a315077414105fee5f6b9675b3d312a94344446edce97768b4'
  },
  {
    id: 'doc6',
    name: '研究内容4：基于多智能体网状协商的系统框架与实现',
    url: 'https://coze-coding-project.tos.coze.site/create_attachment/2026-04-15/2992202428717888_84716e5c5c0110772a160f197be857da_%E7%A0%94%E7%A9%B6%E5%86%85%E5%AE%B94%EF%BC%9A%E5%9F%BA%E4%BA%8E%E5%A4%9A%E6%99%BA%E8%83%BD%E4%BD%93%E7%BD%91%E7%8A%B6%E5%8D%8F%E5%90%8C%E7%9A%84%E7%B3%BB%E7%BB%9F%E6%9E%B6%E6%9E%84%E4%B8%8E%E5%AE%9E%E7%8E%B0.md?sign=4898290407-da8e7065d0-0-d4ecfffd51dd72f5408c12c883438cbd92cde2d80e0b8201a75528fbe7ce1d96'
  }
];

export async function GET() {
  try {
    const results = [];
    
    // 逐个获取文档内容
    for (const doc of RESEARCH_DOCS) {
      try {
        const fetched = await fetchDocContent(doc.url);
        
        results.push({
          id: doc.id,
          name: doc.name,
          title: fetched.title || doc.name,
          content: fetched.content,
          url: doc.url,
          status: 'success',
          fileType: fetched.filetype
        });
      } catch (error) {
        results.push({
          id: doc.id,
          name: doc.name,
          url: doc.url,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      count: results.length,
      documents: results
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch documents' 
      },
      { status: 500 }
    );
  }
}

// 获取单个文档
export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json(
        { success: false, error: 'URL is required' },
        { status: 400 }
      );
    }
    
    const fetched = await fetchDocContent(url);
    
    return NextResponse.json({
      success: true,
      title: fetched.title,
      content: fetched.content,
      images: [],
      url: fetched.url,
      fileType: fetched.filetype
    });
  } catch (error) {
    console.error('Error fetching document:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch document' 
      },
      { status: 500 }
    );
  }
}
