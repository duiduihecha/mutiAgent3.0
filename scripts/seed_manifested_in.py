#!/usr/bin/env python3
"""
MANIFESTED_IN 边导入脚本
=========================
从 manifested_in_output_2.0.json 读取 96 条标注数据，
写入 Neo4j 的 CulturalDimension-[MANIFESTED_IN]->HomeCulture 边。

环境变量（与 seed_neo4j.py 一致）：
  NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD

用法：
  python3 scripts/seed_manifested_in.py
  python3 scripts/seed_manifested_in.py --dry-run
  python3 scripts/seed_manifested_in.py --verify
"""

import json
import os
import sys
import argparse

# Neo4j 驱动是可选的（dry-run 不需要）
try:
    from neo4j import GraphDatabase
    HAS_NEO4J = True
except ImportError:
    HAS_NEO4J = False


def load_env_config():
    """读取 Neo4j 环境变量。"""
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    if key.strip() in ("NEO4J_URI", "NEO4J_USERNAME", "NEO4J_PASSWORD"):
                        os.environ.setdefault(key.strip(), val.strip())

    return {
        "uri": os.getenv("NEO4J_URI", ""),
        "user": os.getenv("NEO4J_USERNAME", ""),
        "password": os.getenv("NEO4J_PASSWORD", ""),
    }


def load_json(path: str) -> list:
    """加载标注 JSON 文件。"""
    with open(path, encoding="utf-8") as f:
        content = f.read()

    # 处理可能的 markdown 代码块
    if "```" in content:
        parts = content.split("```")
        for p in parts:
            p = p.strip()
            if p.startswith("json"):
                p = p[4:]
            if p.startswith("["):
                content = p
                break

    data = json.loads(content)
    if not isinstance(data, list):
        raise ValueError("JSON 必须是数组")
    return data


def import_to_neo4j(entries: list, cfg: dict, dry_run: bool = False):
    """将条目导入 Neo4j，使用 MERGE 确保幂等。"""
    if dry_run:
        print("🔍 DRY RUN 模式 — 不连接数据库\n")
        for i, e in enumerate(entries):
            print(f"  [{i+1}/{len(entries)}] ({e['dimension_id']})-[MANIFESTED_IN]->({e['culture_id']}) "
                  f"weight={e['weight']} manifestation={e['manifestation'][:30]}...")
        print(f"\n✅ 共 {len(entries)} 条，结构校验通过")
        return

    if not HAS_NEO4J:
        print("❌ 需要安装 neo4j 驱动: pip install neo4j")
        sys.exit(1)

    driver = GraphDatabase.driver(cfg["uri"], auth=(cfg["user"], cfg["password"]))
    success = 0
    errors = 0

    try:
        driver.verify_connectivity()
        print(f"🔗 Neo4j 连接成功: {cfg['uri'][:40]}...\n")
    except Exception as ex:
        print(f"❌ Neo4j 连接失败: {ex}")
        sys.exit(1)

    with driver.session() as session:
        for i, e in enumerate(entries):
            dim_id = e["dimension_id"]
            culture_id = e["culture_id"]
            key = f"{dim_id}/{culture_id}"
            print(f"[{i+1}/{len(entries)}] {key} ...", end=" ", flush=True)

            try:
                result = session.run(
                    """
                    MATCH (cd:CulturalDimension {id: $dim_id})
                    MATCH (hc:HomeCulture {id: $culture_id})
                    MERGE (cd)-[r:MANIFESTED_IN]->(hc)
                    SET r.weight = $weight,
                        r.manifestation = $manifestation,
                        r.conflict_with_chinese = $conflict_with_chinese,
                        r.pragmatic_tip = $pragmatic_tip,
                        r.example_scenario = $example_scenario
                    RETURN cd.name AS dim_name, hc.name AS culture_name
                    """,
                    dim_id=dim_id,
                    culture_id=culture_id,
                    weight=e["weight"],
                    manifestation=e["manifestation"],
                    conflict_with_chinese=e["conflict_with_chinese"],
                    pragmatic_tip=e["pragmatic_tip"],
                    example_scenario=e["example_scenario"],
                )
                record = result.single()
                if record:
                    print(f"✅ {record['dim_name']} → {record['culture_name']}")
                    success += 1
                else:
                    print("⚠️ 节点未找到（请确认 CulturalDimension 和 HomeCulture 已导入）")
                    errors += 1

            except Exception as ex:
                print(f"❌ {ex}")
                errors += 1

    driver.close()
    print(f"\n{'='*60}")
    print(f"  写入成功: {success} 条")
    if errors:
        print(f"  失败: {errors} 条")
    print(f"{'='*60}")


