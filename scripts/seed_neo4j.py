#!/usr/bin/env python3
"""
Neo4j 三级语用任务图谱自动注入脚本
=============================================
读取 knowledge_graph_seed.json，幂等写入 Neo4j 图数据库。
构建 Domain-[HAS_SCENE]->Scene-[HAS_KNOWLEDGE_POINT]->KnowledgePoint 完整层级。

环境变量（必需）：
  NEO4J_URI       — Neo4j 数据库 URI，例如 neo4j+s://xxx.databases.neo4j.io
  NEO4J_USERNAME  — 用户名
  NEO4J_PASSWORD  — 密码

可选环境变量：
  SEED_JSON_PATH  — JSON 种子文件路径，默认 ./knowledge_graph_seed.json
  NEO4J_DATABASE  — 数据库名，默认 neo4j (Aura 实例自动忽略)

用法：
  pip install neo4j
  export NEO4J_URI="neo4j+s://xxx.databases.neo4j.io"
  export NEO4J_USERNAME="neo4j"
  export NEO4J_PASSWORD="your-password"
  python3 seed_neo4j.py

验证：
  python3 seed_neo4j.py --dry-run    # 仅校验 JSON，不连接 Neo4j
  python3 seed_neo4j.py --verify     # 注入后验证图谱完整性
"""

import json
import os
import sys
import argparse
from pathlib import Path


# ============================================================================
# 配置校验
# ============================================================================

def get_env_config() -> dict:
    """读取并校验必要的环境变量。"""
    uri = os.getenv("NEO4J_URI", "").strip()
    user = os.getenv("NEO4J_USERNAME", "").strip()
    password = os.getenv("NEO4J_PASSWORD", "").strip()
    database = os.getenv("NEO4J_DATABASE", "neo4j").strip()

    missing = []
    if not uri:
        missing.append("NEO4J_URI")
    if not user:
        missing.append("NEO4J_USERNAME")
    if not password:
        missing.append("NEO4J_PASSWORD")

    return {
        "uri": uri,
        "user": user,
        "password": password,
        "database": database,
        "missing": missing,
        "ok": len(missing) == 0,
    }


# ============================================================================
# JSON 加载与校验
# ============================================================================

def load_seed_json(path: str) -> dict:
    """加载并校验 JSON 种子文件结构。"""
    if not os.path.exists(path):
        raise FileNotFoundError(f"种子文件不存在: {path}")

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 结构校验
    if "domains" not in data:
        raise ValueError("JSON 缺少顶层 'domains' 字段")

    domains = data["domains"]
    if not isinstance(domains, list):
        raise ValueError("'domains' 必须是数组")

    required_domain = ["id", "name", "name_en", "icon", "description"]
    required_scene = ["id", "name", "name_en", "icon", "description"]
    required_task = ["id", "name", "pragmatic_intent", "cultural_complexity", "high_context", "hsk_level"]

    for i, d in enumerate(domains):
        for f in required_domain:
            if f not in d:
                raise ValueError(f"domains[{i}] 缺少字段 '{f}'")
        if not isinstance(d.get("scenes"), list):
            raise ValueError(f"domains[{i}].scenes 必须是数组")

        for j, s in enumerate(d["scenes"]):
            for f in required_scene:
                if f not in s:
                    raise ValueError(f"domains[{i}].scenes[{j}] 缺少字段 '{f}'")
            if not isinstance(s.get("tasks"), list):
                raise ValueError(f"domains[{i}].scenes[{j}].tasks 必须是数组")

            for k, t in enumerate(s["tasks"]):
                for f in required_task:
                    if f not in t:
                        raise ValueError(f"domains[{i}].scenes[{j}].tasks[{k}] 缺少字段 '{f}'")

    return data


# ============================================================================
# Neo4j 注入逻辑
# ============================================================================

