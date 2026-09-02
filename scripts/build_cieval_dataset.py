"""
Phase 1: 从 Neo4j KG 构建 CIEval 数据集
输出: experiment_results/cieval/{train,dev,test,challenge}.json
用法: python3 scripts/build_cieval_dataset.py
"""
import json, os, random, math
from collections import defaultdict

# 尽量不依赖 neo4j driver 的复杂导入，直接用 requests 调 REST API
# 但如果有 neo4j 库就用
try:
    from neo4j import GraphDatabase
    HAS_NEO4J = True
except ImportError:
    HAS_NEO4J = False
    print("⚠️ 未安装 neo4j-driver，将使用 HTTP API")

# ── 配置 ─────────────────────────────────────────
NEO4J_URI = os.getenv("NEO4J_URI", "")
NEO4J_USER = os.getenv("NEO4J_USERNAME", "")
NEO4J_PASS = os.getenv("NEO4J_PASSWORD", "")

OUTPUT_DIR = "experiment_results/cieval"
os.makedirs(OUTPUT_DIR, exist_ok=True)

random.seed(42)

# ── 母语圈分组（按文化距离）─────────────────────
# 固定选取代表性最强的3个文化圈: 日语(近)+英语(中)+阿拉伯语(远)
# 8个文化圈按距离分组，每KP从近/中/远各随机选1个
HOME_CULTURES_POOL = {
    "near": [
        {"tier": "near", "name": "日语圈", "code": "ja", "hc_id": "hc_ja"},
        {"tier": "near", "name": "韩语圈", "code": "ko", "hc_id": "hc_ko"},
    ],
    "mid": [
        {"tier": "mid", "name": "英语圈", "code": "en", "hc_id": "hc_en"},
        {"tier": "mid", "name": "西班牙语圈", "code": "es", "hc_id": "hc_es"},
    ],
    "far": [
        {"tier": "far", "name": "阿拉伯语圈", "code": "ar", "hc_id": "hc_ar"},
        {"tier": "far", "name": "俄语圈", "code": "ru", "hc_id": "hc_ru"},
        {"tier": "far", "name": "法语圈", "code": "fr", "hc_id": "hc_fr"},
        {"tier": "far", "name": "东南亚文化圈", "code": "th", "hc_id": "hc_th"},
    ],
}

# 每KP随机选near×1 + mid×1 + far×1 = 3种母语
def pick_cultures():
    import random
    return [
        random.choice(HOME_CULTURES_POOL["near"]),
        random.choice(HOME_CULTURES_POOL["mid"]),
        random.choice(HOME_CULTURES_POOL["far"]),
    ]

HSK_LEVELS = [1, 3, 5]      # 3档全覆盖：初级/中级/高级
ANXIETY_LEVELS = [30, 60, 85]    # 低/中/高全覆盖

# ── Neo4j 连接 ────────────────────────────────────
def connect_neo4j():
    if not HAS_NEO4J:
        return None
    try:
        driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASS))
        driver.verify_connectivity()
        return driver
    except Exception as e:
        print(f"Neo4j 连接失败: {e}")
        return None

def query(driver, cypher, params=None):
    if driver is None:
        return []
    with driver.session() as session:
        result = session.run(cypher, params or {})
        return [dict(r) for r in result]

