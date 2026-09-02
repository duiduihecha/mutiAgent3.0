#!/usr/bin/env python3
"""
Neo4j Layer 1 节点提取脚本
=============================
从现有 KnowledgePoint 节点的 l1_conflict_points 字段中提取 CulturalConcept 和
LanguagePoint 节点，建立 RELATES_TO 和 INVOLVES 关系。

环境变量（必需）：
  NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD

用法：
  pip install neo4j
  export NEO4J_URI="neo4j+s://xxx.databases.neo4j.io"
  export NEO4J_USERNAME="neo4j"
  export NEO4J_PASSWORD="your-password"
  python3 extract_layer1_nodes.py [--dry-run] [--verify]
"""

import json
import os
import sys
import argparse
from pathlib import Path
from collections import defaultdict


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


# ============================================================================
# 语言代码 → 自然语言名映射
# ============================================================================

LANGUAGE_NAME_MAP = {
    "en": "英语圈",
    "ja": "日语圈",
    "ko": "韩语圈",
    "es": "西班牙语圈",
    "ar": "阿拉伯语圈",
    "ru": "俄语圈",
    "fr": "法语圈",
    "th": "东南亚语系",
}

# 语言代码到节点 ID
LANGUAGE_TO_HC_ID = {
    "en": "hc_en",
    "ja": "hc_ja",
    "ko": "hc_ko",
    "es": "hc_es",
    "ar": "hc_ar",
    "ru": "hc_ru",
    "fr": "hc_fr",
    "th": "hc_th",
}


# ============================================================================
# 提取逻辑
# ============================================================================

def extract_cultural_concepts(session):
    """
    从所有 KnowledgePoint 的 l1_conflict_points 中提取 CulturalConcept。

    逻辑：
    - 读取每个 KP 的 l1_conflict_points JSON
    - 对每对 (KP, language_code)，创建一个 CulturalConcept 节点
    - 创建 (KP)-[:RELATES_TO]->(CulturalConcept) 关系
    - 创建 (KP)-[:INVOLVES]->(LanguagePoint) 关系
    """
    # 获取所有有 l1_conflict_points 的 KnowledgePoint
    result = session.run(
        """
        MATCH (kp:KnowledgePoint)
        WHERE kp.l1_conflict_points IS NOT NULL
        RETURN kp.id AS kp_id, kp.name AS kp_name,
               kp.l1_conflict_points AS conflicts,
               kp.hsk_level AS hsk_level
        """
    )

    kps = list(result)
    print(f"  找到 {len(kps)} 个 KnowledgePoint 含 l1_conflict_points")

    stats = {"cultural_concept": 0, "language_point": 0,
             "relates_to": 0, "involves": 0, "skipped": 0}

    for record in kps:
        kp_id = record["kp_id"]
        kp_name = record["kp_name"]
        conflicts_raw = record["conflicts"]
        hsk_level = record["hsk_level"]

        # 解析 JSON（可能已是 dict 或 JSON 字符串）
        if isinstance(conflicts_raw, str):
            try:
                conflicts = json.loads(conflicts_raw)
            except json.JSONDecodeError:
                print(f"  [WARN] {kp_id}: l1_conflict_points JSON 解析失败，跳过")
                stats["skipped"] += 1
                continue
        elif isinstance(conflicts_raw, dict):
            conflicts = conflicts_raw
        else:
            stats["skipped"] += 1
            continue

        for lang_code, conflict_desc in conflicts.items():
            if not lang_code or not conflict_desc:
                continue

            lang_name = LANGUAGE_NAME_MAP.get(lang_code, lang_code)
            hc_id = LANGUAGE_TO_HC_ID.get(lang_code, f"hc_{lang_code}")

            # 1. 创建 CulturalConcept 节点
            concept_id = f"cc_{kp_id}_{lang_code}"
            concept_name = f"{kp_name} ({lang_name})"

            session.run(
                """
                MERGE (cc:CulturalConcept {id: $id})
                SET cc.name = $name,
                    cc.knowledge_point_id = $kp_id,
                    cc.home_culture_code = $lang_code,
                    cc.home_culture_id = $hc_id,
                    cc.conflict_description = $conflict_desc,
                    cc.hsk_level = $hsk_level,
                    cc.updated_at = datetime()
                """,
                {
                    "id": concept_id,
                    "name": concept_name,
                    "kp_id": kp_id,
                    "lang_code": lang_code,
                    "hc_id": hc_id,
                    "conflict_desc": conflict_desc,
                    "hsk_level": hsk_level,
                },
            )
            stats["cultural_concept"] += 1

            # 2. 创建 RELATES_TO 关系
            session.run(
                """
                MATCH (kp:KnowledgePoint {id: $kp_id})
                MATCH (cc:CulturalConcept {id: $concept_id})
                MERGE (kp)-[r:RELATES_TO]->(cc)
                SET r.updated_at = datetime()
                """,
                {"kp_id": kp_id, "concept_id": concept_id},
            )
            stats["relates_to"] += 1

            # 3. 创建 LanguagePoint 节点（语言特定语用规则）
            lp_id = f"lp_{kp_id}_{lang_code}"
            lp_name = f"{kp_name} - {lang_name}语用规则"

            session.run(
                """
                MERGE (lp:LanguagePoint {id: $id})
                SET lp.name = $name,
                    lp.language_code = $lang_code,
                    lp.home_culture_id = $hc_id,
                    lp.pragmatic_note = $pragmatic_note,
                    lp.knowledge_point_id = $kp_id,
                    lp.updated_at = datetime()
                """,
                {
                    "id": lp_id,
                    "name": lp_name,
                    "lang_code": lang_code,
                    "hc_id": hc_id,
                    "pragmatic_note": conflict_desc,
                    "kp_id": kp_id,
                },
            )
            stats["language_point"] += 1

            # 4. 创建 INVOLVES 关系
            session.run(
                """
                MATCH (kp:KnowledgePoint {id: $kp_id})
                MATCH (lp:LanguagePoint {id: $lp_id})
                MERGE (kp)-[r:INVOLVES]->(lp)
                SET r.updated_at = datetime()
                """,
                {"kp_id": kp_id, "lp_id": lp_id},
            )
            stats["involves"] += 1

    return stats


