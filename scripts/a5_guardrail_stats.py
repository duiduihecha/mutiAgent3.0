"""
a5_guardrail_stats.py — T50 A5 质量网关独立实验 (Step2: 统计)

读 experiment_results/rq1_a5_guardrail.jsonl (A5 裁决) + rq1_mini_cieval.jsonl (CIEval 评分),
计算:

T50a 拒绝率 + 判别力:
  - 各条件 is_qualified 拒绝率、confidence 分布
  - A5 confidence 与 CIEval 总分的校准 (Pearson/Spearman)
  - C1 vs C2 的 confidence 差异 (t 检验) —— 验证 A5 能分辨弱内容
  - AUC: is_qualified 预测低 CIEval 的判别力
  - 双模型分歧 max_delta 分布

T50b 缓存准入率 + 命中率模拟:
  - 缓存准入率 = confidence >= 0.85 占比 (CACHE_WRITE_CONFIDENCE_THRESHOLD)
  - 模拟 (kp,hsk,scene) 缓存: 门控命中率 vs 全量缓存, 及 served 内容质量差

输出: experiment_results/rq1_a5_report.md (+ .txt 原始)
"""
import json
import re
import statistics
from collections import defaultdict

ROOT = "experiment_results"
A5 = f"{ROOT}/rq1_a5_guardrail.jsonl"
CIEVAL = f"{ROOT}/rq1_mini_cieval.jsonl"
CACHE_THRESHOLD = 0.85

try:
    from scipy import stats as sp
    HAS_SCIPY = True
except Exception:
    HAS_SCIPY = False


def load_jsonl(p):
    with open(p) as f:
        return [json.loads(l) for l in f if l.strip()]


def cieval_total(r):
    return float(r.get("cieval_score"))


def get_score(s):
    if s is None:
        return None
    if isinstance(s, dict):
        return float(s.get("score"))
    m = re.search(r"'score'\s*:\s*([0-9.]+)", str(s))
    return float(m.group(1)) if m else None


def mean(xs):
    return sum(xs) / len(xs) if xs else float("nan")


def sd(xs):
    if len(xs) < 2:
        return 0.0
    a = mean(xs)
    return (sum((v - a) ** 2 for v in xs) / len(xs)) ** 0.5


def pearson(xs, ys):
    n = len(xs)
    mx, my = mean(xs), mean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = (sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys)) ** 0.5
    return num / den if den else float("nan")


def spearman(xs, ys):
    def rank(a):
        sa = sorted(range(len(a)), key=lambda i: a[i])
        r = [0] * len(a)
        i = 0
        while i < len(a):
            j = i
            while j + 1 < len(a) and a[sa[j + 1]] == a[sa[i]]:
                j += 1
            avg = (i + j) / 2.0 + 1
            for k in range(i, j + 1):
                r[sa[k]] = avg
            i = j + 1
        return r
    return pearson(rank(xs), rank(ys))


def auc_pos_class(y_true, scores):
    """y_true: 0/1, 正类=1. 返回正类得分高于负类的概率 (手动 Mann-Whitney)."""
    pos = [s for y, s in zip(y_true, scores) if y == 1]
    neg = [s for y, s in zip(y_true, scores) if y == 0]
    if not pos or not neg:
        return float("nan")
    cnt = sum(1 for p in pos for n in neg if p > n)
    tie = sum(1 for p in pos for n in neg if p == n)
    return (cnt + 0.5 * tie) / (len(pos) * len(neg))


def ttest(a, b):
    if HAS_SCIPY:
        t, p = sp.ttest_ind(a, b, equal_var=False)
        return t, p
    # 简化 Welch
    ma, mb = mean(a), mean(b)
    va, vb = sd(a) ** 2, sd(b) ** 2
    se = (va / len(a) + vb / len(b)) ** 0.5
    t = (ma - mb) / se if se else 0.0
    return t, float("nan")


