/**
 * 专利侵权分析脚本
 */
import { webSearch } from "./lib/search-client";

async function searchPatent(query: string, count: number = 10) {
  try {
    const response = await webSearch(query, count, true);
    return {
      summary: response.summary,
      items: response.web_items?.map(item => ({
        title: item.title,
        site: item.site_name,
        url: item.url,
        snippet: item.snippet
      })) || []
    };
  } catch (error) {
    console.error(`搜索失败: ${query}`, error);
    return { summary: "", items: [] };
  }
}

async function main() {
  console.log("=" .repeat(80));
  console.log("专利侵权风险分析报告");
  console.log("=" .repeat(80));
  console.log();

  // 搜索目标专利详情
  console.log("\n【1. 目标专利详情】");
  console.log("-".repeat(60));
  const patentResult = await searchPatent("专利 202512006967 跨语言个性化汉语习得系统", 10);
  console.log(patentResult.summary || "无摘要");
  patentResult.items.forEach((item, i) => {
    console.log(`\n${i + 1}. ${item.title}`);
    console.log(`   来源: ${item.site}`);
    console.log(`   摘要: ${item.snippet?.substring(0, 200)}...`);
  });

  // 搜索相关专利
  console.log("\n\n【2. 相关专利搜索】");
  console.log("-".repeat(60));
  const relatedResult = await searchPatent("跨语言学习 汉语 大模型 专利 CN", 10);
  relatedResult.items.forEach((item, i) => {
    console.log(`\n${i + 1}. ${item.title}`);
    console.log(`   来源: ${item.site}`);
    console.log(`   摘要: ${item.snippet?.substring(0, 150)}...`);
  });

  // 搜索FTO分析方法
  console.log("\n\n【3. 专利侵权分析方法】");
  console.log("-".repeat(60));
  const ftoResult = await searchPatent("专利侵权分析 FTO自由实施 软件算法", 8);
  console.log(ftoResult.summary || "无摘要");

  // 搜索竞品专利
  console.log("\n\n【4. 竞品专利布局】");
  console.log("-".repeat(60));
  const competitorResult = await searchPatent("新东方 中文学习 专利 阿里 百度 教育AI", 8);
  competitorResult.items.forEach((item, i) => {
    console.log(`\n${i + 1}. ${item.title}`);
    console.log(`   来源: ${item.site}`);
  });

  console.log("\n" + "=".repeat(80));
  console.log("调研完成");
  console.log("=".repeat(80));
}

main().catch(console.error);
