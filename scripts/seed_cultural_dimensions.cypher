// ============================================================================
// Neo4j 跨文化维度层种子 v2.0 — CulturalDimension + HomeCulture + SCORES
//
// 修订说明：
//   - 合并 Hall 的 Chronemics(时间观念) 与 Polychronic(多时制) → dim_chronemics
//   - 新增 Trompenaars 特定型/扩散型 → dim_specific_diffuse
//   - 所有维度采用 0.0~1.0 极性 (0=左极, 1=右极)
//   - hc_th 修正为"东南亚文化圈"
//   - 新增 hc_zh 作为目标文化基准 (Target Baseline)
//   - 新增 HomeCulture-[SCORES]->CulturalDimension 关系
// ============================================================================

// ----------------------------------------------------------------------------
// Hofstede 文化维度模型 (6维)
// ----------------------------------------------------------------------------

MERGE (cd:CulturalDimension {id: 'dim_power_distance'})
SET cd.name = '权力距离',
    cd.name_en = 'Power Distance Index',
    cd.framework = 'Hofstede',
    cd.short_def = '社会对权力、地位、财富分配不平等的接受与预期程度',
    cd.polarity_0 = '平等主义，质疑权威',
    cd.polarity_1 = '等级分明，服从权威',
    cd.relevance_to_chinese = '核心：决定称谓(您/老王/王总)、敬语使用、上下级沟通时的服从性',
    cd.updated_at = datetime();

MERGE (cd:CulturalDimension {id: 'dim_individualism'})
SET cd.name = '个人/集体主义',
    cd.name_en = 'Individualism vs Collectivism',
    cd.framework = 'Hofstede',
    cd.short_def = '个体独立与群体归属的优先层级',
    cd.polarity_0 = '个人本位，强调独立与自我',
    cd.polarity_1 = '群体本位，强调忠诚与从众',
    cd.relevance_to_chinese = '核心：决定"我们"的泛用、合餐制、请客买单逻辑、家庭羁绊的话题',
    cd.updated_at = datetime();

MERGE (cd:CulturalDimension {id: 'dim_masculinity'})
SET cd.name = '竞争与关怀导向',
    cd.name_en = 'Masculinity vs Femininity',
    cd.framework = 'Hofstede',
    cd.short_def = '社会动机趋向竞争与成就，还是趋向生活质量与合作',
    cd.polarity_0 = '重合作、生活质量与弱者关怀',
    cd.polarity_1 = '重竞争、物质成功与英雄主义',
    cd.relevance_to_chinese = '辅助：影响工作场景话题语用(内卷、拼搏、对加班的默认态度)',
    cd.updated_at = datetime();

MERGE (cd:CulturalDimension {id: 'dim_uncertainty'})
SET cd.name = '不确定性规避',
    cd.name_en = 'Uncertainty Avoidance',
    cd.framework = 'Hofstede',
    cd.short_def = '社会对模糊、未知情况的容忍度及通过规则规避风险的倾向',
    cd.polarity_0 = '容忍模糊，接受变化，规则灵活',
    cd.polarity_1 = '惧怕未知，依赖规则、仪式和计划',
    cd.relevance_to_chinese = '辅助：影响日程安排灵活性、"随便"的语境解析、对口头承诺的重视',
    cd.updated_at = datetime();

MERGE (cd:CulturalDimension {id: 'dim_long_term'})
SET cd.name = '长期/短期导向',
    cd.name_en = 'Long-Term vs Short-Term Orientation',
    cd.framework = 'Hofstede',
    cd.short_def = '关注未来长远发展还是关注过去与当下的履约',
    cd.polarity_0 = '重传统、面子、快速回报',
    cd.polarity_1 = '重储蓄、适应性、长期教育投资',
    cd.relevance_to_chinese = '辅助：影响中国人的储蓄观、吃苦文化、对"铁饭碗"的执念表达',
    cd.updated_at = datetime();

