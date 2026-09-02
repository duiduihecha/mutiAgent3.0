/**
 * 专利详细分析 - 获取权利要求书
 */
import { webSearch } from "./lib/search-client";

async function searchDetail(query: string, count: number = 10) {
  try {
    const response = await webSearch(query, count, true);
    return response.web_items?.map(item => ({
      title: item.title,
      site: item.site_name,
      url: item.url,
      snippet: item.snippet
    })) || [];
  } catch (error) {
    console.error(`搜索失败: ${query}`, error);
    return [];
  }
}

async function main() {
  console.log("=" .repeat(80));
  console.log("目标专利详细分析");
  console.log("=" .repeat(80));

  // 搜索专利权利要求
  console.log("\n【搜索专利权利要求书】");
  const claims = await searchDetail("CN202512006967 权利要求 跨语言汉语习得", 10);
  claims.forEach((item, i) => {
    console.log(`\n${i + 1}. ${item.title}`);
    console.log(`   来源: ${item.site}`);
    console.log(`   摘要: ${item.snippet?.substring(0, 300)}...`);
  });

  // 搜索专利说明书
  console.log("\n\n【搜索专利说明书】");
  const specs = await searchDetail("CN202512006967 说明书 技术方案", 10);
  specs.forEach((item, i) => {
    console.log(`\n${i + 1}. ${item.title}`);
    console.log(`   来源: ${item.site}`);
  });

  // 搜索侵权判断标准
  console.log("\n\n【搜索专利侵权判断标准】");
  const standards = await searchDetail("专利侵权等同原则 全面覆盖原则 判断标准", 8);
  standards.forEach((item, i) => {
    console.log(`\n${i + 1}. ${item.title}`);
    console.log(`   来源: ${item.site}`);
  });

  console.log("\n" + "=".repeat(80));
}

main().catch(console.error);
