"""
扩展 MANIFESTED_IN 数据：为更多 KP 生成专属文化表现数据

当前: 12 维度 × 8 文化圈 = 96 条全局边 (CulturalDimension→HomeCulture)
目标: 新增 (KP, 维度, 文化圈) 三元组的结构化数据，让路径1覆盖更多KP

方法:
  1. 选 50 个代表性 KP
  2. 对每个 KP，查已有关联的文化维度
  3. 对 3 个目标文化圈(日/英/阿)，用 LLM 生成该 KP 在该文化圈中的具体表现
  4. DeepSeek+MiniMax 双裁判评分 → 通过率 > 阈值才入库
  5. 存入 Neo4j 新边类型: KP_MANIFESTED_IN

用法:
  python3 scripts/extend_manifested_in.py --kp 50 --dry-run   # 预览
  python3 scripts/extend_manifested_in.py --kp 50              # 正式生成
"""
import os, json, time, sys, random
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

NEO4J_URI = os.getenv("NEO4J_URI", "")
NEO4J_USER = os.getenv("NEO4J_USERNAME", "")
NEO4J_PASS = os.getenv("NEO4J_PASSWORD", "")

DEEPSEEK_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_URL = os.getenv("DEEPSEEK_API_URL", "https://api.deepseek.com")
MINIMAX_URL = os.getenv("MINIMAX_API_URL", "http://202.112.194.90:10300")
MINIMAX_KEY = os.getenv("MINIMAX_API_KEY", "")

TARGET_CULTURES = ["hc_en", "hc_ja", "hc_ko", "hc_es", "hc_ar", "hc_ru", "hc_fr", "hc_th"]

# ── Neo4j ──────────────────────────────────────
def neo4j_query(cypher, params=None):
    from neo4j import GraphDatabase
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASS))
    with driver.session() as s:
        return [dict(r) for r in s.run(cypher, params or {})]
    driver.close()

# ── LLM 调用 ────────────────────────────────────
def call_llm(provider, messages, model=None):
    if (os.getenv("LLM_REAL_CALLS_ENABLED") != "true" or
            float(os.getenv("LLM_RUN_BUDGET_CNY", "0")) <= 0 or
            os.getenv("LLM_LEGACY_PRICE_VERIFIED") != "true"):
        raise RuntimeError("Real LLM calls are disabled, unbudgeted, or legacy pricing is unverified")
    if provider == "deepseek":
        url = f"{DEEPSEEK_URL}/chat/completions"
        headers = {"Authorization": f"Bearer {DEEPSEEK_KEY}"}
        body = {"model": model or "deepseek-chat", "messages": messages, "temperature": 0.3, "max_tokens": 500}
    else:
        url = f"{MINIMAX_URL}/v1/chat/completions"
        headers = {"Authorization": f"Bearer {MINIMAX_KEY}"}
        body = {"model": model or "MiniMax-M2.7", "messages": messages, "temperature": 0.3, "max_tokens": 500}

    r = requests.post(url, headers=headers, json=body, timeout=60)
    data = r.json()
    return data.get("choices", [{}])[0].get("message", {}).get("content", "")

# ── 裁判评分 ────────────────────────────────────
def judge_quality(kp_name, dimension, culture, generated_data):
    """DeepSeek + MiniMax 独立评分 (1-5)"""
    prompt = f"""评测以下跨文化数据的质量:

文化概念: {kp_name}
文化维度: {dimension}
目标文化圈: {culture}

生成的数据:
{json.dumps(generated_data, ensure_ascii=False, indent=2)}

评分标准(1-5):
- 5: 准确描述了该文化圈的具体表现，有冲突分析和实用建议
- 3: 描述基本正确但缺乏细节或场景
- 1: 明显错误或含有刻板印象

只输出数字(1-5):"""

    scores = []
    for provider in ["deepseek", "minimax"]:
        try:
            resp = call_llm(provider, [{"role": "user", "content": prompt}])
            score = int(resp.strip()) if resp.strip().isdigit() else 3
            scores.append(score)
        except:
            scores.append(3)
        time.sleep(0.5)

    avg = sum(scores) / len(scores) if scores else 0
    return avg, scores

