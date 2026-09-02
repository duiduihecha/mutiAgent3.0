#!/usr/bin/env python3
"""
Neo4j Layer 3 — HSK Language System 种子脚本
=============================================
读取 layer3_links_config.json，执行：
1. 创建 GrammarPoint 节点
2. 建立 REQUIRES_GRAMMAR 关系（KP→GrammarPoint）
3. 自动建立 REQUIRES_VOCAB 关系（KP→HSKWord，按 HSK 等级关联）

环境变量：
  NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD

用法：
  python3 seed_layer3_links.py [--dry-run] [--verify] [--vocab-limit 0]
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


def load_config(path: str) -> dict:
    if not os.path.exists(path):
        raise FileNotFoundError(f"配置文件不存在: {path}")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if "grammar_points" not in data:
        raise ValueError("JSON 缺少 'grammar_points' 字段")
    if "kp_grammar_bindings" not in data:
        raise ValueError("JSON 缺少 'kp_grammar_bindings' 字段")

    return data


def seed_grammar_points(session, grammar_points: list) -> dict:
    """MERGE GrammarPoint 节点。"""
    created = 0
    for gp in grammar_points:
        result = session.run(
            """
            MERGE (gp:GrammarPoint {id: $id})
            SET gp.name = $name,
                gp.name_en = $name_en,
                gp.category = $category,
                gp.hsk_level = $hsk_level,
                gp.updated_at = datetime()
            RETURN gp
            """,
            {
                "id": gp["id"],
                "name": gp["name"],
                "name_en": gp["name_en"],
                "category": gp["category"],
                "hsk_level": gp["hsk_level"],
            },
        )
        if result.single():
            created += 1

    print(f"  ✅ GrammarPoint 节点: {created}/{len(grammar_points)}")
    return {"grammar_points_created": created}


def seed_grammar_bindings(session, bindings: dict) -> dict:
    """为每个 KP 建立 REQUIRES_GRAMMAR 关系。"""
    linked = 0
    skipped_kp = 0
    skipped_gp = 0

    for kp_id, gp_ids in bindings.items():
        # 检查 KP 是否存在
        kp_check = session.run(
            "MATCH (kp:KnowledgePoint {id: $id}) RETURN kp", {"id": kp_id}
        )
        if not kp_check.single():
            print(f"  [WARN] KnowledgePoint 不存在: {kp_id}，跳过")
            skipped_kp += 1
            continue

        for gp_id in gp_ids:
            result = session.run(
                """
                MATCH (kp:KnowledgePoint {id: $kp_id})
                MATCH (gp:GrammarPoint {id: $gp_id})
                MERGE (kp)-[r:REQUIRES_GRAMMAR]->(gp)
                SET r.updated_at = datetime()
                RETURN r
                """,
                {"kp_id": kp_id, "gp_id": gp_id},
            )
            if result.single():
                linked += 1
            else:
                skipped_gp += 1

    print(f"  ✅ REQUIRES_GRAMMAR 关系: {linked}")
    if skipped_kp > 0:
        print(f"  ⚠️  跳过 KP (不存在): {skipped_kp}")
    if skipped_gp > 0:
        print(f"  ⚠️  跳过 GrammarPoint (不存在): {skipped_gp}")

    return {"grammar_links_created": linked, "skipped_kp": skipped_kp}


def seed_vocab_links(session, vocab_limit: int = 0) -> dict:
    """
    自动建立 REQUIRES_VOCAB 关系。
    规则：对每个 KnowledgePoint，查询其 hsk_level，
    将该等级及以下的所有 HSKWord 关联到该 KP。
    vocab_limit=0 表示不限制数量。
    """
    # 获取所有 KP 及其 HSK 等级
    kp_list = session.run(
        """
        MATCH (kp:KnowledgePoint)
        WHERE kp.hsk_level IS NOT NULL
        RETURN kp.id AS kp_id, kp.hsk_level AS level
        """
    ).data()

    if not kp_list:
        print("  [WARN] 未找到带 hsk_level 的 KnowledgePoint 节点")
        return {"vocab_links_created": 0}

    print(f"  📋 找到 {len(kp_list)} 个 KnowledgePoint")

    total_linked = 0
    for kp in kp_list:
        kp_id = kp["kp_id"]
        level = kp["level"]

        cypher = """
        MATCH (kp:KnowledgePoint {id: $kp_id})
        MATCH (hw:HSKWord)
        WHERE hw.level <= $level
        """
        params = {"kp_id": kp_id, "level": level}

        if vocab_limit > 0:
            cypher += """
        WITH kp, hw
        LIMIT $limit
        """
            params["limit"] = vocab_limit

        cypher += """
        MERGE (kp)-[r:REQUIRES_VOCAB]->(hw)
        SET r.updated_at = datetime()
        RETURN count(r) AS cnt
        """

        result = session.run(cypher, params)
        record = result.single()
        cnt = record["cnt"] if record else 0
        total_linked += cnt

        print(f"    {kp_id} (HSK {level}): {cnt} 个词汇链接")

    print(f"  ✅ REQUIRES_VOCAB 关系总计: {total_linked}")
    return {"vocab_links_created": total_linked}


def verify(session):
    """验证 Layer 3 链接状态。"""
    print("\n" + "=" * 60)
    print("📊 Layer 3 — HSK Language System 验证")
    print("=" * 60)

    queries = {
        "GrammarPoint 节点数": "MATCH (gp:GrammarPoint) RETURN count(gp) AS cnt",
        "REQUIRES_GRAMMAR 关系数": (
            "MATCH (:KnowledgePoint)-[r:REQUIRES_GRAMMAR]->(:GrammarPoint) "
            "RETURN count(r) AS cnt"
        ),
        "REQUIRES_VOCAB 关系数": (
            "MATCH (:KnowledgePoint)-[r:REQUIRES_VOCAB]->(:HSKWord) "
            "RETURN count(r) AS cnt"
        ),
    }

    for label, cypher in queries.items():
        result = session.run(cypher)
        print(f"  {label}: {result.single()['cnt']}")

    # 按类别统计 GrammarPoint
    print("\n  GrammarPoint 按类别分布:")
    cat_stats = session.run(
        """
        MATCH (gp:GrammarPoint)
        RETURN gp.category AS category, count(gp) AS cnt
        ORDER BY cnt DESC
        """
    ).data()
    for row in cat_stats:
        print(f"    {row['category']}: {row['cnt']}")

    # 每个 KP 的语法点数量
    print("\n  KnowledgePoint 语法点覆盖:")
    kp_stats = session.run(
        """
        MATCH (kp:KnowledgePoint)-[:REQUIRES_GRAMMAR]->(gp:GrammarPoint)
        RETURN kp.id AS kp_id, kp.name AS kp_name, collect(gp.name) AS grammar_points
        ORDER BY kp_id
        """
    ).data()
    for row in kp_stats:
        gp_list = row["grammar_points"]
        print(f"    {row['kp_id']} ({row['kp_name']}): {len(gp_list)} 个语法点 — {', '.join(gp_list[:6])}{'...' if len(gp_list) > 6 else ''}")

    # 每个 KP 的词汇量
    print("\n  KnowledgePoint 词汇覆盖 (前10):")
    vocab_stats = session.run(
        """
        MATCH (kp:KnowledgePoint)-[:REQUIRES_VOCAB]->(hw:HSKWord)
        RETURN kp.id AS kp_id, kp.name AS kp_name, count(hw) AS word_count
        ORDER BY word_count DESC
        LIMIT 10
        """
    ).data()
    for row in vocab_stats:
        print(f"    {row['kp_id']} ({row['kp_name']}): {row['word_count']} 个词汇")


def main():
    parser = argparse.ArgumentParser(description="Neo4j Layer 3 HSK 语言系统种子脚本")
    parser.add_argument("--json", default=None, help="layer3_links_config.json 路径")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--vocab-limit", type=int, default=0,
                        help="每个 KP 的词汇链接上限，0=不限制")
    parser.add_argument("--skip-vocab", action="store_true",
                        help="跳过 REQUIRES_VOCAB 自动链接（仅处理 GrammarPoint）")
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    json_path = args.json or str(script_dir / "layer3_links_config.json")

    print("=" * 60)
    print("📚 Neo4j Layer 3 — HSK 语言系统注入")
    print("=" * 60)
    print(f"📄 配置文件: {json_path}")

    try:
        config = load_config(json_path)
        gp_count = len(config.get("grammar_points", []))
        binding_count = len(config.get("kp_grammar_bindings", {}))
        print(f"  ✅ JSON 合法 — {gp_count} 个 GrammarPoint, {binding_count} 个 KP 绑定")
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
    session_kwargs = {"database": db} if db else {}

    try:
        with driver.session(**session_kwargs) as session:
            print("\n--- 1. GrammarPoint 节点 ---")
            stats_gp = seed_grammar_points(session, config["grammar_points"])

            print("\n--- 2. REQUIRES_GRAMMAR 绑定 ---")
            stats_bind = seed_grammar_bindings(
                session, config["kp_grammar_bindings"]
            )

            stats_vocab = {}
            if not args.skip_vocab:
                print(f"\n--- 3. REQUIRES_VOCAB 自动链接 (limit={args.vocab_limit or '无限制'}) ---")
                stats_vocab = seed_vocab_links(session, args.vocab_limit)
            else:
                print("\n--- 3. REQUIRES_VOCAB: 跳过 (--skip-vocab) ---")

        if args.verify:
            with driver.session(**session_kwargs) as s:
                verify(s)

    except Exception as e:
        print(f"  ❌ 注入出错: {e}")
        import traceback; traceback.print_exc()
        driver.close()
        sys.exit(1)

    driver.close()

    print("\n" + "=" * 60)
    print("✅ Layer 3 注入完成！")
    print(f"  GrammarPoint 节点:    {stats_gp.get('grammar_points_created', 0)}")
    print(f"  REQUIRES_GRAMMAR 关系: {stats_bind.get('grammar_links_created', 0)}")
    if not args.skip_vocab:
        print(f"  REQUIRES_VOCAB 关系:   {stats_vocab.get('vocab_links_created', 0)}")


if __name__ == "__main__":
    main()
