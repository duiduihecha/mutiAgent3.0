/**
 * 跨文化对比节点生成脚本
 * 对文化节点进行聚类，为每个聚类生成跨文化对比节点
 */

import neo4j, { Driver } from 'neo4j-driver';

const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USERNAME = process.env.NEO4J_USERNAME;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;

if (!NEO4J_URI || !NEO4J_USERNAME || !NEO4J_PASSWORD) {
  throw new Error('[Neo4j] 缺少必要环境变量: NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD');
}

const _NEO4J_URI: string = NEO4J_URI;
const _NEO4J_USERNAME: string = NEO4J_USERNAME;
const _NEO4J_PASSWORD: string = NEO4J_PASSWORD;

interface CultureNode {
  id: string;
  topic: string;
  hsk_level: string | null;
  category: string | null;
  hierarchy: string | null;
  name: string | null;
}

interface Cluster {
  name: string;
  theme: string;
  nodes: CultureNode[];
  hsk_level: string;
  category: string;
}

async function main() {
  console.log('🔌 连接 Neo4j...');
  const driver: Driver = neo4j.driver(
    _NEO4J_URI,
    neo4j.auth.basic(_NEO4J_USERNAME, _NEO4J_PASSWORD)
  );
  const session = driver.session();

  try {
    // 1. 获取所有文化节点
    console.log('📊 获取所有文化节点...');
    const nodesResult = await session.run(`
      MATCH (n:CultureNode)
      RETURN n.id as id, n.topic as topic, n.hsk_level as hsk_level, 
             n.category as category, n.hierarchy as hierarchy, n.name as name
    `);

    const nodes: CultureNode[] = nodesResult.records.map(r => ({
      id: r.get('id'),
      topic: r.get('topic'),
      hsk_level: r.get('hsk_level'),
      category: r.get('category'),
      hierarchy: r.get('hierarchy'),
      name: r.get('name')
    }));

    console.log(`✅ 获取到 ${nodes.length} 个文化节点`);

    // 2. 基于 topic 关键词进行聚类
    console.log('🔍 基于主题关键词进行聚类...');
    const clusters = clusterByTheme(nodes);
    console.log(`✅ 生成 ${clusters.length} 个聚类`);

    // 3. 为每个聚类创建跨文化对比节点
    console.log('🎯 创建跨文化对比节点...');
    let contrastCount = 0;

    for (const cluster of clusters) {
      if (cluster.nodes.length < 2) continue; // 跳过单个节点

      const contrastNodeId = `contrast_${cluster.name.replace(/[\/\s]/g, '_')}`;
      
      // 检查是否已存在
      const existing = await session.run(`
        MATCH (c:CrossCultureContrast {id: $id})
        RETURN c.id as id
      `, { id: contrastNodeId });

      if (existing.records.length > 0) {
        console.log(`  ⏭️  跳过已存在的: ${contrastNodeId}`);
        continue;
      }

      // 创建跨文化对比节点
      await session.run(`
        CREATE (c:CrossCultureContrast {
          id: $id,
          name: $name,
          theme: $theme,
          hsk_level: $hsk_level,
          category: $category,
          node_count: $nodeCount,
          description: $description,
          created_at: datetime()
        })
      `, {
        id: contrastNodeId,
        name: cluster.name,
        theme: cluster.theme,
        hsk_level: cluster.hsk_level || 'Mixed',
        category: cluster.category || 'Mixed',
        nodeCount: cluster.nodes.length,
        description: `${cluster.theme}相关的跨文化对比，包含 ${cluster.nodes.length} 个文化知识点`
      });

      // 连接聚类中的所有节点
      for (const node of cluster.nodes) {
        await session.run(`
          MATCH (c:CultureNode {id: $nodeId})
          MATCH (p:CrossCultureContrast {id: $contrastId})
          MERGE (c)-[:BELONGS_TO_CONTRAST]->(p)
        `, { nodeId: node.id, contrastId: contrastNodeId });
      }

      contrastCount++;
      console.log(`  ✅ 创建: ${contrastNodeId} (${cluster.nodes.length} 个节点)`);
    }

    console.log(`\n🎉 完成! 共创建 ${contrastCount} 个跨文化对比节点`);

    // 4. 统计结果
    const stats = await session.run(`
      MATCH (c:CrossCultureContrast)
      RETURN c.name as name, c.theme as theme, c.node_count as count
      ORDER BY count DESC
      LIMIT 20
    `);

    console.log('\n📋 跨文化对比节点列表 (Top 20):');
    stats.records.forEach(r => {
      console.log(`  - ${r.get('name')}: ${r.get('count')} 个知识点`);
    });

  } finally {
    await session.close();
    await driver.close();
  }
}

/**
 * 基于主题关键词对节点进行聚类
 */