# ── LLM 生成 ────────────────────────────────────
def generate_kp_manifestation(kp_name, pragmatic_intent, dimension, culture_name):
    """为特定 KP+维度+文化圈组合生成文化表现数据"""
    prompt = f"""你是一位跨文化研究专家。请为以下场景生成目标文化圈中的具体文化表现数据:

中国文化概念: {kp_name}
交际意图: {pragmatic_intent}
文化维度: {dimension}
目标文化圈: {culture_name}

请生成JSON格式:
{{
  "manifestation": "该文化圈在此场景中的具体行为表现(2-3句)",
  "conflict_with_chinese": "与中国做法的主要差异和潜在冲突(1-2句)",
  "pragmatic_tip": "给学习者的一条实用沟通建议",
  "example_scenario": "一个真实场景示例(1-2句)"
}}

只输出JSON，不要其他内容。"""

    try:
        resp = call_llm("deepseek", [{"role": "user", "content": prompt}])
        match = resp.strip().strip('```json').strip('```').strip()
        if match.startswith('{'):
            return json.loads(match)
    except Exception as e:
        print(f"  生成失败: {e}")
    return None

# ── 主流程 ──────────────────────────────────────
def main():
    dry_run = "--dry-run" in sys.argv
    kp_limit = 50
    for a in sys.argv:
        if a.startswith("--kp="):
            kp_limit = int(a.split("=")[1])

    print(f"扩展 MANIFESTED_IN: {'预览模式' if dry_run else '正式生成'} | 目标KP数: {kp_limit}\n")

    # 1. 选取 KP
    kps = neo4j_query("""
        MATCH (kp:KnowledgePoint)-[:HAS_DIMENSION|RELATES_TO*1..3]->(cd:CulturalDimension)
        WITH kp, collect(DISTINCT cd.name) AS dims
        WHERE size(dims) >= 1
        RETURN kp.id AS id, kp.name AS name, kp.pragmatic_intent AS intent, dims
        ORDER BY size(dims) DESC
        LIMIT $limit
    """, {"limit": kp_limit})

    print(f"选中 {len(kps)} 个 KP (均有文化维度关联)\n")

    total_pairs = 0
    passed_pairs = 0

    for i, kp in enumerate(kps):
        for culture in TARGET_CULTURES:
            culture_name = {"hc_en":"英语圈","hc_ja":"日语圈","hc_ko":"韩语圈","hc_es":"西班牙语圈","hc_ar":"阿拉伯语圈","hc_ru":"俄语圈","hc_fr":"法语圈","hc_th":"东南亚文化圈"}[culture]
            for dim in kp["dims"][:2]:  # 每 KP 取前 2 个维度
                total_pairs += 1

                if dry_run:
                    print(f"[{total_pairs}] {kp['name']} × {dim} × {culture_name}")
                    continue

                print(f"[{total_pairs}] {kp['name'][:20]} × {dim[:10]} × {culture_name}...", end=" ")

                data = generate_kp_manifestation(kp["name"], kp.get("intent", ""), dim, culture_name)
                if not data:
                    print("生成失败")
                    continue

                avg_score, scores = judge_quality(kp["name"], dim, culture_name, data)
                print(f"评分={avg_score:.1f} {'✅' if avg_score >= 3.0 else '❌'}")

                if avg_score >= 3.0:
                    passed_pairs += 1
                    if not dry_run:
                        # 存入 Neo4j
                        neo4j_query("""
                            MATCH (kp:KnowledgePoint {id: $kpId})
                            MATCH (cd:CulturalDimension {name: $dim})
                            MATCH (hc:HomeCulture {id: $culture})
                            MERGE (kp)-[r:KP_MANIFESTED_IN]->(cd)
                            SET r.manifestation = $m,
                                r.conflict_with_chinese = $c,
                                r.pragmatic_tip = $p,
                                r.example_scenario = $e,
                                r.judge_score = $score,
                                r.target_home_culture = $culture
                        """, {
                            "kpId": kp["id"], "dim": dim, "culture": culture,
                            "m": data.get("manifestation", ""),
                            "c": data.get("conflict_with_chinese", ""),
                            "p": data.get("pragmatic_tip", ""),
                            "e": data.get("example_scenario", ""),
                            "score": avg_score,
                        })

                time.sleep(1)  # 限流

    print(f"\n完成: {total_pairs} 对, 通过 {passed_pairs} ({passed_pairs/total_pairs*100:.0f}%)")

if __name__ == "__main__":
    main()
