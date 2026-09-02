#!/usr/bin/env python3
"""
Neo4j 跨文化维度链接种子脚本
=============================
读取 cross_cultural_mapping.json，为 CulturalConcept 节点建立与
CulturalDimension 和 HomeCulture 的关系。

环境变量（必需）：
  NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD

用法：
  python3 seed_cross_cultural_links.py [--dry-run] [--verify]
"""

import json
import os
import sys
import argparse
from pathlib import Path


def get_env_config() -> dict:
    uri = os.getenv("NEO4J_URI", "").strip()
    user = os.getenv("NEO4J_USERNAME", "").strip()
    password = os.getenv("NEO4J_PASSWORD", "").strip()
    database = os.getenv("NEO4J_DATABASE", "neo4j").strip()

    missing = []
    if not uri: missing.append("NEO4J_URI")
    if not user: missing.append("NEO4J_USERNAME")
    if not password: missing.append("NEO4J_PASSWORD")

    return {"uri": uri, "user": user, "password": password, "database": database,
            "missing": missing, "ok": len(missing) == 0}


def load_mapping_json(path: str) -> dict:
    if not os.path.exists(path):
        raise FileNotFoundError(f"映射文件不存在: {path}")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if "cultural_concepts" not in data:
        raise ValueError("JSON 缺少 'cultural_concepts' 字段")

    return data


# 概念名 → 实际 KnowledgePoint ID 映射表
# 用于将用户自定义的概念 ID (kp_food_001 等) 映射到 Neo4j 中的 KP 节点
CONCEPT_NAME_TO_KP_ID = {
    "抢买单与面子博弈": "food_treat_pay",
    "劝酒文化与边界侵犯": "food_manners_toast",
    "座次排列与权力距离": "food_manners_seating",
    "合餐制与个人选择权": "food_ordering_basic",
    "“客气”推拉与高语境表达": "food_treat_refuse",
    "‘客气’推拉与高语境表达": "food_treat_refuse",
    "餐桌禁忌与谐音文化": "food_manners_chopsticks",
    "称呼语与权力距离": "workplace_hierarchy_title",
    "“考虑一下”": "workplace_email_pushback",
    "含蓄拒绝与“考虑一下”": "workplace_email_pushback",
    "送礼的时机与合规边界": "workplace_hierarchy_gift",
    "会议沉默与发言序列": "workplace_meeting_speak",
    "微信办公与公私边界": "workplace_wechat_work",
    "面子保护与间接反馈": "workplace_hierarchy_face",
}


def _resolve_kp_id(concept_id: str, concept_name: str) -> str:
    """将用户自定义概念 ID/名称 解析为实际的 KnowledgePoint ID。"""
    # 直接按名称查映射表
    if concept_name in CONCEPT_NAME_TO_KP_ID:
        return CONCEPT_NAME_TO_KP_ID[concept_name]

    # 尝试部分匹配（处理引号变体）
    for key, kp_id in CONCEPT_NAME_TO_KP_ID.items():
        # 去掉引号后比较
        clean_name = concept_name.replace("“", "").replace("”", "").replace("‘", "").replace("’", "")
        clean_key = key.replace("“", "").replace("”", "").replace("‘", "").replace("’", "")
        if clean_name in clean_key or clean_key in clean_name:
            return kp_id

    return ""


