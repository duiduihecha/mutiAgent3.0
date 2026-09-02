#!/usr/bin/env python3
"""
Neo4j HSK 词汇种子注入脚本
=============================
读取 src/data/hsk_word_new.jsonl，幂等写入 Neo4j 图数据库。
为每个 HSK 词汇创建 HSKWord 节点，并创建 GrammarPoint (词性) 节点。

环境变量（必需）：
  NEO4J_URI       — Neo4j 数据库 URI
  NEO4J_USERNAME  — 用户名
  NEO4J_PASSWORD  — 密码

可选环境变量：
  HSK_JSONL_PATH  — JSONL 文件路径，默认 ../src/data/hsk_word_new.jsonl
  NEO4J_DATABASE  — 数据库名，默认 neo4j

用法：
  pip install neo4j
  export NEO4J_URI="neo4j+s://xxx.databases.neo4j.io"
  export NEO4J_USERNAME="neo4j"
  export NEO4J_PASSWORD="your-password"
  python3 seed_hsk_vocab.py
"""

import json
import os
import sys
import argparse
from pathlib import Path
from collections import defaultdict


# ============================================================================
# 配置
# ============================================================================

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
# JSONL 加载
# ============================================================================

def load_hsk_jsonl(path: str) -> list[dict]:
    """加载 HSK 词汇 JSONL 文件并返回词条列表。"""
    if not os.path.exists(path):
        raise FileNotFoundError(f"HSK JSONL 文件不存在: {path}")

    words = []
    with open(path, "r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                # 基本字段校验
                if "word" not in obj or "hsk_level" not in obj:
                    print(f"  [WARN] 第 {line_no} 行缺少 word/hsk_level 字段，跳过")
                    continue
                words.append(obj)
            except json.JSONDecodeError as e:
                print(f"  [WARN] 第 {line_no} 行 JSON 解析失败: {e}，跳过")

    return words


# ============================================================================
# 词性推断
# ============================================================================

# 基于 HSK 词汇的字面特征做简单词性推断
# 这只是粗粒度分类，供 GrammarPoint 节点使用
POS_PATTERNS = [
    # (关键词/后缀, 词性, 英文名)
    ("们", "pronoun_suffix", "代词后缀"),
    ("的", "particle_de", "的-定语标记"),
    ("地", "particle_di", "地-状语标记"),
    ("得", "particle_de2", "得-补语标记"),
    ("了", "particle_le", "了-完成体"),
    ("过", "particle_guo", "过-经验体"),
    ("着", "particle_zhe", "着-进行体"),
    ("吗", "particle_ma", "吗-疑问"),
    ("呢", "particle_ne", "呢-语气"),
    ("吧", "particle_ba", "吧-建议/推测"),
    ("啊", "particle_a", "啊-语气"),
    ("被", "preposition_bei", "被-被动标记"),
    ("把", "preposition_ba", "把-处置式"),
    ("从", "preposition_cong", "从-起点"),
    ("在", "preposition_zai", "在-位置"),
    ("到", "preposition_dao", "到-终点"),
    ("给", "preposition_gei", "给-与格"),
    ("对", "preposition_dui", "对-指向"),
    ("跟", "preposition_gen", "跟-伴随"),
    ("和", "conjunction_he", "和-并列"),
    ("或者", "conjunction_huozhe", "或者-选择"),
    ("但是", "conjunction_danshi", "但是-转折"),
    ("因为", "conjunction_yinwei", "因为-原因"),
    ("所以", "conjunction_suoyi", "所以-结果"),
    ("如果", "conjunction_ruguo", "如果-条件"),
    ("虽然", "conjunction_suiran", "虽然-让步"),
    ("非常", "adverb_feichang", "程度副词"),
    ("很", "adverb_hen", "程度副词"),
    ("都", "adverb_dou", "范围副词"),
    ("也", "adverb_ye", "类同副词"),
    ("不", "adverb_bu", "否定副词"),
    ("没", "adverb_mei", "否定副词"),
    ("正在", "adverb_zhengzai", "进行副词"),
    ("已经", "adverb_yijing", "已然副词"),
    ("就", "adverb_jiu", "关联副词"),
    ("才", "adverb_cai", "关联副词"),
    ("再", "adverb_zai2", "重复副词"),
    ("更", "adverb_geng", "比较副词"),
    ("最", "adverb_zui", "最高级副词"),
    ("一", "numeral_yi", "数词"),
    ("二", "numeral_er", "数词"),
    ("三", "numeral_san", "数词"),
    ("个", "measure_word_ge", "通用量词"),
    ("本", "measure_word_ben", "量词-书本"),
    ("张", "measure_word_zhang", "量词-平面"),
    ("条", "measure_word_tiao", "量词-长条"),
    ("次", "measure_word_ci", "量词-次数"),
    ("件", "measure_word_jian", "量词-事情/衣物"),
]


def infer_pos(word: str) -> tuple[str, str]:
    """基于字面特征推断词性。返回 (pos_id, pos_label)。"""
    # 检查是否匹配已知模式
    for suffix, pos_id, pos_label in POS_PATTERNS:
        if word == suffix or word.endswith(suffix):
            return pos_id, pos_label
    # 默认归类为实词
    if len(word) == 1:
        return "character", "单字"
    return "content_word", "实词"


# ============================================================================
# Neo4j 注入逻辑
# ============================================================================

BATCH_SIZE = 500


def seed_hsk_vocabulary(session, words: list[dict]) -> dict:
    """批量写入 HSKWord 和 GrammarPoint 节点。返回统计计数。"""
    stats = {"hsk_word": 0, "grammar_point": 0, "skipped": 0}
    created_grammar_points = set()

    total = len(words)
    for batch_start in range(0, total, BATCH_SIZE):
        batch = words[batch_start:batch_start + BATCH_SIZE]
        for w in batch:
            word_text = w["word"]
            level = int(w["hsk_level"])

            # 推断词性
            pos_id, pos_label = infer_pos(word_text)
            grammar_point_id = f"gp_{pos_id}"

            # 创建 GrammarPoint 节点（幂等）
            if grammar_point_id not in created_grammar_points:
                session.run(
                    """
                    MERGE (gp:GrammarPoint {id: $id})
                    SET gp.name = $name,
                        gp.name_en = $name_en,
                        gp.category = 'pos',
                        gp.updated_at = datetime()
                    """,
                    {"id": grammar_point_id, "name": pos_label, "name_en": pos_id},
                )
                created_grammar_points.add(grammar_point_id)
                stats["grammar_point"] += 1

            # 构建 word_id (去重标识)
            word_id = f"hsk_{level}_{word_text}"

            # 创建 HSKWord 节点
            session.run(
                """
                MERGE (hw:HSKWord {id: $id})
                SET hw.lemma = $lemma,
                    hw.level = $level,
                    hw.pos = $pos,
                    hw.updated_at = datetime()
                """,
                {"id": word_id, "lemma": word_text, "level": level, "pos": pos_id},
            )

            # 关联 GrammarPoint
            session.run(
                """
                MATCH (hw:HSKWord {id: $word_id})
                MATCH (gp:GrammarPoint {id: $gp_id})
                MERGE (hw)-[r:HAS_POS]->(gp)
                SET r.updated_at = datetime()
                """,
                {"word_id": word_id, "gp_id": grammar_point_id},
            )
            stats["hsk_word"] += 1

        pct = min(100, int((batch_start + len(batch)) / total * 100))
        print(f"  ... {pct}% ({batch_start + len(batch)}/{total})")

    return stats


def verify_hsk_seed(session):
    """验证 HSK 词汇注入完整性。"""
    print("\n" + "=" * 60)
    print("📊 HSK 词汇注入验证")
    print("=" * 60)

    queries = {
        "HSKWord 节点数": "MATCH (hw:HSKWord) RETURN count(hw) AS cnt",
        "GrammarPoint 节点数": "MATCH (gp:GrammarPoint) RETURN count(gp) AS cnt",
        "HAS_POS 关系数": "MATCH (:HSKWord)-[r:HAS_POS]->(:GrammarPoint) RETURN count(r) AS cnt",
    }

    for label, cypher in queries.items():
        result = session.run(cypher)
        count = result.single()["cnt"]
        print(f"  {label}: {count}")

    # 按 HSK 等级统计
    print("\n  按等级分布:")
    level_stats = session.run(
        "MATCH (hw:HSKWord) RETURN hw.level AS level, count(hw) AS cnt ORDER BY level"
    ).data()
    for row in level_stats:
        print(f"    HSK {row['level']}: {row['cnt']} 个词")

    # 按词性统计（Top 10）
    print("\n  按词性分布 (Top 10):")
    pos_stats = session.run(
        "MATCH (gp:GrammarPoint)<-[:HAS_POS]-(:HSKWord) "
        "RETURN gp.name AS pos, count(*) AS cnt ORDER BY cnt DESC LIMIT 10"
    ).data()
    for row in pos_stats:
        print(f"    {row['pos']}: {row['cnt']} 个词")


# ============================================================================
# Main
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="Neo4j HSK 词汇种子注入脚本")
    parser.add_argument("--jsonl", default=None, help="HSK JSONL 文件路径")
    parser.add_argument("--dry-run", action="store_true", help="仅校验 JSONL，不连接 Neo4j")
    parser.add_argument("--verify", action="store_true", help="注入后验证")
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    jsonl_path = args.jsonl or str(script_dir / ".." / "src" / "data" / "hsk_word_new.jsonl")

    print("=" * 60)
    print("🚀 Neo4j HSK 词汇种子注入")
    print("=" * 60)
    print(f"📄 JSONL 文件: {jsonl_path}")

    # Step 1: 加载 JSONL
    print("\n[1/3] 加载 HSK 词汇 JSONL...")
    try:
        words = load_hsk_jsonl(jsonl_path)
        # 按等级统计
        level_counts = defaultdict(int)
        for w in words:
            level_counts[w["hsk_level"]] += 1
        print(f"  ✅ 成功加载 {len(words)} 个词条")
        for lvl in sorted(level_counts.keys()):
            print(f"     HSK {lvl}: {level_counts[lvl]} 个词")
    except Exception as e:
        print(f"  ❌ 加载失败: {e}")
        sys.exit(1)

    if args.dry_run:
        print("\n🔍 --dry-run 模式，跳过 Neo4j 连接。")
        return

    # Step 2: 环境变量
    print("\n[2/3] 检查 Neo4j 连接配置...")
    cfg = get_env_config()
    if not cfg["ok"]:
        print(f"  ❌ 缺少环境变量: {', '.join(cfg['missing'])}")
        sys.exit(1)
    print(f"  ✅ 配置完整 — {cfg['uri']}")

    # Step 3: 连接并注入
    print("\n[3/3] 连接 Neo4j 并注入 HSK 词汇...")

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
        print(f"  ❌ Neo4j 连接失败: {e}")
        driver.close()
        sys.exit(1)

    db = cfg["database"] if cfg["database"] != "neo4j" else None

    try:
        with driver.session(database=db) if db else driver.session() as session:
            stats = seed_hsk_vocabulary(session, words)
    except Exception as e:
        print(f"  ❌ 注入出错: {e}")
        driver.close()
        sys.exit(1)

    # 验证
    if args.verify:
        try:
            with driver.session(database=db) if db else driver.session() as s:
                verify_hsk_seed(s)
        except Exception as e:
            print(f"  ⚠️ 验证出错: {e}")

    driver.close()

    print("\n" + "=" * 60)
    print("✅ HSK 词汇注入完成！")
    print(f"  HSKWord 节点:    {stats['hsk_word']} (MERGE)")
    print(f"  GrammarPoint 节点: {stats['grammar_point']} (MERGE)")


if __name__ == "__main__":
    main()
