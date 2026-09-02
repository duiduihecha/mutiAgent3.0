// ============================================================================
// Neo4j 三级语用任务图谱种子脚本
// Domain → Scene → Knowledge Point (Pragmatic Task)
//
// 执行方式（任选其一）：
//   1. Neo4j Browser: 直接粘贴运行
//   2. cypher-shell:  cat neo4j_seed_pragmatic_tasks.cypher | cypher-shell -u neo4j -p <password>
//   3. Python driver:
//      from neo4j import GraphDatabase
//      driver = GraphDatabase.driver("bolt://localhost:7687", auth=("neo4j", "password"))
//      with driver.session() as session:
//          session.run(open("neo4j_seed_pragmatic_tasks.cypher").read())
//
// 约束：后端 Agent 编排逻辑和 POST /api/learning 路由原封不动。
//       Knowledge Point 节点中的 id 字段即现有的 knowledge_point_id，
//       前端 UI 将该 id 直接传给现有 API。
// ============================================================================

// ----------------------------------------------------------------------------
// 索引与约束 — 确保幂等性
// ----------------------------------------------------------------------------
CREATE CONSTRAINT domain_id_unique IF NOT EXISTS
FOR (d:Domain) REQUIRE d.id IS UNIQUE;

CREATE CONSTRAINT scene_id_unique IF NOT EXISTS
FOR (s:Scene) REQUIRE s.id IS UNIQUE;

CREATE CONSTRAINT kp_id_unique IF NOT EXISTS
FOR (kp:KnowledgePoint) REQUIRE kp.id IS UNIQUE;

// ----------------------------------------------------------------------------
// Domain: 餐饮美食
// ----------------------------------------------------------------------------
MERGE (d_food:Domain {id: 'food'})
SET d_food.name         = '餐饮美食',
    d_food.name_en      = 'Food & Dining',
    d_food.icon         = '🍜',
    d_food.description  = '点餐、买单、请客、餐桌礼仪',
    d_food.updated_at   = datetime();

// ----------------------------------------------------------------------------
// Scene: 点餐 (ordering)
// ----------------------------------------------------------------------------
MERGE (s_order:Scene {id: 'ordering'})
SET s_order.name        = '点餐',
    s_order.name_en     = 'Ordering',
    s_order.icon        = '📋',
    s_order.description = '在餐厅点菜、询问菜品、表达口味偏好',
    s_order.updated_at  = datetime();

MERGE (d_food)-[:HAS_SCENE]->(s_order);

// --- KP 1: 基础点菜 ---
MERGE (kp_food_order_basic:KnowledgePoint {id: 'food_ordering_basic'})
SET kp_food_order_basic.name              = '基础点菜',
    kp_food_order_basic.pragmatic_intent  = '在中文餐厅中独立完成点菜，表达口味偏好并询问推荐',
    kp_food_order_basic.cultural_complexity = 1,
    kp_food_order_basic.high_context      = false,
    kp_food_order_basic.hsk_level         = 1,
    kp_food_order_basic.l1_conflict_points = '{"en":"英语圈习惯逐道点菜（starter→main→dessert），而中文餐厅为合餐制共享点菜","ja":"日语圈也使用合餐制，但点菜时常使用敬语，おまかせ与\"随便\"的文化差异显著","ko":"韩语圈的点餐礼仪与中文类似（合餐），但반찬（小菜）文化与中国凉菜文化不同"}',
    kp_food_order_basic.updated_at        = datetime();

MERGE (s_order)-[:HAS_KNOWLEDGE_POINT]->(kp_food_order_basic);

// --- KP 2: 特殊饮食需求 ---
MERGE (kp_food_order_special:KnowledgePoint {id: 'food_ordering_special'})
SET kp_food_order_special.name              = '特殊饮食需求',
    kp_food_order_special.pragmatic_intent  = '表达忌口、过敏、素食等特殊饮食需求，理解服务员对需求的处理方式',
    kp_food_order_special.cultural_complexity = 2,
    kp_food_order_special.high_context      = false,
    kp_food_order_special.hsk_level         = 2,
    kp_food_order_special.l1_conflict_points = '{"en":"英语圈直接声明过敏原（I am allergic to...），中文语境下需委婉表达以避免\"麻烦别人\"","ar":"阿拉伯语圈清真饮食需求与中国清真餐饮体系可直接对应，但需注意地域差异"}',
    kp_food_order_special.updated_at        = datetime();

MERGE (s_order)-[:HAS_KNOWLEDGE_POINT]->(kp_food_order_special);

// ----------------------------------------------------------------------------
// Scene: 请客 (treat)
// ----------------------------------------------------------------------------
MERGE (s_treat:Scene {id: 'treat'})
SET s_treat.name        = '请客',
    s_treat.name_en     = 'Treating / Hosting',
    s_treat.icon        = '🎉',
    s_treat.description = '请客吃饭、抢单、礼尚往来',
    s_treat.updated_at  = datetime();

MERGE (d_food)-[:HAS_SCENE]->(s_treat);

