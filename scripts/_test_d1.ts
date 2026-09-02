import nodejieba from "nodejieba";
import { neo4jService } from "../src/lib/neo4j-service";

async function main() {
  const testText = "在夜市点餐时，朋友说随便来点吧，你应该怎么回答？你喜欢吃辣的吗？我们点这几个菜吧。";

  // 1. Jieba 分词
  const tokens = nodejieba.cut(testText);
  console.log("Jieba分词:", tokens);

  // 2. 去停用词
  const STOP = new Set(['的','了','在','是','我','有','和','就','不','人','都','一','一个','上','也','很','到','说','要','去','你','会','着','没有','看','好','自己','这','他','她','它','们','那','什么','怎么','哪','吗','呢','啊','吧','呀','哦','嗯','可以','这个','那个','哪个','还是','或者','但是','因为','所以','如果','虽然','而且','然后','最后','已经','还','让','把','被','给','对','从','以','为','向','跟','与','及','等','之','其','所','者','而','于','则','且','但','或','并','中','点','来','吧','你','我','他','她','吗','呢','啊']);
  const meaningful = tokens.filter((t: string) => t.trim().length >= 2 && !STOP.has(t) && /[一-鿿]/.test(t));
  const unique = [...new Set(meaningful)];
  console.log("\n去停用词后:", unique);

  // 3. Neo4j 查词
  console.log("\nNeo4j HSK 词表查询:");
  let inLevel = 0; let overLevel = 0; let notFound = 0;
  for (const word of unique.slice(0, 20)) {
    try {
      const r = await neo4jService.query<{level: number}>(
        "MATCH (w:HSKWord {lemma: $word}) RETURN w.level AS level LIMIT 1", { word }
      );
      if (r.length > 0) {
        const lv = r[0].level;
        if (lv <= 5) { inLevel++; console.log(`  ✅ ${word} → HSK${lv} (在纲)`); }
        else { overLevel++; console.log(`  ⚠️ ${word} → HSK${lv} (超纲)`); }
      } else {
        notFound++; console.log(`  ❓ ${word} → 不在HSK词表`);
      }
    } catch { console.log(`  ❌ ${word} → Neo4j查询失败`); }
  }
  console.log(`\n在纲:${inLevel} 超纲:${overLevel} 不在表:${notFound} 合规率=${(inLevel/(inLevel+overLevel+notFound)*100).toFixed(0)}%`);

  await neo4jService.close();
}
main();