MERGE (cd:CulturalDimension {id: 'dim_indulgence'})
SET cd.name = '放纵与克制',
    cd.name_en = 'Indulgence vs Restraint',
    cd.framework = 'Hofstede',
    cd.short_def = '满足人类基本欲望的自由度与社会规范的约束力',
    cd.polarity_0 = '规范严格，压抑欲望，重节俭',
    cd.polarity_1 = '享受生活，自由表达，宽容度高',
    cd.relevance_to_chinese = '辅助：饮食文化中的"克制"(光盘)与宴请的"放纵"(满汉全席)悖论',
    cd.updated_at = datetime();

// ----------------------------------------------------------------------------
// Hall 高低语境文化模型 (3维，合并 Chronemics + Polychronic)
// ----------------------------------------------------------------------------

MERGE (cd:CulturalDimension {id: 'dim_high_context'})
SET cd.name = '高低语境',
    cd.name_en = 'High vs Low Context Communication',
    cd.framework = 'Hall',
    cd.short_def = '信息传递对环境、关系、潜台词等非语言线索的依赖度',
    cd.polarity_0 = '低语境，直接、字面含义即全部',
    cd.polarity_1 = '高语境，间接、听弦外之音',
    cd.relevance_to_chinese = '核心：委婉拒绝("再说吧")、推拉话术("哪里哪里")、不直接说"不"',
    cd.updated_at = datetime();

MERGE (cd:CulturalDimension {id: 'dim_proxemics'})
SET cd.name = '空间距离',
    cd.name_en = 'Proxemics / Personal Space',
    cd.framework = 'Hall',
    cd.short_def = '人际交往中的物理空间需求与领域感',
    cd.polarity_0 = '远距，需较大个人空间，少接触',
    cd.polarity_1 = '近距，排队近，身体接触(同性)多',
    cd.relevance_to_chinese = '辅助：公共交通/排队时的距离感，社交距离的容忍度',
    cd.updated_at = datetime();

MERGE (cd:CulturalDimension {id: 'dim_chronemics'})
SET cd.name = '时间观念',
    cd.name_en = 'Chronemics / Time Orientation',
    cd.framework = 'Hall',
    cd.short_def = '时间是线性的、任务导向的(单时制)，还是网状的、关系导向的(多时制)',
    cd.polarity_0 = '单时制，一次一事，时间表至上',
    cd.polarity_1 = '多时制，灵活多重，人际关系优先',
    cd.relevance_to_chinese = '辅助：办事"走关系"的时间逻辑、中式饭局上同时推进多项议题的习惯',
    cd.updated_at = datetime();

// ----------------------------------------------------------------------------
// Trompenaars 文化维度 (1维，替换重叠的 Polychronic)
// ----------------------------------------------------------------------------

MERGE (cd:CulturalDimension {id: 'dim_specific_diffuse'})
SET cd.name = '特定型与扩散型界限',
    cd.name_en = 'Specific vs Diffuse',
    cd.framework = 'Trompenaars',
    cd.short_def = '工作/公共空间与私人/家庭空间的重合度',
    cd.polarity_0 = '特定型，公私分明，拒绝探问隐私',
    cd.polarity_1 = '扩散型，公私交融，关系全面渗透',
    cd.relevance_to_chinese = '核心：解释为何中国人爱问"多大了/结婚没/工资多少"，视为拉近关系而非冒犯',
    cd.updated_at = datetime();

// ----------------------------------------------------------------------------
// 中文教学专用维度 (2维)
// ----------------------------------------------------------------------------

MERGE (cd:CulturalDimension {id: 'dim_face_concern'})
SET cd.name = '面子与尊严',
    cd.name_en = 'Face and Dignity Concern',
    cd.framework = 'Custom_TCSL',
    cd.short_def = '互动中维护自身及他人社会形象(Mianzi)的权重',
    cd.polarity_0 = '低面子，对事不对人，接受直接批评',
    cd.polarity_1 = '高面子，给面子/留余地比事实重要',
    cd.relevance_to_chinese = '核心：职场批评的艺术、"给面子"与"丢脸"的高频语用',
    cd.updated_at = datetime();