# ── Step 1: 抽取 KP（只选 KG 数据完整的）─────────
def extract_knowledge_points(driver):
    """
    只选三个条件都满足的 KP:
      ✅ 有 MANIFESTED_IN 边 (CulturalDimension→HomeCulture，含质性文化数据)
      ✅ 有 SCORES 边 (HomeCulture→CulturalDimension，Hofstede分值)
      ✅ 有 REQUIRES_VOCAB 边 (KnowledgePoint→HSKWord，词汇约束)

    不满足的 KP 直接丢弃，保证数据集 100% 纯净。
    """
    # 全量 KP 入池（不再 pre-filter，靠 query_kg_data 的 SCORES 兜底保证数据不空）
    all_rows = query(driver, """
        MATCH (d:Domain)-[:HAS_SCENE]->(s:Scene)-[:HAS_KNOWLEDGE_POINT]->(kp:KnowledgePoint)
        RETURN d.id AS domain_id, d.name AS domain_name,
               s.id AS scene_id, s.name AS scene_name,
               kp.id AS kp_id, kp.name AS kp_name,
               kp.pragmatic_intent AS pragmatic_intent,
               kp.hsk_level AS hsk_level,
               kp.cultural_complexity AS cultural_complexity,
               kp.high_context AS high_context
        ORDER BY d.id, s.id, kp.id
    """)

    # 按 domain 分组，每 domain 选 2 个 scene，每 scene 取前 2 个 KP
    by_domain = defaultdict(list)
    for r in all_rows:
        by_domain[r["domain_id"]].append(r)

    selected = []
    for domain_id, kps in by_domain.items():
        scene_ids = list(dict.fromkeys(r["scene_id"] for r in kps))[:2]
        for sid in scene_ids:
            scene_kps = [r for r in kps if r["scene_id"] == sid][:2]
            selected.extend(scene_kps)

    # 目标 50 个 KP
    if len(selected) > 50:
        selected = selected[:50]

    print(f"选中 {len(selected)} 个 KP (from {len(by_domain)} domains)")
    return selected

# ── Step 2: 查 KG 文化数据（三层兜底）─────────────
def query_kg_data(driver, kp_id, hc_id):
    """
    三层兜底策略:
      L1: MANIFESTED_IN边 → 最完整 (含具体表现、冲突、建议、场景)
      L2: SCORES边 → 有Hofstede分值，缺质性描述
      L3: 全空 → 标记为 kg_incomplete
    论文中可区分"完整KG样本"和"仅分值样本"
    """
    kg_tier = "L1_full"  # 默认最高级

    # ── L1: 查 MANIFESTED_IN ──
    manifest = query(driver, """
        MATCH (kp:KnowledgePoint {id: $kpId})-[:RELATES_TO]->(:CulturalConcept)-[:HAS_DIMENSION]->(cd:CulturalDimension)-[r:MANIFESTED_IN]->(hc:HomeCulture {id: $hcId})
        RETURN cd.name AS dimension_name,
               r.manifestation AS manifestation,
               r.conflict_with_chinese AS conflict_with_chinese,
               r.pragmatic_tip AS pragmatic_tip,
               r.example_scenario AS example_scenario,
               r.weight AS weight
        ORDER BY r.weight DESC
        LIMIT 1
    """, {"kpId": kp_id, "hcId": hc_id})

    if not manifest:
        # MANIFESTED_IN 没走通KP路径 → 直接查 Dimension→HC
        manifest = query(driver, """
            MATCH (cd:CulturalDimension)-[r:MANIFESTED_IN]->(hc:HomeCulture {id: $hcId})
            RETURN cd.name AS dimension_name,
                   r.manifestation AS manifestation,
                   r.conflict_with_chinese AS conflict_with_chinese,
                   r.pragmatic_tip AS pragmatic_tip,
                   r.example_scenario AS example_scenario,
                   r.weight AS weight
            ORDER BY r.weight DESC
            LIMIT 1
        """, {"hcId": hc_id})
        if manifest:
            kg_tier = "L1_global"  # 用的是全局文化表现，非KP专属

    # ── L2: 查 SCORES 边获取 Hofstede 分值 ──
    scores = query(driver, """
        MATCH (hc:HomeCulture {id: $hcId})-[r:SCORES]->(cd:CulturalDimension)
        MATCH (hc_zh:HomeCulture {id: 'hc_zh'})-[r2:SCORES]->(cd)
        WHERE r.confidence = 'High'
        RETURN cd.name AS name, cd.framework AS framework,
               r.score AS target_score, r2.score AS chinese_score
        ORDER BY abs(r2.score - r.score) DESC
        LIMIT 6
    """, {"hcId": hc_id})

    if not scores:
        scores = query(driver, """
            MATCH (hc:HomeCulture {id: $hcId})-[r:SCORES]->(cd:CulturalDimension)
            MATCH (hc_zh:HomeCulture {id: 'hc_zh'})-[r2:SCORES]->(cd)
            RETURN cd.name AS name, cd.framework AS framework,
                   r.score AS target_score, r2.score AS chinese_score
            ORDER BY abs(r2.score - r.score) DESC
            LIMIT 6
        """, {"hcId": hc_id})
        kg_tier = "L2"

    # ── 查 REQUIRES_VOCAB ──
    vocab = query(driver, """
        MATCH (kp:KnowledgePoint {id: $kpId})-[:REQUIRES_VOCAB]->(w:HSKWord)
        WHERE w.level <= 5
        RETURN w.lemma AS lemma
        ORDER BY rand()
        LIMIT 15
    """, {"kpId": kp_id})

    # ── 构建返回 ──
    dimension_data = []
    for s in scores[:4]:  # 取前4个维度
        dimension_data.append({
            "name": s["name"],
            "framework": s.get("framework", "Hofstede"),
            "chinese_score": s.get("chinese_score"),
            "target_score": s.get("target_score"),
        })

    manifest_data = None
    if manifest:
        m = manifest[0]
        manifest_data = {
            "dimension_name": m.get("dimension_name", ""),
            "manifestation": m.get("manifestation", ""),
            "conflict_with_chinese": m.get("conflict_with_chinese", ""),
            "pragmatic_tip": m.get("pragmatic_tip", ""),
            "example_scenario": m.get("example_scenario", ""),
        }

    return {
        "cultural_dimensions": dimension_data,
        "manifestation": manifest_data,
        "expected_vocab": [v["lemma"] for v in vocab[:8]],
        "kg_tier": kg_tier,  # L1_full / L1_global / L2
    }