def verify(cfg: dict):
    """验证 Neo4j 中 MANIFESTED_IN 边的完整性。"""
    if not HAS_NEO4J:
        print("❌ 需要安装 neo4j 驱动: pip install neo4j")
        sys.exit(1)

    driver = GraphDatabase.driver(cfg["uri"], auth=(cfg["user"], cfg["password"]))

    try:
        driver.verify_connectivity()
    except Exception as ex:
        print(f"❌ Neo4j 连接失败: {ex}")
        sys.exit(1)

    with driver.session() as session:
        # 总边数
        result = session.run("MATCH ()-[r:MANIFESTED_IN]->() RETURN count(r) AS cnt")
        total = result.single()["cnt"]
        print(f"MANIFESTED_IN 边总数: {total}")

        # 按维度分布
        result = session.run(
            """
            MATCH (cd:CulturalDimension)-[r:MANIFESTED_IN]->(hc:HomeCulture)
            RETURN cd.id AS dim, cd.name AS dim_name, count(r) AS cnt
            ORDER BY dim
            """
        )
        print("\n按维度分布:")
        for rec in result:
            bar = "█" * rec["cnt"]
            print(f"  {rec['dim']} ({rec['dim_name']}): {rec['cnt']} {bar}")

        # 按文化圈分布
        result = session.run(
            """
            MATCH (cd:CulturalDimension)-[r:MANIFESTED_IN]->(hc:HomeCulture)
            RETURN hc.id AS culture, hc.name AS culture_name, count(r) AS cnt
            ORDER BY culture
            """
        )
        print("\n按文化圈分布:")
        for rec in result:
            bar = "█" * rec["cnt"]
            print(f"  {rec['culture']} ({rec['culture_name']}): {rec['cnt']} {bar}")

        # 检查边属性完整性
        result = session.run(
            """
            MATCH ()-[r:MANIFESTED_IN]->()
            RETURN count(r) AS total,
                   count(r.weight) AS has_weight,
                   count(r.manifestation) AS has_manifestation,
                   count(r.conflict_with_chinese) AS has_conflict,
                   count(r.pragmatic_tip) AS has_tip,
                   count(r.example_scenario) AS has_scenario
            """
        )
        rec = result.single()
        print(f"\n边属性完整性:")
        print(f"  总数: {rec['total']}")
        print(f"  weight: {rec['has_weight']}/{rec['total']}")
        print(f"  manifestation: {rec['has_manifestation']}/{rec['total']}")
        print(f"  conflict_with_chinese: {rec['has_conflict']}/{rec['total']}")
        print(f"  pragmatic_tip: {rec['has_tip']}/{rec['total']}")
        print(f"  example_scenario: {rec['has_scenario']}/{rec['total']}")

    driver.close()


def main():
    parser = argparse.ArgumentParser(description="MANIFESTED_IN 边导入 Neo4j")
    parser.add_argument("--input", default=None, help="JSON 文件路径（默认自动查找）")
    parser.add_argument("--dry-run", action="store_true", help="仅校验 JSON，不连接数据库")
    parser.add_argument("--verify", action="store_true", help="验证已导入的 MANIFESTED_IN 边")
    args = parser.parse_args()

    cfg = load_env_config()

    if args.verify:
        if not cfg["uri"]:
            print("❌ 缺少 NEO4J_URI 环境变量")
            sys.exit(1)
        verify(cfg)
        return

    # 自动查找输入文件
    if args.input:
        json_path = args.input
    else:
        task_dir = os.path.join(os.path.dirname(__file__), "..", "tasks", "manifested_in_annotation")
        candidates = [
            os.path.join(task_dir, "manifested_in_output_2.0.json"),
            os.path.join(task_dir, "manifested_in_output.json"),
        ]
        json_path = None
        for c in candidates:
            if os.path.exists(c):
                json_path = c
                break
        if not json_path:
            print("❌ 未找到输入 JSON，请用 --input 指定")
            sys.exit(1)

    print(f"📄 读取: {json_path}")
    entries = load_json(json_path)
    print(f"📊 共 {len(entries)} 条标注记录")

    # 基本校验
    dim_ids = set(e["dimension_id"] for e in entries)
    culture_ids = set(e["culture_id"] for e in entries)
    print(f"   维度: {len(dim_ids)} 个 ({', '.join(sorted(dim_ids))})")
    print(f"   文化圈: {len(culture_ids)} 个 ({', '.join(sorted(culture_ids))})")

    if len(dim_ids) < 12:
        print(f"⚠️ 仅 {len(dim_ids)}/12 个维度")
    if len(culture_ids) < 8:
        print(f"⚠️ 仅 {len(culture_ids)}/8 个文化圈")

    if not args.dry_run and not cfg["uri"]:
        print("❌ 缺少 NEO4J_URI 环境变量，请检查 .env。或使用 --dry-run")
        sys.exit(1)

    import_to_neo4j(entries, cfg, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