def create_constraints(session):
    """创建唯一性约束（幂等——已存在则跳过）。"""
    constraints = [
        "CREATE CONSTRAINT domain_id_unique IF NOT EXISTS FOR (d:Domain) REQUIRE d.id IS UNIQUE",
        "CREATE CONSTRAINT scene_id_unique IF NOT EXISTS FOR (s:Scene) REQUIRE s.id IS UNIQUE",
        "CREATE CONSTRAINT kp_id_unique IF NOT EXISTS FOR (kp:KnowledgePoint) REQUIRE kp.id IS UNIQUE",
    ]
    for stmt in constraints:
        try:
            session.run(stmt)
        except Exception as e:
            # neo4j 5.x+ 的 "IF NOT EXISTS" 在其不支持的情况下回退
            print(f"  [WARN] 约束创建异常（可能已存在）: {e}")


def seed_domain(session, domain: dict) -> dict:
    """写入单个 Domain 及其所有 Scene 和 KnowledgePoint。返回统计计数。"""
    stats = {"domain": 0, "scene": 0, "task": 0, "rel_scene": 0, "rel_kp": 0}

    # ---- MERGE Domain ----
    session.run(
        """
        MERGE (d:Domain {id: $id})
        SET d.name = $name,
            d.name_en = $name_en,
            d.icon = $icon,
            d.description = $description,
            d.updated_at = datetime()
        """,
        {
            "id": domain["id"],
            "name": domain["name"],
            "name_en": domain["name_en"],
            "icon": domain["icon"],
            "description": domain["description"],
        },
    )
    stats["domain"] = 1

    # ---- MERGE Scenes and Tasks ----
    for scene in domain.get("scenes", []):
        session.run(
            """
            MERGE (s:Scene {id: $id})
            SET s.name = $name,
                s.name_en = $name_en,
                s.icon = $icon,
                s.description = $description,
                s.updated_at = datetime()
            """,
            {
                "id": scene["id"],
                "name": scene["name"],
                "name_en": scene["name_en"],
                "icon": scene["icon"],
                "description": scene["description"],
            },
        )
        stats["scene"] += 1

        # MERGE Domain-[HAS_SCENE]->Scene
        session.run(
            """
            MATCH (d:Domain {id: $domain_id})
            MATCH (s:Scene {id: $scene_id})
            MERGE (d)-[r:HAS_SCENE]->(s)
            SET r.updated_at = datetime()
            """,
            {"domain_id": domain["id"], "scene_id": scene["id"]},
        )
        stats["rel_scene"] += 1

        for task in scene.get("tasks", []):
            l1_conflicts_json = json.dumps(
                task.get("l1_conflict_points", {}), ensure_ascii=False
            )

            session.run(
                """
                MERGE (kp:KnowledgePoint {id: $id})
                SET kp.name = $name,
                    kp.pragmatic_intent = $pragmatic_intent,
                    kp.cultural_complexity = $cultural_complexity,
                    kp.high_context = $high_context,
                    kp.hsk_level = $hsk_level,
                    kp.l1_conflict_points = $l1_conflict_points,
                    kp.updated_at = datetime()
                """,
                {
                    "id": task["id"],
                    "name": task["name"],
                    "pragmatic_intent": task["pragmatic_intent"],
                    "cultural_complexity": task["cultural_complexity"],
                    "high_context": task["high_context"],
                    "hsk_level": task["hsk_level"],
                    "l1_conflict_points": l1_conflicts_json,
                },
            )
            stats["task"] += 1

            # MERGE Scene-[HAS_KNOWLEDGE_POINT]->KnowledgePoint
            session.run(
                """
                MATCH (s:Scene {id: $scene_id})
                MATCH (kp:KnowledgePoint {id: $kp_id})
                MERGE (s)-[r:HAS_KNOWLEDGE_POINT]->(kp)
                SET r.updated_at = datetime()
                """,
                {"scene_id": scene["id"], "kp_id": task["id"]},
            )
            stats["rel_kp"] += 1

    return stats