def seed_cross_cultural_links(session, mapping: dict) -> dict:
    """
    对每个 cultural_concept，写入：
    1. (CulturalConcept)-[:HAS_DIMENSION {weight}]->(CulturalDimension)
    2. (CulturalConcept)-[:MANIFESTED_IN {conflict, tip, severity}]->(HomeCulture)
    """
    stats = {"has_dimension": 0, "manifested_in": 0, "concepts_processed": 0,
             "skipped_no_concept": 0, "skipped_no_dim": 0, "skipped_no_hc": 0}

    for concept_cfg in mapping.get("cultural_concepts", []):
        concept_id = concept_cfg.get("concept_id", "")
        concept_name = concept_cfg.get("name", "")
        if not concept_id:
            continue

        # 尝试多种方式定位 CulturalConcept:
        #   方式1: knowledge_point_id 精确匹配 (旧格式 concept_id = 实际 KP ID)
        #   方式2: 通过 cc.name CONTAINS 概念名模糊匹配
        #   方式3: 通过 name→kp_id 映射表 (新格式 concept_id = 抽象 ID)
        kp_id_by_name = _resolve_kp_id(concept_id, concept_name)

        result = session.run(
            """
            MATCH (cc:CulturalConcept)
            WHERE cc.knowledge_point_id = $kp_id
            RETURN cc.id AS cc_id, cc.name AS cc_name
            """,
            {"kp_id": concept_id},
        )

        cc_nodes = list(result)

        # 方式2+3: 名称模糊匹配
        if not cc_nodes and concept_name:
            # 先尝试通过概念名直接搜索
            result = session.run(
                """
                MATCH (cc:CulturalConcept)
                WHERE cc.name CONTAINS $name
                RETURN cc.id AS cc_id, cc.name AS cc_name
                """,
                {"name": concept_name},
            )
            cc_nodes = list(result)

        # 方式3: 通过映射表匹配
        if not cc_nodes and kp_id_by_name:
            result = session.run(
                """
                MATCH (cc:CulturalConcept)
                WHERE cc.knowledge_point_id = $kp_id
                RETURN cc.id AS cc_id, cc.name AS cc_name
                """,
                {"kp_id": kp_id_by_name},
            )
            cc_nodes = list(result)
            if cc_nodes:
                print(f"  [MAP] {concept_id} → {kp_id_by_name}: {len(cc_nodes)} 个 CulturalConcept")

        if not cc_nodes:
            print(f"  [WARN] 未找到 CulturalConcept: {concept_id} ({concept_name})，跳过")
            stats["skipped_no_concept"] += 1
            continue

        # 1. 写入维度关系
        for dim_cfg in concept_cfg.get("dimensions", []):
            dim_id = dim_cfg.get("dimension_id", "")
            weight = dim_cfg.get("weight", 0.5)

            if not dim_id:
                continue

            for cc_record in cc_nodes:
                cc_id = cc_record["cc_id"]
                result = session.run(
                    """
                    MATCH (cc:CulturalConcept {id: $cc_id})
                    MATCH (cd:CulturalDimension {id: $dim_id})
                    MERGE (cc)-[r:HAS_DIMENSION]->(cd)
                    SET r.weight = $weight,
                        r.updated_at = datetime()
                    RETURN r
                    """,
                    {"cc_id": cc_id, "dim_id": dim_id, "weight": weight},
                )
                if result.single():
                    stats["has_dimension"] += 1
                else:
                    stats["skipped_no_dim"] += 1

        # 2. 写入母语文化圈表现
        for manifest in concept_cfg.get("home_culture_manifestations", []):
            hc_id = manifest.get("culture_id", "")
            conflict = manifest.get("conflict_description", "")
            tip = manifest.get("pragmatic_tip", "")
            severity = manifest.get("severity", 3)

            if not hc_id:
                continue

            for cc_record in cc_nodes:
                cc_id = cc_record["cc_id"]
                result = session.run(
                    """
                    MATCH (cc:CulturalConcept {id: $cc_id})
                    MATCH (hc:HomeCulture {id: $hc_id})
                    MERGE (cc)-[r:MANIFESTED_IN]->(hc)
                    SET r.conflict_description = $conflict,
                        r.pragmatic_tip = $tip,
                        r.severity = $severity,
                        r.updated_at = datetime()
                    RETURN r
                    """,
                    {
                        "cc_id": cc_id,
                        "hc_id": hc_id,
                        "conflict": conflict,
                        "tip": tip,
                        "severity": severity,
                    },
                )
                if result.single():
                    stats["manifested_in"] += 1
                else:
                    stats["skipped_no_hc"] += 1

        stats["concepts_processed"] += 1
        print(f"  ✅ {concept_id}: {len(cc_nodes)} 个 CulturalConcept, "
              f"{len(concept_cfg.get('dimensions', []))} 个维度, "
              f"{len(concept_cfg.get('home_culture_manifestations', []))} 个文化圈")

    return stats