function clusterByTheme(nodes: CultureNode[]): Cluster[] {
  // 定义主题关键词映射
  const themeKeywords: Record<string, string[]> = {
    '问候寒暄': ['问候', '你好', '寒暄', '打招呼', '介绍', '认识', '称呼', 'Hello', 'Hi', 'Greeting'],
    '饮食文化': ['吃', '饮食', '食物', '餐厅', '筷子', '吃饭', 'food', 'eat', 'rice', 'meal'],
    '交通出行': ['交通', '地铁', '公交', '出租车', '开车', '旅行', 'transport', 'taxi', 'bus', 'subway'],
    '购物消费': ['买', '购物', '商店', '超市', '价格', '钱', 'buy', 'shop', 'store', 'money'],
    '节日庆祝': ['春节', '中秋', '端午', '节日', '庆祝', '过年', 'festival', 'holiday', 'celebrate'],
    '校园学习': ['学校', '学习', '同学', '老师', '课', '考试', 'school', 'study', 'class', 'student'],
    '社交人际': ['朋友', '家', '家庭', '聚会', 'friend', 'family', 'party', 'visit'],
    '日常生活': ['生活', '习惯', '时间', '天气', 'life', 'daily', 'time', 'weather'],
    '传统习俗': ['传统', '习俗', '风俗', '礼仪', 'tradition', 'custom', 'ritual'],
    '现代中国': ['现代', '科技', '城市', '中国', 'modern', 'technology', 'city', 'China'],
    '健康医疗': ['医院', '医生', '健康', '看病', 'hospital', 'doctor', 'health', 'medicine'],
    '娱乐休闲': ['电影', '音乐', '运动', '娱乐', 'movie', 'music', 'sport', 'game'],
    '职业工作': ['工作', '上班', '公司', '面试', 'work', 'job', 'office', 'career'],
    '住宿居住': ['房子', '租', '住', '公寓', 'home', 'apartment', 'rent', 'live'],
    '数字时间': ['数字', '时间', '日期', '电话', 'number', 'time', 'date', 'phone'],
    '颜色物品': ['颜色', '衣服', '颜色', '物品', 'color', 'clothes', 'cloth', 'item'],
  };

  const clusters: Cluster[] = [];
  const usedNodes = new Set<string>();

  // 按主题聚类
  for (const [themeName, keywords] of Object.entries(themeKeywords)) {
    const matchedNodes = nodes.filter(n => {
      if (usedNodes.has(n.id)) return false;
      const text = `${n.topic || ''} ${n.name || ''}`.toLowerCase();
      return keywords.some(kw => text.includes(kw.toLowerCase()));
    });

    if (matchedNodes.length >= 2) {
      // 获取主要 HSK 等级
      const levelCounts: Record<string, number> = {};
      matchedNodes.forEach(n => {
        const level = n.hsk_level || '未知';
        levelCounts[level] = (levelCounts[level] || 0) + 1;
      });
      const mainLevel = Object.entries(levelCounts).sort((a, b) => b[1] - a[1])[0][0];

      // 获取主要分类
      const categoryCounts: Record<string, number> = {};
      matchedNodes.forEach(n => {
        const cat = n.category || '未分类';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      });
      const mainCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0][0];

      clusters.push({
        name: themeName,
        theme: themeName,
        nodes: matchedNodes,
        hsk_level: mainLevel,
        category: mainCategory
      });

      matchedNodes.forEach(n => usedNodes.add(n.id));
    }
  }

  // 对未分类的节点按 HSK 等级和分类分组
  const unclassifiedNodes = nodes.filter(n => !usedNodes.has(n.id));
  console.log(`  未分类节点: ${unclassifiedNodes.length} 个`);

  // 按 HSK 等级分组
  const byLevel: Record<string, CultureNode[]> = {};
  unclassifiedNodes.forEach(n => {
    const level = n.hsk_level || '未知';
    if (!byLevel[level]) byLevel[level] = [];
    byLevel[level].push(n);
  });

  for (const [level, levelNodes] of Object.entries(byLevel)) {
    if (levelNodes.length >= 3) {
      // 按分类细分
      const byCategory: Record<string, CultureNode[]> = {};
      levelNodes.forEach(n => {
        const cat = n.category || '未分类';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(n);
      });

      for (const [cat, catNodes] of Object.entries(byCategory)) {
        if (catNodes.length >= 2) {
          clusters.push({
            name: `${level}_${cat}`,
            theme: `${level} - ${cat}`,
            nodes: catNodes,
            hsk_level: level,
            category: cat
          });
          catNodes.forEach(n => usedNodes.add(n.id));
        }
      }
    }
  }

  // 剩余节点按主题分组（基于 topic 的前几个字）
  const remainingNodes = nodes.filter(n => !usedNodes.has(n.id));
  console.log(`  剩余未聚类节点: ${remainingNodes.length} 个`);

  if (remainingNodes.length >= 3) {
    clusters.push({
      name: '其他话题',
      theme: '其他话题',
      nodes: remainingNodes,
      hsk_level: 'Mixed',
      category: 'Mixed'
    });
  }

  return clusters;
}

main().catch(console.error);
