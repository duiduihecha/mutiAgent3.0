/**
 * 本体优化迁移脚本 - 执行版本
 * 
 * ⚠️ 警告：此脚本会修改数据库，请先备份！
 */

import neo4j from 'neo4j-driver';

const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USERNAME = process.env.NEO4J_USERNAME;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;

if (!NEO4J_URI || !NEO4J_USERNAME || !NEO4J_PASSWORD) {
  throw new Error('[Neo4j] 缺少必要环境变量: NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD');
}

const driver = neo4j.driver(
  NEO4J_URI as string,
  neo4j.auth.basic(NEO4J_USERNAME as string, NEO4J_PASSWORD as string)
);

interface MigrationStep {
  name: string;
  description: string;
  execute: () => Promise<{ success: boolean; message: string }>;
}

const steps: MigrationStep[] = [];

// 颜色输出
const colors = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', reset: '\x1b[0m' };

function log(color: keyof typeof colors, prefix: string, msg: string) {
  console.log(`${colors[color]}[${prefix}]${colors.reset} ${msg}`);
}

async function migrate() {
  const session = driver.session();
  
  console.log('\n' + '='.repeat(70));
  console.log('🔄 开始执行本体优化迁移');
  console.log('='.repeat(70) + '\n');

  try {
    // ========== Step 1: 备份当前状态 ==========
    log('yellow', 'STEP 1', '记录当前数据状态...\n');
    
    const beforeStats = await session.run(`
      MATCH (n:CultureNode) WITH count(n) as cnt RETURN cnt as total
    `);
    const totalNodes = beforeStats.records[0].get('total').toNumber();
    log('blue', '  INFO', `当前 CultureNode 总数: ${totalNodes}`);
    
    const beforeRels = await session.run(`MATCH ()-[r]->() RETURN count(r) as cnt`);
    const totalRels = beforeRels.records[0].get('cnt').toNumber();
    log('blue', '  INFO', `当前关系总数: ${totalRels}`);
    
    // ========== Step 2: 修复数据质量问题 ==========
    log('yellow', '\nSTEP 2', '修复数据质量问题...\n');
    
    // 2.1 清理分类空格
    const cleanCats = await session.run(`
      MATCH (n:CultureNode)
      WHERE n.category CONTAINS ' ' OR n.category CONTAINS '　'
      WITH n, replace(replace(n.category, ' ', ''), '　', '') as cleaned
      SET n.category = cleaned
      RETURN count(n) as cnt
    `);
    log('green', '  ✅', `清理分类空格: ${cleanCats.records[0].get('cnt').toNumber()} 个节点`);
    
    // 2.2 统一HSK格式
    const fixHsk = await session.run(`
      MATCH (n:CultureNode)
      WHERE n.hsk_level IS NOT NULL
      SET n.hsk_level = CASE
        WHEN n.hsk_level = 'HSK 1' THEN 'HSK1'
        WHEN n.hsk_level = 'HSK1' THEN 'HSK1'
        WHEN n.hsk_level CONTAINS '1-2' THEN 'HSK1-2'
        WHEN n.hsk_level CONTAINS '3-4' THEN 'HSK3-4'
        WHEN n.hsk_level CONTAINS '5-6' THEN 'HSK5-6'
        WHEN n.hsk_level CONTAINS '5' OR n.hsk_level CONTAINS '6' THEN 'HSK5-6'
        WHEN n.hsk_level CONTAINS '3' THEN 'HSK3-4'
        WHEN n.hsk_level CONTAINS '2' THEN 'HSK1-2'
        ELSE n.hsk_level
      END
      RETURN count(n) as cnt
    `);
    log('green', '  ✅', `统一HSK格式: ${fixHsk.records[0].get('cnt').toNumber()} 个节点`);
    
    // ========== Step 3: 创建Level元节点 ==========
    log('yellow', '\nSTEP 3', '创建Level元节点（HSK等级）...\n');
    
    const createLevels = await session.run(`
      CREATE
        (l1:Level:HSKLevel {id: 'HSK1', name: 'HSK 1级', level_order: 1, 
         description: '入门级：掌握150个基础词汇和基本句型', 
         color: '#22c55e', vocab_limit: 150, grammar_level: '基础'}),
        (l2:Level:HSKLevel {id: 'HSK1-2', name: 'HSK 1-2级', level_order: 2, 
         description: '初级：掌握300个常用词汇，能进行简单日常对话', 
         color: '#3b82f6', vocab_limit: 300, grammar_level: '初级'}),
        (l3:Level:HSKLevel {id: 'HSK3-4', name: 'HSK 3-4级', level_order: 3, 
         description: '中级：掌握600个词汇，能讨论熟悉话题', 
         color: '#f59e0b', vocab_limit: 600, grammar_level: '中级'}),
        (l4:Level:HSKLevel {id: 'HSK5-6', name: 'HSK 5-6级', level_order: 4, 
         description: '中高级：掌握1200+词汇，较流利表达观点', 
         color: '#ef4444', vocab_limit: 1200, grammar_level: '高级'})
      RETURN 'Created 4 Level nodes' as result
    `);
    log('green', '  ✅', createLevels.records[0].get('result'));
    
    // 创建Level之间的递进关系
    const createLevelRels = await session.run(`
      MATCH (l1:Level {id: 'HSK1'}), (l2:Level {id: 'HSK1-2'})
      CREATE (l1)-[:PREREQUISITE_FOR {reason: '词汇量和语法递进', order: 1}]->(l2)
    `);
    await session.run(`
      MATCH (l2:Level {id: 'HSK1-2'}), (l3:Level {id: 'HSK3-4'})
      CREATE (l2)-[:PREREQUISITE_FOR {reason: '表达复杂度递进', order: 2}]->(l3)
    `);
    await session.run(`
      MATCH (l3:Level {id: 'HSK3-4'}), (l4:Level {id: 'HSK5-6'})
      CREATE (l3)-[:PREREQUISITE_FOR {reason: '话题深度递进', order: 3}]->(l4)
    `);
    log('green', '  ✅', '创建Level递进关系: 3条');
    
    // ========== Step 4: 创建Domain元节点 ==========
    log('yellow', '\nSTEP 4', '创建Domain元节点（文化领域）...\n');
    
    const createDomains = await session.run(`
      CREATE
        (d1:Domain:CultureDomain {id: 'social', name: '社交礼仪', order: 1, 
         keywords: ['问候', '称呼', '礼貌', '寒暄', '你好', '先生', '老师'],
         importance: 'high', icon: '👋'}),
        (d2:Domain:CultureDomain {id: 'food', name: '饮食文化', order: 2, 
         keywords: ['吃', '饭', '水', '菜', '饮食', '筷子', '餐桌'],
         importance: 'high', icon: '🍜'}),
        (d3:Domain:CultureDomain {id: 'festival', name: '节日习俗', order: 3, 
         keywords: ['春节', '中秋', '端午', '节日', '年', '节'],
         importance: 'medium', icon: '🎊'}),
        (d4:Domain:CultureDomain {id: 'school', name: '校园生活', order: 4, 
         keywords: ['学校', '学习', '同学', '老师', '课', '书'],
         importance: 'medium', icon: '📚'}),
        (d5:Domain:CultureDomain {id: 'tradition', name: '传统文化', order: 5, 
         keywords: ['长城', '历史', '艺术', '传说', '风俗', '传统'],
         importance: 'medium', icon: '🏯'}),
        (d6:Domain:CultureDomain {id: 'modern', name: '当代中国', order: 6, 
         keywords: ['现代', '科技', '城市', '中国', '交通'],
         importance: 'medium', icon: '🏙️'})
      RETURN 'Created 6 Domain nodes' as result
    `);
    log('green', '  ✅', createDomains.records[0].get('result'));
    
    // ========== Step 5: 关联CultureNode到Level ==========
    log('yellow', '\nSTEP 5', '关联CultureNode到Level...\n');
    
    const linkToLevel = await session.run(`
      MATCH (n:CultureNode), (l:Level)
      WHERE n.hsk_level = l.id
      MERGE (n)-[:BELONGS_TO_LEVEL]->(l)
      RETURN count(n) as cnt
    `);
    log('green', '  ✅', `关联到Level: ${linkToLevel.records[0].get('cnt').toNumber()} 个节点`);
    
    // ========== Step 6: 关联CultureNode到Domain ==========
    log('yellow', '\nSTEP 6', '关联CultureNode到Domain（基于关键词）...\n');
    
    const domains = [
      { id: 'social', keywords: ['问', '叫', '你好', '寒暄', '称呼', '先生', '老师', '你好', '打招呼', '礼貌', '朋友'] },
      { id: 'food', keywords: ['吃', '饭', '水', '菜', '饮食', '筷', '餐', '厨房', '厨房', '厨房'] },
      { id: 'festival', keywords: ['春', '节', '年', '中秋', '端午', '节', '假日', '除夕', '元宵', '清明'] },
      { id: 'school', keywords: ['学', '校', '课', '书', '班', '教室', '考试', '作业', '学生'] },
      { id: 'tradition', keywords: ['长城', '传统', '文化', '艺术', '传说', '历史', '古代', '神话'] },
      { id: 'modern', keywords: ['交通', '城市', '现代', '科技', '网络', '手机', '高铁'] }
    ];
    
    let totalDomainLinks = 0;
    for (const domain of domains) {
      for (const kw of domain.keywords) {
        const result = await session.run(`
          MATCH (n:CultureNode), (d:Domain {id: $domainId})
          WHERE n.name CONTAINS $kw OR n.topic CONTAINS $kw
          MERGE (n)-[:BELONGS_TO_DOMAIN]->(d)
          RETURN count(n) as cnt
        `, { domainId: domain.id, kw });
        totalDomainLinks += result.records[0].get('cnt').toNumber();
      }
    }
    log('green', '  ✅', `关联到Domain: ${totalDomainLinks} 条关系`);
    
    // ========== Step 7: 合并CrossCultureContrast ==========
    log('yellow', '\nSTEP 7', '合并CrossCultureContrast到CultureNode属性...\n');
    
    // 将对比信息合并到CultureNode
    const mergeContrasts = await session.run(`
      MATCH (c:CrossCultureContrast)-[r:HAS_CONTRAST]->(n:CultureNode)
      SET n.contrasts = coalesce(n.contrasts, []) + [{
        target_language: c.target_language,
        similarities: c.similarities,
        differences: c.differences,
        home_feature: c.home_feature,
        chinese_feature: c.chinese_feature,
        pragmatic_tips: c.pragmatic_tips,
        demographic_diff: c.demographic_diff
      }]
      RETURN count(DISTINCT n) as affected
    `);
    log('green', '  ✅', `合并对比到 ${mergeContrasts.records[0].get('affected').toNumber()} 个节点`);
    
    // 删除旧关系和节点
    const deleteOld = await session.run(`MATCH ()-[r:HAS_CONTRAST]->() DELETE r`);
    const deleteContrast = await session.run(`MATCH (c:CrossCultureContrast) DELETE c`);
    log('green', '  ✅', '删除旧的CrossCultureContrast节点和关系');
    
    // ========== Step 8: 建立知识点之间的关系 ==========
    log('yellow', '\nSTEP 8', '建立知识点之间的关系...\n');
    
    // 将SAME_GROUP改为双向关系
    const convertGroupRels = await session.run(`
      MATCH (a)-[r:SAME_GROUP]->(b)
      CREATE (b)-[:SAME_GROUP]->(a)
      RETURN count(r) as cnt
    `);
    log('green', '  ✅', `转换为双向SAME_GROUP关系: ${convertGroupRels.records[0].get('cnt').toNumber()} 条`);
    
    // ========== Step 9: 添加教学路径属性 ==========
    log('yellow', '\nSTEP 9', '添加教学路径属性...\n');
    
    const addPathProps = await session.run(`
      MATCH (n:CultureNode)
      WHERE n.hsk_level IS NOT NULL
      SET n.teaching_order = CASE n.hsk_level
        WHEN 'HSK1' THEN 1
        WHEN 'HSK1-2' THEN 2
        WHEN 'HSK3-4' THEN 3
        WHEN 'HSK5-6' THEN 4
        ELSE 5
      END,
      n.difficulty_tier = CASE n.hsk_level
        WHEN 'HSK1' THEN 'beginner'
        WHEN 'HSK1-2' THEN 'elementary'
        WHEN 'HSK3-4' THEN 'intermediate'
        WHEN 'HSK5-6' THEN 'upper'
        ELSE 'advanced'
      END
      RETURN count(n) as cnt
    `);
    log('green', '  ✅', `添加教学路径属性: ${addPathProps.records[0].get('cnt').toNumber()} 个节点`);
    
    // ========== 完成 ==========
    console.log('\n' + '='.repeat(70));
    console.log('✅ 迁移完成！');
    console.log('='.repeat(70));
    
    // 最终统计
    const afterNodes = await session.run(`MATCH (n) RETURN count(n) as cnt`);
    const afterRels = await session.run(`MATCH ()-[r]->() RETURN count(r) as cnt`);
    const levelCount = await session.run(`MATCH (l:Level) RETURN count(l) as cnt`);
    const domainCount = await session.run(`MATCH (d:Domain) RETURN count(d) as cnt`);
    
    console.log('\n📊 最终数据统计:');
    console.log('   总节点数:', afterNodes.records[0].get('cnt').toNumber());
    console.log('   总关系数:', afterRels.records[0].get('cnt').toNumber());
    console.log('   Level节点:', levelCount.records[0].get('cnt').toNumber());
    console.log('   Domain节点:', domainCount.records[0].get('cnt').toNumber());
    
    console.log('\n📈 迁移效果:');
    console.log('   • 分类统一: ✅');
    console.log('   • HSK格式: ✅');
    console.log('   • 层级结构: ✅ (Level + Domain)');
    console.log('   • 跨文化对比: ✅ (已合并为属性)');
    console.log('   • 学习路径: ✅');
    
  } catch (error) {
    console.error('迁移失败:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

migrate();