def verify_links(session):
    """验证跨文化链接。"""
    print("\n" + "=" * 60)
    print("📊 Layer 2 跨文化链接验证")
    print("=" * 60)

    queries = {
        "HAS_DIMENSION 关系数": (
            "MATCH (:CulturalConcept)-[r:HAS_DIMENSION]->(:CulturalDimension) "
            "RETURN count(r) AS cnt"
        ),
        "MANIFESTED_IN 关系数": (
            "MATCH (:CulturalConcept)-[r:MANIFESTED_IN]->(:HomeCulture) "
            "RETURN count(r) AS cnt"
        ),
    }

    for label, cypher in queries.items():
        result = session.run(cypher)
        print(f"  {label}: {result.single()['cnt']}")

    # 按维度统计
    print("\n  CulturalConcept 按维度分布:")
    dim_stats = session.run(
        """
        MATCH (:CulturalConcept)-[r:HAS_DIMENSION]->(cd:CulturalDimension)
        RETURN cd.name AS dim_name, count(r) AS cnt, avg(r.weight) AS avg_weight
        ORDER BY cnt DESC
        """
    ).data()
    for row in dim_stats:
        print(f"    {row['dim_name']}: {row['cnt']} 个概念 (平均权重 {row['avg_weight']:.2f})")

    # 按母语文化圈统计
    print("\n  CulturalConcept 按母语文化圈分布:")
    hc_stats = session.run(
        """
        MATCH (:CulturalConcept)-[r:MANIFESTED_IN]->(hc:HomeCulture)
        RETURN hc.name AS hc_name, count(r) AS cnt
        ORDER BY cnt DESC
        """
    ).data()
    for row in hc_stats:
        print(f"    {row['hc_name']}: {row['cnt']} 个表现")


def main():
    parser = argparse.ArgumentParser(description="Neo4j 跨文化维度链接种子脚本")
    parser.add_argument("--json", default=None, help="跨文化映射 JSON 文件路径")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    json_path = args.json or str(script_dir / "cross_cultural_mapping.json")

    print("=" * 60)
    print("🔗 Neo4j 跨文化维度链接注入")
    print("=" * 60)
    print(f"📄 映射文件: {json_path}")

    try:
        mapping = load_mapping_json(json_path)
        print(f"  ✅ JSON 合法 — {len(mapping.get('cultural_concepts', []))} 个概念配置")
    except Exception as e:
        print(f"  ❌ 加载失败: {e}")
        sys.exit(1)

    if args.dry_run:
        print("\n🔍 --dry-run 模式，跳过 Neo4j 连接。")
        return

    cfg = get_env_config()
    if not cfg["ok"]:
        print(f"  ❌ 缺少环境变量: {', '.join(cfg['missing'])}")
        sys.exit(1)
    print(f"  ✅ 配置完整 — {cfg['uri']}")

    try:
        from neo4j import GraphDatabase
    except ImportError:
        print("  ❌ 未安装 neo4j 驱动。")
        sys.exit(1)

    driver = GraphDatabase.driver(
        cfg["uri"],
        auth=(cfg["user"], cfg["password"]),
    )

    try:
        driver.verify_connectivity()
        print("  ✅ Neo4j 连接成功")
    except Exception as e:
        print(f"  ❌ 连接失败: {e}")
        driver.close()
        sys.exit(1)

    db = cfg["database"] if cfg["database"] != "neo4j" else None

    try:
        with driver.session(database=db) if db else driver.session() as session:
            stats = seed_cross_cultural_links(session, mapping)
    except Exception as e:
        print(f"  ❌ 注入出错: {e}")
        import traceback; traceback.print_exc()
        driver.close()
        sys.exit(1)

    if args.verify:
        try:
            with driver.session(database=db) if db else driver.session() as s:
                verify_links(s)
        except Exception as e:
            print(f"  ⚠️ 验证出错: {e}")

    driver.close()

    print("\n" + "=" * 60)
    print("✅ 跨文化链接注入完成！")
    print(f"  HAS_DIMENSION 关系: {stats['has_dimension']} (MERGE)")
    print(f"  MANIFESTED_IN 关系: {stats['manifested_in']} (MERGE)")
    print(f"  处理概念数:         {stats['concepts_processed']}")
    if stats["skipped_no_concept"] > 0:
        print(f"  ⚠️  跳过（无匹配概念）: {stats['skipped_no_concept']}")


if __name__ == "__main__":
    main()