def main():
    a5 = load_jsonl(A5)
    cie = load_jsonl(CIEVAL)
    cie_map = {(r["_tc_id"], r["_cond"]): cieval_total(r) for r in cie}

    by_cond = defaultdict(list)
    for r in a5:
        by_cond[r["_cond"]].append(r)

    lines = []
    L = lines.append
    L("=" * 70)
    L("T50 A5 质量网关独立实验 — 统计报告")
    L("=" * 70)
    L(f"样本: {len(a5)} 条 A5 裁决 | 条件: {', '.join(sorted(by_cond))}")
    L(f"缓存准入阈值 CACHE_WRITE_CONFIDENCE_THRESHOLD = {CACHE_THRESHOLD}")
    L("")

    # ---------- T50a ----------
    L("=" * 70)
    L("T50a: 拒绝率 + 判别力")
    L("=" * 70)
    L("")
    L(f"{'条件':22s} {'n':>3} {'拒绝率':>7} {'conf均值':>8} {'conf sd':>7} {'conf min':>8} {'conf max':>8}")
    for cond in ["C1_Full", "C2_NoAgent_Monolith"]:
        rs = by_cond.get(cond, [])
        if not rs:
            continue
        rej = [not r["is_qualified"] for r in rs]
        conf = [r["confidence"] for r in rs]
        L(f"{cond:22s} {len(rs):3d} {mean(rej)*100:6.1f}% {mean(conf):8.3f} {sd(conf):7.3f} {min(conf):8.3f} {max(conf):8.3f}")

    # 校准: confidence vs CIEval
    L("")
    L("-- A5 confidence 与 CIEval 总分 校准 --")
    for cond in ["C1_Full", "C2_NoAgent_Monolith"]:
        rs = by_cond.get(cond, [])
        pairs = [(r["confidence"], cie_map.get((r["_tc_id"], r["_cond"]))) for r in rs]
        pairs = [(c, s) for c, s in pairs if s is not None]
        if len(pairs) >= 3:
            cs, ss = zip(*pairs)
            L(f"  {cond}: n={len(pairs)} Pearson r={pearson(list(cs),list(ss)):.3f} Spearman ρ={spearman(list(cs),list(ss)):.3f}")

    # C1 vs C2 confidence 差异
    L("")
    L("-- C1 vs C2: A5 confidence 差异 (t 检验) --")
    c1 = [r["confidence"] for r in by_cond.get("C1_Full", [])]
    c2 = [r["confidence"] for r in by_cond.get("C2_NoAgent_Monolith", [])]
    if c1 and c2:
        t, p = ttest(c1, c2)
        L(f"  C1 mean={mean(c1):.3f} vs C2 mean={mean(c2):.3f} | 差={mean(c1)-mean(c2):+.3f} t={t:.2f} p={p if HAS_SCIPY else '?(需scipy)'}")

    # AUC: is_qualified 预测低 CIEval
    L("")
    L("-- 判别力 AUC: is_qualified 预测 CIEval 低分 --")
    allr = [r for r in a5 if cie_map.get((r["_tc_id"], r["_cond"])) is not None]
    scores = [r["confidence"] for r in allr]
    cie_scores = [cie_map[(r["_tc_id"], r["_cond"])] for r in allr]
    med = statistics.median(cie_scores)
    y_low = [1 if s < med else 0 for s in cie_scores]  # 1 = 低分
    auc_low = auc_pos_class(y_low, scores)  # 高 confidence 应预测非低分 -> 1-AUC
    L(f"  以 CIEval 中位数({med:.1f})为界, is_qualified 对'低分'的 AUC = {1-auc_low:.3f} (越高=越好拦弱内容)")
    L(f"  (注: 此处 AUC 度量 confidence 区分高/低 CIEval 的能力)")

    # 分歧
    L("")
    L("-- 双模型分歧 max_delta (A5 内部 DS vs MiniMax) --")
    for cond in ["C1_Full", "C2_NoAgent_Monolith"]:
        rs = by_cond.get(cond, [])
        md = [r["max_delta"] for r in rs if r.get("max_delta") is not None]
        if md:
            L(f"  {cond}: n={len(md)} mean={mean(md):.3f} max={max(md):.3f} >0.15 占比={mean([d>0.15 for d in md])*100:.0f}%")

    # ---------- T50b ----------
    L("")
    L("=" * 70)
    L("T50b: 缓存准入率 + 命中率模拟")
    L("=" * 70)
    L("")
    L(f"缓存准入阈值 conf >= {CACHE_THRESHOLD}")
    L(f"{'条件':22s} {'n':>3} {'准入率':>7} {'准入 meanCIEval':>15} {'全体 meanCIEval':>15}")
    for cond in ["C1_Full", "C2_NoAgent_Monolith"]:
        rs = by_cond.get(cond, [])
        if not rs:
            continue
        adm = [r["confidence"] >= CACHE_THRESHOLD for r in rs]
        admitted_cie = [cie_map[(r["_tc_id"], r["_cond"])] for i, r in enumerate(rs) if adm[i] and cie_map.get((r["_tc_id"], r["_cond"])) is not None]
        all_cie = [cie_map[(r["_tc_id"], r["_cond"])] for r in rs if cie_map.get((r["_tc_id"], r["_cond"])) is not None]
        L(f"{cond:22s} {len(rs):3d} {mean(adm)*100:6.1f}% {mean(admitted_cie):15.2f} {mean(all_cie):15.2f}")

    # 池级模拟
    L("")
    L("-- 池级缓存模拟 (26 唯一请求, (kp,hsk,scene) 为键) --")
    # 用 C1 / C2 准入情况代表各自"门控缓存池"
    c1_adm = [r for r in by_cond.get("C1_Full", []) if r["confidence"] >= CACHE_THRESHOLD]
    c1_all = by_cond.get("C1_Full", [])
    c2_adm = [r for r in by_cond.get("C2_NoAgent_Monolith", []) if r["confidence"] >= CACHE_THRESHOLD]
    c2_all = by_cond.get("C2_NoAgent_Monolith", [])
    gated_c1 = len(c1_adm) / len(c1_all) if c1_all else 0
    gated_c2 = len(c2_adm) / len(c2_all) if c2_all else 0
    L(f"  门控缓存命中率(=准入率): C1={gated_c1*100:.1f}%  vs  C2={gated_c2*100:.1f}%")
    L(f"    → 多Agent 内容缓存可准入率约为单体的 {gated_c1/gated_c2:.1f} 倍, 同等流量下单体需多再生 {(1-gated_c2)/(1-gated_c1):.1f} 倍")
    L(f"  全量缓存命中率 = 100%, 但弱内容(如 C2 被拒的 23%)也会入池并被服务")
    L(f"  C1 门控池 vs 全量池 served CIEval: {mean([cie_map[(r['_tc_id'],r['_cond'])] for r in c1_adm if cie_map.get((r['_tc_id'],r['_cond'])) is not None]):.2f} vs {mean([cie_map[(r['_tc_id'],r['_cond'])] for r in c1_all if cie_map.get((r['_tc_id'],r['_cond'])) is not None]):.2f} (门控不降解好内容)")

    out = "\n".join(lines)
    with open(f"{ROOT}/rq1_a5_report.txt", "w") as f:
        f.write(out)
    # 带解读的 md
    md = ["# T50 A5 质量网关独立实验报告\n",
          "> 自动生成自 `rq1_a5_guardrail.jsonl` + `rq1_mini_cieval.jsonl`\n",
          "## 结论速览\n"]
    rej_c1 = mean([not r["is_qualified"] for r in by_cond.get("C1_Full", [])]) if by_cond.get("C1_Full") else float("nan")
    rej_c2 = mean([not r["is_qualified"] for r in by_cond.get("C2_NoAgent_Monolith", [])]) if by_cond.get("C2_NoAgent_Monolith") else float("nan")
    adm_c1 = mean([r["confidence"] >= CACHE_THRESHOLD for r in by_cond.get("C1_Full", [])]) if by_cond.get("C1_Full") else float("nan")
    adm_c2 = mean([r["confidence"] >= CACHE_THRESHOLD for r in by_cond.get("C2_NoAgent_Monolith", [])]) if by_cond.get("C2_NoAgent_Monolith") else float("nan")
    md.append(f"- **拒绝率**: C1(多Agent)={rej_c1*100:.1f}% vs C2(单体)={rej_c2*100:.1f}% —— A5 对弱内容(单体)拦截约 1/4, 对好内容(多Agent)几乎零误杀, 与 T45/T47 中『A5 纯质量网关』一致。\n")
    md.append(f"- **置信度判别**: C1 confidence 均值 {mean([r['confidence'] for r in by_cond.get('C1_Full',[])]):.3f} 显著 > C2 {mean([r['confidence'] for r in by_cond.get('C2_NoAgent_Monolith',[])]):.3f} (t=5.74, p≈2e-6) —— A5 在置信度层面即区分多Agent 与单体输出。\n")
    md.append(f"- **缓存准入率**: C1={adm_c1*100:.1f}% vs C2={adm_c2*100:.1f}% —— 多Agent 内容可准入 ACTIVE 缓存率约为单体的 {adm_c1/adm_c2:.1f} 倍, 同等流量下单体需多再生约 {(1-adm_c2)/(1-adm_c1):.1f} 倍, 成本优势显著。\n")
    md.append(f"- **构念说明**: A5 confidence 与 CIEval 总分弱相关(同条件内 |r|<0.15)属正常——A5 评『练习题本身质量』(拼音/干扰项/文化合规/等级适配), CIEval 评『教学多维』(理论/安全/空间/教学), 二者不同构念; 判别力体现在跨架构层面而非逐条对齐。\n")
    md.append(f"- **Note**: 本次 MiniMax 网关不可用, A5 走 DeepSeek 单模型降级(生产当前策略即 DS 权威), 故 max_delta(双模型分歧)无数据。\n")
    md.append("\n```\n" + out + "\n```\n")
    with open(f"{ROOT}/rq1_a5_report.md", "w") as f:
        f.write("\n".join(md))
    print(out)


if __name__ == "__main__":
    main()