MERGE (cd:CulturalDimension {id: 'dim_reciprocity'})
SET cd.name = '互惠与人情规范',
    cd.name_en = 'Reciprocity Norm / Renqing',
    cd.framework = 'Custom_TCSL',
    cd.short_def = '礼物、帮忙等社交行为中隐含的回报义务',
    cd.polarity_0 = '弱互惠，礼物是单向善意，无负担',
    cd.polarity_1 = '强互惠，人情债必还，礼尚往来',
    cd.relevance_to_chinese = '核心：收礼的推辞仪式、还礼的对等性、请客吃饭的轮替机制',
    cd.updated_at = datetime();

// ============================================================================
// HomeCulture 节点 — 1个基准(zh) + 8个母语文化圈
// ============================================================================

// --- 目标文化基准 (Target Baseline) ---
MERGE (hc:HomeCulture {id: 'hc_zh'})
SET hc.code = 'zh',
    hc.name = '中文文化圈',
    hc.name_en = 'Chinese Cultural Sphere (Baseline)',
    hc.typical_countries = '中国大陆、台湾、香港、澳门、新加坡(华族)',
    hc.role = 'target_baseline',
    hc.updated_at = datetime();

// --- 母语文化圈 ---
MERGE (hc:HomeCulture {id: 'hc_en'})
SET hc.code = 'en',
    hc.name = '英语圈',
    hc.name_en = 'English-speaking',
    hc.typical_countries = '美国、英国、加拿大、澳大利亚、新西兰',
    hc.updated_at = datetime();

MERGE (hc:HomeCulture {id: 'hc_ja'})
SET hc.code = 'ja',
    hc.name = '日语圈',
    hc.name_en = 'Japanese',
    hc.typical_countries = '日本',
    hc.updated_at = datetime();

MERGE (hc:HomeCulture {id: 'hc_ko'})
SET hc.code = 'ko',
    hc.name = '韩语圈',
    hc.name_en = 'Korean',
    hc.typical_countries = '韩国、朝鲜',
    hc.updated_at = datetime();

MERGE (hc:HomeCulture {id: 'hc_es'})
SET hc.code = 'es',
    hc.name = '西班牙语圈',
    hc.name_en = 'Spanish-speaking',
    hc.typical_countries = '西班牙、墨西哥、阿根廷、哥伦比亚等',
    hc.updated_at = datetime();

MERGE (hc:HomeCulture {id: 'hc_ar'})
SET hc.code = 'ar',
    hc.name = '阿拉伯语圈',
    hc.name_en = 'Arabic-speaking',
    hc.typical_countries = '沙特阿拉伯、埃及、阿联酋、摩洛哥等',
    hc.updated_at = datetime();

MERGE (hc:HomeCulture {id: 'hc_ru'})
SET hc.code = 'ru',
    hc.name = '俄语圈',
    hc.name_en = 'Russian-speaking',
    hc.typical_countries = '俄罗斯、白俄罗斯、哈萨克斯坦等',
    hc.updated_at = datetime();

MERGE (hc:HomeCulture {id: 'hc_fr'})
SET hc.code = 'fr',
    hc.name = '法语圈',
    hc.name_en = 'French-speaking',
    hc.typical_countries = '法国、比利时、瑞士、加拿大魁北克等',
    hc.updated_at = datetime();

MERGE (hc:HomeCulture {id: 'hc_th'})
SET hc.code = 'th',
    hc.name = '东南亚文化圈',
    hc.name_en = 'Southeast Asian Cultural Sphere',
    hc.typical_countries = '泰国、越南、印度尼西亚、马来西亚等',
    hc.updated_at = datetime();

// ============================================================================
// SCORES 关系 — HomeCulture → CulturalDimension (0.0~1.0)
//
// 数值含义：
//   0.0 = 该文化在此维度上处于左极（对应 polarity_0）
//   1.0 = 该文化在此维度上处于右极（对应 polarity_1）
//
// 来源：Hofstede Insights 2023 各国数据 + Hall/Trompenaars 文献估算
// confidence: High = 有Hofstede实证数据 | Medium = 基于跨文化文献推断 | Low = 基于区域共性估算
// ============================================================================