def verify_extraction(session):
    """验证提取结果。"""
    print("\n" + "=" * 60)
    print("📊 Layer 1 提取验证")
    print("=" * 60)

    queries = {
        "CulturalConcept 节点数": "MATCH (cc:CulturalConcept) RETURN count(cc) AS cnt",
        "LanguagePoint 节点数": "MATCH (lp:LanguagePoint) RETURN count(lp) AS cnt",
        "RELATES_TO 关系数": "MATCH (:KnowledgePoint)-[r:RELATES_TO]->(:CulturalConcept) RETURN count(r) AS cnt",
        "INVOLVES 关系数": "MATCH (:KnowledgePoint)-[r:INVOLVES]->(:LanguagePoint) RETURN count(r) AS cnt",
    }

    for label, cypher in queries.items():
        result = session.run(cypher)
        print(f"  {label}: {result.single()['cnt']}")

    # 按母语文化圈分布
    print("\n  CulturalConcept 按母语分布:")
    lang_stats = session.run(
        """
        MATCH (cc:CulturalConcept)
        RETURN cc.home_culture_code AS lang, count(cc) AS cnt
        ORDER BY cnt DESC
        """
    ).data()
    for row in lang_stats:
        lang_name = LANGUAGE_NAME_MAP.get(row["lang"], row["lang"])
        print(f"    {lang_name} ({row['lang']}): {row['cnt']} 个概念")


# ============================================================================
# Main
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="Neo4j Layer 1 CulturalConcept 提取脚本")
    parser.add_argument("--dry-run", action="store_true", help="不连接 Neo4j，仅打印配置")
    parser.add_argument("--verify", action="store_true", help="提取后验证")
    args = parser.parse_args()

    print("=" * 60)
    print("🔬 Neo4j Layer 1 CulturalConcept/LanguagePoint 提取")
    print("=" * 60)

    if args.dry_run:
        print("\n🔍 --dry-run 模式，验证 JSON 结构...")
        # 加载 knowledge_graph_seed.json 预览可提取的 conflict_points
        script_dir = Path(__file__).resolve().parent
        seed_path = script_dir / "knowledge_graph_seed.json"
        if seed_path.exists():
            with open(seed_path, "r", encoding="utf-8") as f:
                seed_data = json.load(f)
            total_conflicts = 0
            for domain in seed_data.get("domains", []):
                for scene in domain.get("scenes", []):
                    for task in scene.get("tasks", []):
                        conflicts = task.get("l1_conflict_points", {})
                        if conflicts:
                            lang_list = ", ".join(conflicts.keys())
                            print(f"  {task['id']}: {len(conflicts)} 个语言映射 ({lang_list})")
                            total_conflicts += len(conflicts)
            print(f"\n  📊 总计可提取: {total_conflicts} 个 CulturalConcept + LanguagePoint 节点")
        else:
            print("  ⚠️ knowledge_graph_seed.json 不存在，无法预览")
        return

    # 环境变量
    cfg = get_env_config()
    if not cfg["ok"]:
        print(f"  ❌ 缺少环境变量: {', '.join(cfg['missing'])}")
        sys.exit(1)
    print(f"  ✅ 配置完整 — {cfg['uri']}")

    try:
        from neo4j import GraphDatabase
    except ImportError:
        print("  ❌ 未安装 neo4j 驱动。请运行: pip install neo4j")
        sys.exit(1)

    driver = GraphDatabase.driver(
        cfg["uri"],
        auth=(cfg["user"], cfg["password"]),
        max_connection_pool_size=10,
        connection_acquisition_timeout=15,
    )

    try:
        driver.verify_connectivity()
        print("  ✅ Neo4j 连接成功")
    except Exception as e:
        print(f"  ❌ 连接失败: {e}")
        driver.close()
        sys.exit(1)

    db = cfg["database"] if cfg["database"] != "neo4j" else None

    print("\n[提取] 从 KnowledgePoint.l1_conflict_points 提取节点...")

    try:
        with driver.session(database=db) if db else driver.session() as session:
            stats = extract_cultural_concepts(session)
    except Exception as e:
        print(f"  ❌ 提取出错: {e}")
        driver.close()
        sys.exit(1)

    if args.verify:
        try:
            with driver.session(database=db) if db else driver.session() as s:
                verify_extraction(s)
        except Exception as e:
            print(f"  ⚠️ 验证出错: {e}")

    driver.close()

    print("\n" + "=" * 60)
    print("✅ Layer 1 提取完成！")
    print(f"  CulturalConcept 节点: {stats['cultural_concept']} (MERGE)")
    print(f"  LanguagePoint 节点:   {stats['language_point']} (MERGE)")
    print(f"  RELATES_TO 关系:      {stats['relates_to']} (MERGE)")
    print(f"  INVOLVES 关系:        {stats['involves']} (MERGE)")


if __name__ == "__main__":
    main()
