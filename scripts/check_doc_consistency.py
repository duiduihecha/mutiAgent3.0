#!/usr/bin/env python3
"""
CIEval 文档-代码一致性校验 (Step 2 of 脱节修复方案)

功能:
1. 从实际 json 数据计算真实统计 -> 写 experiment_results/cieval/dataset_card.json
2. 断言 build 脚本常量 (HSK/焦虑档) 与 models.json 一致
3. 扫描 paper_assets/ 里的过时模型 token (豆包/Coze SDK/MiniMax/doubao-seed) -> 列出文件:行
4. 打印 gap 报告

用法: python3 scripts/check_doc_consistency.py
"""
import json, os, re, sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CIEVAL_DIR = ROOT / "experiment_results" / "cieval"
PAPER_DIR = ROOT / "paper_assets"

SPLITS = ["train", "dev", "test", "challenge"]

# 文档声称的值 (已对齐真实数据, 作为 EXPECTED 基线 — 任何偏离即回归)
DOC_CLAIMS = {
    "total": 1350,
    "splits": {"train": 425, "dev": 206, "test": 584, "challenge": 135},
    "hsk_levels": [1, 3, 5],
    "anxiety_levels": [30, 60, 85],
    "kg_manifestation_coverage": "100%",
}

# 构建脚本常量 (build_cieval_dataset.py)
SCRIPT_HSK = [1, 3, 5]
SCRIPT_ANXIETY = [30, 60, 85]

# 历史文档: 记录旧模型栈缺陷证据, 模型名属历史记录非 active 声明, 不扫描
HISTORICAL_FILES = {"bug_report.md"}