// ============================================
// hc_zh — 中文文化圈 (Target Baseline)
// ============================================
MATCH (hc:HomeCulture {id: 'hc_zh'}), (cd:CulturalDimension {id: 'dim_power_distance'})        MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.80, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_zh'}), (cd:CulturalDimension {id: 'dim_individualism'})          MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.80, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_zh'}), (cd:CulturalDimension {id: 'dim_masculinity'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.66, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_zh'}), (cd:CulturalDimension {id: 'dim_uncertainty'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.30, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_zh'}), (cd:CulturalDimension {id: 'dim_long_term'})              MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.87, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_zh'}), (cd:CulturalDimension {id: 'dim_indulgence'})             MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.24, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_zh'}), (cd:CulturalDimension {id: 'dim_high_context'})           MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.95, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_zh'}), (cd:CulturalDimension {id: 'dim_proxemics'})              MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.70, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_zh'}), (cd:CulturalDimension {id: 'dim_chronemics'})             MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.75, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_zh'}), (cd:CulturalDimension {id: 'dim_specific_diffuse'})       MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.90, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_zh'}), (cd:CulturalDimension {id: 'dim_face_concern'})           MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.95, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_zh'}), (cd:CulturalDimension {id: 'dim_reciprocity'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.90, r.confidence = 'Medium', r.updated_at = datetime();

// ============================================
// hc_en — 英语圈
// ============================================
MATCH (hc:HomeCulture {id: 'hc_en'}), (cd:CulturalDimension {id: 'dim_power_distance'})        MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.30, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_en'}), (cd:CulturalDimension {id: 'dim_individualism'})          MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.10, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_en'}), (cd:CulturalDimension {id: 'dim_masculinity'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.62, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_en'}), (cd:CulturalDimension {id: 'dim_uncertainty'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.46, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_en'}), (cd:CulturalDimension {id: 'dim_long_term'})              MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.26, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_en'}), (cd:CulturalDimension {id: 'dim_indulgence'})             MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.68, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_en'}), (cd:CulturalDimension {id: 'dim_high_context'})           MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.20, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_en'}), (cd:CulturalDimension {id: 'dim_proxemics'})              MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.30, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_en'}), (cd:CulturalDimension {id: 'dim_chronemics'})             MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.15, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_en'}), (cd:CulturalDimension {id: 'dim_specific_diffuse'})       MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.15, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_en'}), (cd:CulturalDimension {id: 'dim_face_concern'})           MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.20, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_en'}), (cd:CulturalDimension {id: 'dim_reciprocity'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.20, r.confidence = 'Medium', r.updated_at = datetime();

// ============================================
// hc_ja — 日语圈
// ============================================
MATCH (hc:HomeCulture {id: 'hc_ja'}), (cd:CulturalDimension {id: 'dim_power_distance'})        MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.54, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ja'}), (cd:CulturalDimension {id: 'dim_individualism'})          MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.54, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ja'}), (cd:CulturalDimension {id: 'dim_masculinity'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.95, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ja'}), (cd:CulturalDimension {id: 'dim_uncertainty'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.92, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ja'}), (cd:CulturalDimension {id: 'dim_long_term'})              MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.88, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ja'}), (cd:CulturalDimension {id: 'dim_indulgence'})             MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.42, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ja'}), (cd:CulturalDimension {id: 'dim_high_context'})           MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.85, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ja'}), (cd:CulturalDimension {id: 'dim_proxemics'})              MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.50, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ja'}), (cd:CulturalDimension {id: 'dim_chronemics'})             MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.10, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ja'}), (cd:CulturalDimension {id: 'dim_specific_diffuse'})       MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.60, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ja'}), (cd:CulturalDimension {id: 'dim_face_concern'})           MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.85, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ja'}), (cd:CulturalDimension {id: 'dim_reciprocity'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.80, r.confidence = 'Medium', r.updated_at = datetime();