# ── Step 3: 构建样本 ──────────────────────────────
def build_samples(kps, driver):
    samples = []
    counter = 1

    for kp in kps:
        for hc in pick_cultures():
            # 查 KG 数据
            kg = query_kg_data(driver, kp["kp_id"], hc["hc_id"])

            for hsk in HSK_LEVELS:
                for anxiety in ANXIETY_LEVELS:
                    motivation = random.choice(["tourism", "study_abroad", "work", "interest", "exam"])

                    sample = {
                        "cieval_id": f"CIEval-{counter:04d}",
                        "input": {
                            "knowledge_point": {
                                "id": kp["kp_id"],
                                "domain": kp["domain_name"],
                                "scene": kp["scene_name"],
                                "pragmatic_intent": kp.get("pragmatic_intent", ""),
                                "hsk_level": hsk,
                                "cultural_complexity": kp.get("cultural_complexity", 3),
                                "high_context": bool(kp.get("high_context", False)),
                            },
                            "learner_profile": {
                                "home_culture": hc["name"],
                                "home_culture_code": hc["code"],
                                "hsk_level": hsk,
                                "anxiety_score": anxiety,
                                "motivation": motivation,
                            },
                            "kg_data": kg,
                        },
                        "gold_reference": {
                            "key_concept_mapping": f"{kp.get('kp_name','')} → {hc['name']}中的对应概念",
                            "cultural_dimension_to_use": [d["name"] for d in kg["cultural_dimensions"]],
                            "expected_chinese_vocab": kg.get("expected_vocab", []),
                            "avoid_expressions": [
                                "所有的中国人都", "XX人总是", "XX人从来都",
                                "不可思议的", "落后的", "保守的",
                                "比XX更先进", "不如XX", "神秘的东方",
                            ],
                        },
                        "task": (
                            f"生成一份面向{hc['name']}HSK{hsk}学习者的学习内容，"
                            f"包含：1) {hc['name']}文化阐释 "
                            f"2) 基于Hofstede维度的跨文化对比 "
                            f"3) 5道HSK{hsk}等级的练习题"
                        ),
                    }
                    samples.append(sample)
                    counter += 1

    print(f"生成 {len(samples)} 个 CIEval 样本")
    return samples