def load_split(name):
    p = CIEVAL_DIR / f"{name}.json"
    if not p.exists():
        return []
    with open(p, encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else []


def compute_stats():
    all_samples = {}
    by_split = {}
    for s in SPLITS:
        arr = load_split(s)
        by_split[s] = arr
        all_samples[s] = arr

    total = sum(len(v) for v in by_split.values())

    flat = []
    for s, arr in by_split.items():
        for x in arr:
            x2 = dict(x)
            x2["_split"] = s
            flat.append(x2)

    def g(obj, *path, default=None):
        cur = obj
        for k in path:
            if not isinstance(cur, dict) or k not in cur:
                return default
            cur = cur[k]
        return cur

    domains = Counter()
    kp_ids = set()
    cultures = Counter()
    hsk = Counter()
    anx = Counter()
    motiv = Counter()
    kg_tier = Counter()
    n_dim = n_manifest = n_vocab = 0

    for x in flat:
        kp = g(x, "input", "knowledge_point", default={})
        lp = g(x, "input", "learner_profile", default={})
        kg = g(x, "input", "kg_data", default={})
        domains[kp.get("domain", "?")] += 1
        if kp.get("id"):
            kp_ids.add(kp["id"])
        cultures[lp.get("home_culture", "?")] += 1
        hsk[lp.get("hsk_level", kp.get("hsk_level"))] += 1
        anx[lp.get("anxiety_score")] += 1
        motiv[lp.get("motivation", "?")] += 1
        if kg.get("kg_tier"):
            kg_tier[kg["kg_tier"]] += 1
        if kg.get("cultural_dimensions"):
            n_dim += 1
        if kg.get("manifestation"):
            n_manifest += 1
        if kg.get("expected_vocab"):
            n_vocab += 1

    n = max(len(flat), 1)
    return {
        "total": total,
        "by_split": {s: len(v) for s, v in by_split.items()},
        "domain_count": len(domains),
        "domain_dist": dict(domains.most_common()),
        "kp_count": len(kp_ids),
        "culture_dist": dict(cultures.most_common()),
        "hsk_levels": sorted([k for k in hsk if k is not None]),
        "hsk_dist": dict(sorted(hsk.items())),
        "anxiety_levels": sorted([k for k in anx if k is not None]),
        "anxiety_dist": dict(sorted(anx.items())),
        "motivation_dist": dict(motiv.most_common()),
        "kg_tier_dist": dict(kg_tier.most_common()),
        "coverage": {
            "cultural_dimensions": f"{n_dim}/{n} ({n_dim*100//n}%)",
            "manifestation": f"{n_manifest}/{n} ({n_manifest*100//n}%)",
            "expected_vocab": f"{n_vocab}/{n} ({n_vocab*100//n}%)",
        },
    }


def scan_stale_tokens():
    """扫描 paper_assets/ 里已废弃的模型/sdk token (排除合法的历史说明)"""
    patterns = [
        r"豆包", r"doubao-seed", r"coze-coding-dev-sdk", r"Coze SDK",
        r"MiniMax-M2\.7", r"MiniMax\b",
    ]
    # 合法的历史/废弃说明上下文 (中英): 命中这些词的行不算 stale
    deprec_markers = ["已废弃", "已移除", "原设计", "降级", "替代原", "原 MiniMax",
                      "原 Coze", "原 豆包", "废弃", "移除", "历史", "原豆包",
                      "no longer available", "deprecated", "originally designed",
                      "original design", "has been removed"]
    hits = []
    for md in PAPER_DIR.rglob("*.md"):
        if md.name in HISTORICAL_FILES:
            continue  # 历史 bug 日志, 模型名属证据记录
        try:
            lines = md.read_text(encoding="utf-8").splitlines()
        except Exception:
            continue
        for i, line in enumerate(lines, 1):
            if any(m in line for m in deprec_markers):
                continue  # 合法历史说明, 跳过
            for pat in patterns:
                if re.search(pat, line):
                    rel = md.relative_to(ROOT)
                    hits.append(f"  {rel}:{i}  [{pat}]  {line.strip()[:90]}")
                    break
    return hits


def main():
    print("=" * 64)
    print("  CIEval 文档-代码一致性校验")
    print("=" * 64)

    stats = compute_stats()

    # 写 dataset_card.json (真实统计, 供 README 引用)
    card_path = CIEVAL_DIR / "dataset_card.json"
    with open(card_path, "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    print(f"\n[1] 真实统计已写入: {card_path.relative_to(ROOT)}")

    # 断言: 脚本常量
    print("\n[2] build 脚本常量校验:")
    ok_hsk = stats["hsk_levels"] == SCRIPT_HSK
    ok_anx = stats["anxiety_levels"] == SCRIPT_ANXIETY
    print(f"    HSK:   实际={stats['hsk_levels']}  脚本={SCRIPT_HSK}  {'OK' if ok_hsk else 'MISMATCH'}")
    print(f"    焦虑:  实际={stats['anxiety_levels']}  脚本={SCRIPT_ANXIETY}  {'OK' if ok_anx else 'MISMATCH'}")

    # 断言: 与文档声称
    print("\n[3] 文档声称 vs 实际 (脱节清单):")
    print(f"    总条数:  文档={DOC_CLAIMS['total']}  实际={stats['total']}  {'OK' if stats['total']==DOC_CLAIMS['total'] else 'MISMATCH'}")
    for s in SPLITS:
        d = DOC_CLAIMS["splits"][s]
        a = stats["by_split"].get(s, 0)
        print(f"    {s:10s}: 文档={d}  实际={a}  {'OK' if d==a else 'MISMATCH'}")
    print(f"    HSK档:    文档={DOC_CLAIMS['hsk_levels']}  实际={stats['hsk_levels']}  {'OK' if stats['hsk_levels']==DOC_CLAIMS['hsk_levels'] else 'MISMATCH'}")
    print(f"    焦虑档:   文档={DOC_CLAIMS['anxiety_levels']}  实际={stats['anxiety_levels']}  {'OK' if stats['anxiety_levels']==DOC_CLAIMS['anxiety_levels'] else 'MISMATCH'}")
    print(f"    质性覆盖率: 文档={DOC_CLAIMS['kg_manifestation_coverage']}  实际={stats['coverage']['manifestation']}")

    # 扫描过时 token
    print("\n[4] paper_assets 过时模型 token 扫描:")
    hits = scan_stale_tokens()
    if not hits:
        print("    无过时 token (全部已更新)")
    else:
        print(f"    发现 {len(hits)} 处 (需 Step3 人工修订):")
        for h in hits:
            print(h)

    print("\n" + "=" * 64)
    mism = (stats["total"] != DOC_CLAIMS["total"]) or hits
    print("  结论:", "存在脱节, 需修复" if mism else "一致")
    print("=" * 64)


if __name__ == "__main__":
    main()