def verify_graph(session) -> bool:
    """验证图谱完整性：检查 Domain/Scene/KnowledgePoint 节点数和关系链。"""
    print("\n" + "=" * 60)
    print("📊 图谱完整性验证")
    print("=" * 60)

    queries = {
        "Domain 节点数": "MATCH (d:Domain) RETURN count(d) AS cnt",
        "Scene 节点数": "MATCH (s:Scene) RETURN count(s) AS cnt",
        "KnowledgePoint 节点数": "MATCH (kp:KnowledgePoint) RETURN count(kp) AS cnt",
        "HAS_SCENE 关系数": "MATCH (:Domain)-[r:HAS_SCENE]->(:Scene) RETURN count(r) AS cnt",
        "HAS_KNOWLEDGE_POINT 关系数": "MATCH (:Scene)-[r:HAS_KNOWLEDGE_POINT]->(:KnowledgePoint) RETURN count(r) AS cnt",
    }

    all_ok = True
    for label, cypher in queries.items():
        result = session.run(cypher)
        count = result.single()["cnt"]
        print(f"  {label}: {count}")

    # 检查孤立的 Scene（没有 Domain）
    orphan_scenes = session.run(
        "MATCH (s:Scene) WHERE NOT (:Domain)-[:HAS_SCENE]->(s) RETURN s.id AS sid"
    ).data()
    if orphan_scenes:
        print(f"\n  ⚠️  孤立 Scene（无 Domain 关联）: {[r['sid'] for r in orphan_scenes]}")
        all_ok = False

    # 检查孤立的 KnowledgePoint（没有 Scene）
    orphan_kps = session.run(
        "MATCH (kp:KnowledgePoint) WHERE NOT (:Scene)-[:HAS_KNOWLEDGE_POINT]->(kp) RETURN kp.id AS kid"
    ).data()
    if orphan_kps:
        print(f"\n  ⚠️  孤立 KnowledgePoint（无 Scene 关联）: {[r['kid'] for r in orphan_kps]}")
        all_ok = False

    # 列出每个 Domain 下的完整层级数量
    print("\n  Domain 层级统计:")
    hierarchy = session.run(
        """
        MATCH (d:Domain)-[:HAS_SCENE]->(s:Scene)-[:HAS_KNOWLEDGE_POINT]->(kp:KnowledgePoint)
        RETURN d.id AS domain, d.name AS name,
               count(DISTINCT s) AS scene_count,
               count(kp) AS task_count
        ORDER BY d.name
        """
    ).data()
    for row in hierarchy:
        print(f"    {row['domain']:20s} ({row['name']:8s}): {row['scene_count']} scenes, {row['task_count']} tasks")

    if all_ok:
        print("\n✅ 图谱验证通过")
    else:
        print("\n❌ 图谱验证发现问题，请检查上述告警")
    return all_ok