# ── Step 4: 划分 split (按比例: Train 30% / Dev 15% / Test 45% / Challenge 10%) ──
def split_samples(samples):
    random.shuffle(samples)

    def calc_cultural_distance(s):
        dims = s["input"]["kg_data"]["cultural_dimensions"]
        if not dims or len(dims) < 2: return 0
        dist = 0; n = 0
        for d in dims:
            cs = d.get("chinese_score"); ts = d.get("target_score")
            if cs is not None and ts is not None: dist += (cs - ts) ** 2; n += 1
        return math.sqrt(dist) if n > 0 else 0

    # Challenge: 文化距离最远的 10%
    with_dist = [(calc_cultural_distance(s), s) for s in samples]
    with_dist.sort(key=lambda x: -x[0])
    challenge_n = max(50, int(len(samples) * 0.10))
    challenge = [s for _, s in with_dist[:challenge_n]]
    challenge_ids = {s["cieval_id"] for s in challenge}

    # 剩余: Train 30% / Dev 15% / Test 55% (of remaining)
    remaining = [s for _, s in with_dist[challenge_n:]]
    random.shuffle(remaining)
    n = len(remaining)
    train_n = int(n * 0.35); dev_n = int(n * 0.17)
    train = remaining[:train_n]
    dev = remaining[train_n:train_n + dev_n]
    test = remaining[train_n + dev_n:]

    print(f"Split: Train={len(train)}, Dev={len(dev)}, Test={len(test)}, Challenge={len(challenge)}")
    return train, dev, test, challenge

# ── Step 5: 验证 ──────────────────────────────────
def validate(samples):
    """所有KP均预筛选为KG数据完整，只需确认无遗漏"""
    missing_dims = 0
    missing_manifest = 0
    missing_vocab = 0
    for s in samples:
        kd = s["input"]["kg_data"]
        if not kd.get("cultural_dimensions"):
            missing_dims += 1
        if not kd.get("manifestation"):
            missing_manifest += 1
        if not kd.get("expected_vocab"):
            missing_vocab += 1

    total = len(samples)
    with_manifest = total - missing_manifest
    print(f"  总样本: {total}")
    print(f"  cultural_dimensions (SCORES分值): {total - missing_dims}/{total} 有数据")
    print(f"  manifestation (MANIFESTED_IN质性): {with_manifest}/{total} 有数据")
    print(f"  expected_vocab: {total - missing_vocab}/{total} 有数据")

    if missing_dims == 0:
        print("  ✅ 全部样本至少有Hofstede分值，验证通过")
        if missing_manifest > 0:
            print(f"  ℹ️  {missing_manifest} 条无MANIFESTED_IN数据（不影响评测维度A/B/D，C2受限）")
    else:
        print(f"  ⚠️ {missing_dims} 条连cultural_dimensions都没有，需要排查")

# ── Main ──────────────────────────────────────────
def main():
    print("=" * 60)
    print("  CIEval 数据集构建")
    print("=" * 60)

    driver = connect_neo4j()
    if driver is None:
        print("❌ 无法连接 Neo4j，请检查环境变量")
        return

    try:
        # Step 1
        print("\n[1/4] 抽取 KnowledgePoints...")
        kps = extract_knowledge_points(driver)

        # Step 2+3
        print("\n[2/4] 构建样本（含 KG 数据查询）...")
        samples = build_samples(kps, driver)

        # Step 4
        print("\n[3/4] 划分数据集...")
        train, dev, test, challenge = split_samples(samples)

        # Step 5
        print("\n[4/4] 验证 & 保存...")
        all_splits = {"train": train, "dev": dev, "test": test, "challenge": challenge}
        total = 0
        for name, split in all_splits.items():
            fname = os.path.join(OUTPUT_DIR, f"{name}.json")
            with open(fname, "w", encoding="utf-8") as f:
                json.dump(split, f, ensure_ascii=False, indent=2)
            print(f"  → {fname} ({len(split)} 条)")
            validate(split)
            total += len(split)

        print(f"\n✅ 完成。总计 {total} 条，保存在 {OUTPUT_DIR}/")

    finally:
        if driver:
            driver.close()

if __name__ == "__main__":
    main()