// --- KP 3: 主动买单 ---
MERGE (kp_food_treat_pay:KnowledgePoint {id: 'food_treat_pay'})
SET kp_food_treat_pay.name              = '主动买单',
    kp_food_treat_pay.pragmatic_intent  = '理解中国"抢单"文化的交际逻辑——买单不仅是付钱，更是人情关系的维系与宣告',
    kp_food_treat_pay.cultural_complexity = 4,
    kp_food_treat_pay.high_context      = true,
    kp_food_treat_pay.hsk_level         = 3,
    kp_food_treat_pay.l1_conflict_points = '{"en":"英语圈习惯AA制（go Dutch），\"我请你\"是明确的邀请而非社交博弈","ja":"日语圈有\"割り勘\"（AA）也有\"おごり\"（请客），但抢单的肢体动作（推拉）不如中文文化激烈","ko":"韩语圈\"한턱내다\"（请客）文化深厚，长辈/上级默认买单，与中文抢单文化相近但有年龄等级差异","es":"西班牙语圈\"invitar\"（邀请）通常意味着邀请者买单，不流行抢单"}',
    kp_food_treat_pay.updated_at        = datetime();

MERGE (s_treat)-[:HAS_KNOWLEDGE_POINT]->(kp_food_treat_pay);

// --- KP 4: 礼貌推辞 ---
MERGE (kp_food_treat_refuse:KnowledgePoint {id: 'food_treat_refuse'})
SET kp_food_treat_refuse.name              = '礼貌推辞',
    kp_food_treat_refuse.pragmatic_intent  = '掌握中国式的"推拉"话术——被邀请时先适度推辞以示谦逊，而非直接接受',
    kp_food_treat_refuse.cultural_complexity = 5,
    kp_food_treat_refuse.high_context      = true,
    kp_food_treat_refuse.hsk_level         = 4,
    kp_food_treat_refuse.l1_conflict_points = '{"en":"英语圈直接接受邀请被视为礼貌（\"Yes, I would love to!\"），推辞会被误解为真的不想去","ja":"日语圈\"遠慮\"（客气）文化与之相近，但推辞的轮次和力度有差异","fr":"法语圈社交中\"non merci\"明确拒绝是常态，反复推拉会被视为不真诚"}',
    kp_food_treat_refuse.updated_at        = datetime();

MERGE (s_treat)-[:HAS_KNOWLEDGE_POINT]->(kp_food_treat_refuse);

// ----------------------------------------------------------------------------
// Scene: 餐桌礼仪 (table_manners)
// ----------------------------------------------------------------------------
MERGE (s_table:Scene {id: 'table_manners'})
SET s_table.name        = '餐桌礼仪',
    s_table.name_en     = 'Table Manners',
    s_table.icon        = '🥢',
    s_table.description = '筷子使用、座次安排、敬酒礼仪',
    s_table.updated_at  = datetime();

MERGE (d_food)-[:HAS_SCENE]->(s_table);

// --- KP 5: 筷子礼仪 ---
MERGE (kp_food_chopsticks:KnowledgePoint {id: 'food_manners_chopsticks'})
SET kp_food_chopsticks.name              = '筷子礼仪',
    kp_food_chopsticks.pragmatic_intent  = '掌握筷子使用的基本禁忌（不插饭、不指人、不敲碗），理解其背后的文化象征',
    kp_food_chopsticks.cultural_complexity = 3,
    kp_food_chopsticks.high_context      = true,
    kp_food_chopsticks.hsk_level         = 2,
    kp_food_chopsticks.l1_conflict_points = '{"en":"英语圈多用刀叉，筷子禁忌（如\"筷子插饭像上香\"）在西方无对应物","ja":"日语圈筷子礼仪（箸使い）极为严格，部分禁忌比中国更多（如\"迷い箸\"）","ko":"韩语圈使用金属筷子（扁平），与中国木筷手感不同，但禁忌类似"}',
    kp_food_chopsticks.updated_at        = datetime();

MERGE (s_table)-[:HAS_KNOWLEDGE_POINT]->(kp_food_chopsticks);

// ============================================================================
// 验证查询（执行后运行以确认图谱完整性）
// ============================================================================

// 查看餐饮美食 Domain 下的完整层级
// MATCH (d:Domain {id: 'food'})-[:HAS_SCENE]->(s:Scene)-[:HAS_KNOWLEDGE_POINT]->(kp:KnowledgePoint)
// RETURN d.name AS Domain, s.name AS Scene, kp.name AS Task,
//        kp.pragmatic_intent AS Intent,
//        kp.cultural_complexity AS Complexity,
//        kp.high_context AS HighContext,
//        kp.hsk_level AS HSK;

// 按文化复杂度降序列出所有 Task
// MATCH (kp:KnowledgePoint)
// RETURN kp.name, kp.cultural_complexity, kp.high_context
// ORDER BY kp.cultural_complexity DESC;

// 查询某个母语圈的所有冲突点（例如英语圈）
// MATCH (kp:KnowledgePoint)
// WHERE kp.l1_conflict_points CONTAINS '"en"'
// RETURN kp.name, kp.pragmatic_intent;