# ============================================================================
# Main
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Neo4j 三级语用任务图谱种子注入脚本"
    )
    parser.add_argument(
        "--json", default=None,
        help="JSON 种子文件路径 (默认: ./knowledge_graph_seed.json)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="仅校验 JSON 文件结构，不连接 Neo4j"
    )
    parser.add_argument(
        "--verify", action="store_true",
        help="注入后运行图谱完整性验证"
    )
    args = parser.parse_args()

    # 解析路径
    script_dir = Path(__file__).resolve().parent
    json_path = args.json or str(script_dir / "knowledge_graph_seed.json")

    print("=" * 60)
    print("🚀 Neo4j 三级语用任务图谱种子注入")
    print("=" * 60)
    print(f"📄 种子文件: {json_path}")

    # Step 1: 加载 JSON
    print("\n[1/3] 加载并校验 JSON...")
    try:
        data = load_seed_json(json_path)
        total_scenes = sum(len(d.get("scenes", [])) for d in data["domains"])
        total_tasks = sum(
            len(s.get("tasks", []))
            for d in data["domains"]
            for s in d.get("scenes", [])
        )
        print(f"  ✅ JSON 结构合法 — {len(data['domains'])} 个 Domain, "
              f"{total_scenes} 个 Scene, {total_tasks} 个 KnowledgePoint")
    except Exception as e:
        print(f"  ❌ JSON 校验失败: {e}")
        sys.exit(1)

    if args.dry_run:
        print("\n🔍 --dry-run 模式，跳过 Neo4j 连接。")
        return

    # Step 2: 检查环境变量
    print("\n[2/3] 检查 Neo4j 连接配置...")
    cfg = get_env_config()
    if not cfg["ok"]:
        print(f"  ❌ 缺少环境变量: {', '.join(cfg['missing'])}")
        print("\n  请设置以下环境变量后重试：")
        print("    export NEO4J_URI='neo4j+s://xxx.databases.neo4j.io'")
        print("    export NEO4J_USERNAME='neo4j'")
        print("    export NEO4J_PASSWORD='your-password'")
        sys.exit(1)
    print(f"  ✅ 配置完整 — 连接目标: {cfg['uri']}")

    # Step 3: 连接 Neo4j 并注入
    print("\n[3/3] 连接 Neo4j 并注入数据...")

    try:
        from neo4j import GraphDatabase, Session
    except ImportError:
        print("  ❌ 未安装 neo4j 驱动。请运行: pip install neo4j")
        sys.exit(1)

    driver = GraphDatabase.driver(
        cfg["uri"],
        auth=(cfg["user"], cfg["password"]),
        max_connection_pool_size=10,
        connection_acquisition_timeout=15,
    )

    # 测试连接
    try:
        driver.verify_connectivity()
        print("  ✅ Neo4j 连接成功")
    except Exception as e:
        print(f"  ❌ Neo4j 连接失败: {e}")
        driver.close()
        sys.exit(1)

    # 确定数据库名 (Aura 实例不需要指定 database 或使用默认)
    db = cfg["database"] if cfg["database"] != "neo4j" else None

    total_stats = {"domain": 0, "scene": 0, "task": 0, "rel_scene": 0, "rel_kp": 0}

    try:
        with driver.session(database=db) if db else driver.session() as session:
            # 创建索引和约束
            print("  📌 创建唯一性约束...")
            create_constraints(session)

            # 逐 Domain 注入
            for domain in data["domains"]:
                has_content = any(
                    len(s.get("tasks", [])) > 0 for s in domain.get("scenes", [])
                )
                marker = "📦" if has_content else "📁"
                print(f"  {marker} 处理 Domain: {domain['id']} ({domain['name']})"
                      f"{' — 含完整数据' if has_content else ' — 骨架（无Scene）'}")
                stats = seed_domain(session, domain)
                for k, v in stats.items():
                    total_stats[k] += v

    except Exception as e:
        print(f"\n❌ 注入过程出错: {e}")
        driver.close()
        sys.exit(1)

    driver.close()

    # 汇总结论
    print("\n" + "=" * 60)
    print("✅ 注入完成！")
    print("=" * 60)
    print(f"  Domain 节点:        {total_stats['domain']} (MERGE)")
    print(f"  Scene 节点:         {total_stats['scene']} (MERGE)")
    print(f"  KnowledgePoint 节点: {total_stats['task']} (MERGE)")
    print(f"  HAS_SCENE 关系:     {total_stats['rel_scene']} (MERGE)")
    print(f"  HAS_KNOWLEDGE_POINT 关系: {total_stats['rel_kp']} (MERGE)")

    # 可选验证
    if args.verify:
        try:
            with driver.session(database=db) if db else driver.session() as s:
                verify_graph(s)
        except Exception as e:
            print(f"⚠️  验证过程出错: {e}")

    print("\n💡 提示：运行 python3 seed_neo4j.py --verify 可随时验证图谱完整性。")


if __name__ == "__main__":
    main()
