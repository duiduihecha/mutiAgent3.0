import json

with open("experiment_results/test_cases.json") as f:
    all_cases = json.load(f)

import json

# 从 CIEval dev 集直接采样，保证 key 一定匹配
with open("experiment_results/cieval/dev.json") as f:
    cievals = json.load(f)

# 所有 domain 各取 1-2 条，优先覆盖不同母语+HSK组合
target_count = 30
cieval_samples = []
# 先按 domain 分组
from collections import defaultdict
by_domain = defaultdict(list)
for s in cievals:
    by_domain[s["input"]["knowledge_point"]["domain"]].append(s)

# 每 domain 取 1-2 条，优先不同母语+HSK
for dm, samples in by_domain.items():
    # 去重母语+HSK组合
    seen_combo = set()
    for s in samples:
        lp = s["input"]["learner_profile"]
        combo = f"{lp['home_culture_code']}|{lp['hsk_level']}"
        if combo not in seen_combo:
            seen_combo.add(combo)
            cieval_samples.append(s)
            if len([x for x in cieval_samples if x["input"]["knowledge_point"]["domain"]==dm]) >= 2:
                break

# 打乱，取目标数量
import random
random.seed(42)
random.shuffle(cieval_samples)
cieval_samples = cieval_samples[:target_count]

# 转换为 TestCase 格式
selected = []
for s in cieval_samples:
    kp = s["input"]["knowledge_point"]
    lp = s["input"]["learner_profile"]
    tc = {
        "id": f"{kp['id']}_{lp['home_culture_code']}_hsk{lp['hsk_level']}",
        "knowledge_point_id": kp["id"],
        "domain_id": kp["id"].split("_")[0],
        "scene_id": kp["scene"],
        "domain_name": kp["domain"],
        "scene_name": kp["scene"],
        "pragmatic_intent": kp["pragmatic_intent"],
        "native_language": lp["home_culture"],
        "hsk_level": lp["hsk_level"],
        "_cieval_sample": s  # 附带完整 CIEval 样本，Step2 直接用
    }
    selected.append(tc)

print(f"选中 {len(selected)} 条 (来自 CIEval dev 集), 共 {len(selected)*5} 次LLM调用")
for c in selected:
    kp = c["_cieval_sample"]["input"]["knowledge_point"]
    lp = c["_cieval_sample"]["input"]["learner_profile"]
    print(f"  {kp['domain']:10s}/{kp['scene']:10s} | {lp['home_culture']} | HSK{lp['hsk_level']} | 焦虑={lp['anxiety_score']}")

with open("experiment_results/test_cases_mini.json","w") as f:
    json.dump(selected, f, ensure_ascii=False, indent=2)