// ============================================
// hc_ko — 韩语圈
// ============================================
MATCH (hc:HomeCulture {id: 'hc_ko'}), (cd:CulturalDimension {id: 'dim_power_distance'})        MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.60, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ko'}), (cd:CulturalDimension {id: 'dim_individualism'})          MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.60, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ko'}), (cd:CulturalDimension {id: 'dim_masculinity'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.39, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ko'}), (cd:CulturalDimension {id: 'dim_uncertainty'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.85, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ko'}), (cd:CulturalDimension {id: 'dim_long_term'})              MERGE (hc)-[r:SCORES]->(cd) SET r.score = 1.00, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ko'}), (cd:CulturalDimension {id: 'dim_indulgence'})             MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.29, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ko'}), (cd:CulturalDimension {id: 'dim_high_context'})           MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.80, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ko'}), (cd:CulturalDimension {id: 'dim_proxemics'})              MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.60, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ko'}), (cd:CulturalDimension {id: 'dim_chronemics'})             MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.40, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ko'}), (cd:CulturalDimension {id: 'dim_specific_diffuse'})       MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.70, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ko'}), (cd:CulturalDimension {id: 'dim_face_concern'})           MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.80, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ko'}), (cd:CulturalDimension {id: 'dim_reciprocity'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.75, r.confidence = 'Medium', r.updated_at = datetime();

// ============================================
// hc_es — 西班牙语圈
// ============================================
MATCH (hc:HomeCulture {id: 'hc_es'}), (cd:CulturalDimension {id: 'dim_power_distance'})        MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.57, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_es'}), (cd:CulturalDimension {id: 'dim_individualism'})          MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.49, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_es'}), (cd:CulturalDimension {id: 'dim_masculinity'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.42, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_es'}), (cd:CulturalDimension {id: 'dim_uncertainty'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.86, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_es'}), (cd:CulturalDimension {id: 'dim_long_term'})              MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.19, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_es'}), (cd:CulturalDimension {id: 'dim_indulgence'})             MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.44, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_es'}), (cd:CulturalDimension {id: 'dim_high_context'})           MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.55, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_es'}), (cd:CulturalDimension {id: 'dim_proxemics'})              MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.80, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_es'}), (cd:CulturalDimension {id: 'dim_chronemics'})             MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.80, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_es'}), (cd:CulturalDimension {id: 'dim_specific_diffuse'})       MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.60, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_es'}), (cd:CulturalDimension {id: 'dim_face_concern'})           MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.60, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_es'}), (cd:CulturalDimension {id: 'dim_reciprocity'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.55, r.confidence = 'Medium', r.updated_at = datetime();

// ============================================
// hc_ar — 阿拉伯语圈
// ============================================
MATCH (hc:HomeCulture {id: 'hc_ar'}), (cd:CulturalDimension {id: 'dim_power_distance'})        MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.80, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ar'}), (cd:CulturalDimension {id: 'dim_individualism'})          MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.62, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ar'}), (cd:CulturalDimension {id: 'dim_masculinity'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.52, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ar'}), (cd:CulturalDimension {id: 'dim_uncertainty'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.68, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ar'}), (cd:CulturalDimension {id: 'dim_long_term'})              MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.23, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ar'}), (cd:CulturalDimension {id: 'dim_indulgence'})             MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.34, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ar'}), (cd:CulturalDimension {id: 'dim_high_context'})           MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.75, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ar'}), (cd:CulturalDimension {id: 'dim_proxemics'})              MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.85, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ar'}), (cd:CulturalDimension {id: 'dim_chronemics'})             MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.85, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ar'}), (cd:CulturalDimension {id: 'dim_specific_diffuse'})       MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.85, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ar'}), (cd:CulturalDimension {id: 'dim_face_concern'})           MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.80, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ar'}), (cd:CulturalDimension {id: 'dim_reciprocity'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.80, r.confidence = 'Medium', r.updated_at = datetime();

