#!/usr/bin/env python3
"""
T45 统计版 · 真实数据验证
==========================

复用 ablation_stats.py 的相似度核心，在两份真实数据上跑一遍，确认
"统计版 T45"在真实数据上给出合理结论。

数据源：
  A) verify_c1c4_dump.json  —— 3 个 case，每个含 c1a(C1 run1) / c4a(C4) / c1b(C1 run2)
     可同时验证 消融组(C1 vs C4) 与 同源对照(C1 vs C1)
  B) rq1_mini_outputs.jsonl —— 2 个 case × 5 条件（无同源对照）

用法：python3 scripts/validate_t45_stat.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ablation_stats as A  # noqa: E402

ROOT = os.path.dirname(HERE)
FIELDS = A.FIELDS


def ci(vals):
    return A.ci_of(vals)


def section(title):
    print("\n" + "=" * 68)
    print(title)
    print("=" * 68)


def run_on_dump():
    p = os.path.join(ROOT, "experiment_results", "verify_c1c4_dump.json")
    if not os.path.exists(p):
        print(f"[跳过] 未找到 {p}")
        return
    data = json.load(open(p, encoding="utf-8"))
    section("A) verify_c1c4_dump.json — 含同源对照(c1b)")
    abl, ctrl = [], []
    for e in data:
        cid = e["id"]
        c1a = A.extract_content(e["c1a"])
        c4a = A.extract_content(e["c4a"])
        c1b = A.extract_content(e["c1b"])
        ov_ab, per_ab = A.content_similarity(c1a, c4a)
        ov_cc, per_cc = A.content_similarity(c1a, c1b)
        abl.append(ov_ab)
        ctrl.append(ov_cc)
        print(f"\n  case={cid}")
        print(f"    C1 vs C4 整体={ov_ab:.4f}  字段: " +
              ", ".join(f"{f}={per_ab[f]:.3f}" for f in FIELDS))
        print(f"    C1 vs C1 整体={ov_cc:.4f}  字段: " +
              ", ".join(f"{f}={per_cc[f]:.3f}" for f in FIELDS))

    m_a, se_a, lo_a, hi_a, n_a = ci(abl)
    m_c, se_c, lo_c, hi_c, n_c = ci(ctrl)
    print(f"\n  [消融组] C1 vs C4  n={n_a}  均值={m_a:.4f} 95%CI=[{lo_a:.4f},{hi_a:.4f}]")
    print(f"  [同源对照] C1 vs C1 n={n_c}  均值={m_c:.4f} 95%CI=[{lo_c:.4f},{hi_c:.4f}]")
    diffs = [c - a for c, a in zip(ctrl, abl)]
    m_d, se_d, lo_d, hi_d, n_d = ci(diffs)
    print(f"  [对照检验] (C1C1 − C1C4) 均值={m_d:+.4f} 95%CI=[{lo_d:+.4f},{hi_d:+.4f}]")
    if lo_d <= 0 <= hi_d:
        print("  ✅ T45 统计通过：C1 vs C4 发散未超出同条件采样噪声 → A5 无额外改写")
    else:
        print("  ⚠️ T45 统计 FAIL：C1 vs C4 显著低于噪声地板 → A5 改写内容")


def run_on_rq1():
    p = os.path.join(ROOT, "experiment_results", "rq1_mini_outputs.jsonl")
    if not os.path.exists(p):
        print(f"[跳过] 未找到 {p}")
        return
    recs = [json.loads(l) for l in open(p, encoding="utf-8")]
    g = {}
    for o in recs:
        g.setdefault(o["_tc_id"], {}).setdefault(o["_cond"], []).append(o)
    section("B) rq1_mini_outputs.jsonl — 2 case × 5 条件（无同源对照）")
    abl = []
    abl_per = {f: [] for f in FIELDS}
    for tc, cs in g.items():
        if "C1_Full" in cs and "C4_NoA5" in cs:
            ov, per = A.content_similarity(A.extract_content(cs["C1_Full"][0]),
                                          A.extract_content(cs["C4_NoA5"][0]))
            abl.append(ov)
            for f in FIELDS:
                abl_per[f].append(per[f])
            print(f"\n  case={tc}")
            print(f"    C1 vs C4 整体={ov:.4f}  字段: " +
                  ", ".join(f"{f}={per[f]:.3f}" for f in FIELDS))
    if not abl:
        print("  [跳过] 无 C1/C4 配对")
        return
    m_a, se_a, lo_a, hi_a, n_a = ci(abl)
    print(f"\n  [消融组] C1 vs C4 n={n_a} 均值={m_a:.4f} 95%CI=[{lo_a:.4f},{hi_a:.4f}]")
    for f in FIELDS:
        mm, _, lf, hf, _ = ci(abl_per[f])
        print(f"    · {f:18s} 均值={mm:.4f} 95%CI=[{lf:.4f},{hf:.4f}]")
    if m_a >= 0.85 and lo_a >= 0.75:
        print("  ✅ 弱判定 PASS（无同源对照）：整体相似度足够高")
    else:
        print("  ⚠️ 弱判定 FAIL（无同源对照）：建议补 C1 两次运行对照后复判")


if __name__ == "__main__":
    run_on_dump()
    run_on_rq1()
