/**
 * 研究调研脚本 - 搜索跨文化中文学习系统相关论文
 */
import { webSearch } from "./lib/search-client";

// 搜索查询
const queries = [
  {
    name: "跨文化中文学习系统",
    query: "cross-cultural Chinese language learning system AI LLM"
  },
  {
    name: "HSK汉语学习系统",
    query: "HSK Chinese learning system neural network intelligent tutoring"
  },
  {
    name: "LLM语言学习应用",
    query: "LLM large language model language learning education applications 2023 2024"
  },
  {
    name: "知识图谱教育系统",
    query: "knowledge graph education intelligent tutoring system evaluation"
  },
  {
    name: "多语言学习系统",
    query: "multilingual learning system personalized adaptive AI 2024"
  },
  {
    name: "文化意识语言学习",
    query: "cultural awareness language learning computational linguistics"
  },
  {
    name: "中文作为外语学习系统",
    query: "Chinese as foreign language learning technology NLP AI"
  },
  {
    name: "语言学习对话系统",
    query: "dialogue system language learning chatbot evaluation methodology"
  }
];

async function searchResearch(query: string, count: number = 10) {
  try {
    const response = await webSearch(query, count, true);
    return {
      summary: response.summary,
      items: response.web_items?.map(item => ({
        title: item.title,
        site: item.site_name,
        url: item.url,
        snippet: item.snippet,
        authority: item.auth_info_des
      })) || []
    };
  } catch (error) {
    console.error(`搜索失败: ${query}`, error);
    return { summary: "", items: [] };
  }
}

async function main() {
  console.log("=" .repeat(80));
  console.log("跨文化中文学习系统 - 相关研究调研报告");
  console.log("=" .repeat(80));
  console.log();

  const allResults: Record<string, any> = {};

  for (const { name, query } of queries) {
    console.log(`\n【${name}】`);
    console.log(`搜索词: ${query}`);
    console.log("-".repeat(60));

    const result = await searchResearch(query, 8);

    if (result.summary) {
      console.log(`\nAI摘要:\n${result.summary}`);
    }

    if (result.items.length > 0) {
      console.log(`\n相关文献 (${result.items.length} 条):`);
      result.items.forEach((item: any, i: number) => {
        console.log(`\n${i + 1}. ${item.title}`);
        console.log(`   来源: ${item.site || 'N/A'}`);
        console.log(`   权威性: ${item.authority || 'N/A'}`);
        console.log(`   摘要: ${item.snippet?.substring(0, 150)}...`);
        if (item.url) {
          console.log(`   链接: ${item.url}`);
        }
      });
    }

    allResults[name] = result;

    // 添加延迟避免请求过快
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log("\n" + "=".repeat(80));
  console.log("调研完成");
  console.log("=".repeat(80));

  return allResults;
}

main().catch(console.error);