// ============================================
// hc_ru — 俄语圈
// ============================================
MATCH (hc:HomeCulture {id: 'hc_ru'}), (cd:CulturalDimension {id: 'dim_power_distance'})        MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.93, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ru'}), (cd:CulturalDimension {id: 'dim_individualism'})          MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.61, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ru'}), (cd:CulturalDimension {id: 'dim_masculinity'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.36, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ru'}), (cd:CulturalDimension {id: 'dim_uncertainty'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.95, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ru'}), (cd:CulturalDimension {id: 'dim_long_term'})              MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.81, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ru'}), (cd:CulturalDimension {id: 'dim_indulgence'})             MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.20, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ru'}), (cd:CulturalDimension {id: 'dim_high_context'})           MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.45, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ru'}), (cd:CulturalDimension {id: 'dim_proxemics'})              MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.40, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ru'}), (cd:CulturalDimension {id: 'dim_chronemics'})             MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.55, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ru'}), (cd:CulturalDimension {id: 'dim_specific_diffuse'})       MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.50, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ru'}), (cd:CulturalDimension {id: 'dim_face_concern'})           MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.50, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_ru'}), (cd:CulturalDimension {id: 'dim_reciprocity'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.60, r.confidence = 'Medium', r.updated_at = datetime();

// ============================================
// hc_fr — 法语圈
// ============================================
MATCH (hc:HomeCulture {id: 'hc_fr'}), (cd:CulturalDimension {id: 'dim_power_distance'})        MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.68, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_fr'}), (cd:CulturalDimension {id: 'dim_individualism'})          MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.29, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_fr'}), (cd:CulturalDimension {id: 'dim_masculinity'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.43, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_fr'}), (cd:CulturalDimension {id: 'dim_uncertainty'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.86, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_fr'}), (cd:CulturalDimension {id: 'dim_long_term'})              MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.63, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_fr'}), (cd:CulturalDimension {id: 'dim_indulgence'})             MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.48, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_fr'}), (cd:CulturalDimension {id: 'dim_high_context'})           MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.50, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_fr'}), (cd:CulturalDimension {id: 'dim_proxemics'})              MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.45, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_fr'}), (cd:CulturalDimension {id: 'dim_chronemics'})             MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.30, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_fr'}), (cd:CulturalDimension {id: 'dim_specific_diffuse'})       MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.35, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_fr'}), (cd:CulturalDimension {id: 'dim_face_concern'})           MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.50, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_fr'}), (cd:CulturalDimension {id: 'dim_reciprocity'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.40, r.confidence = 'Medium', r.updated_at = datetime();

// ============================================
// hc_th — 东南亚文化圈
// ============================================
MATCH (hc:HomeCulture {id: 'hc_th'}), (cd:CulturalDimension {id: 'dim_power_distance'})        MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.64, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_th'}), (cd:CulturalDimension {id: 'dim_individualism'})          MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.80, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_th'}), (cd:CulturalDimension {id: 'dim_masculinity'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.34, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_th'}), (cd:CulturalDimension {id: 'dim_uncertainty'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.64, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_th'}), (cd:CulturalDimension {id: 'dim_long_term'})              MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.56, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_th'}), (cd:CulturalDimension {id: 'dim_indulgence'})             MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.45, r.confidence = 'High', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_th'}), (cd:CulturalDimension {id: 'dim_high_context'})           MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.70, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_th'}), (cd:CulturalDimension {id: 'dim_proxemics'})              MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.65, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_th'}), (cd:CulturalDimension {id: 'dim_chronemics'})             MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.65, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_th'}), (cd:CulturalDimension {id: 'dim_specific_diffuse'})       MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.70, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_th'}), (cd:CulturalDimension {id: 'dim_face_concern'})           MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.80, r.confidence = 'Medium', r.updated_at = datetime();
MATCH (hc:HomeCulture {id: 'hc_th'}), (cd:CulturalDimension {id: 'dim_reciprocity'})            MERGE (hc)-[r:SCORES]->(cd) SET r.score = 0.70, r.confidence = 'Medium', r.updated_at = datetime();
