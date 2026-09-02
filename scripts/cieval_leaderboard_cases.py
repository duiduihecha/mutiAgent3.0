"""从 CIEval dev 集分层抽样 30 条共享测试用例"""
import json, random
from collections import defaultdict

random.seed(42)

with open("experiment_results/cieval/dev.json") as f:
    dev = json.load(f)

# 按 domain × culture × hsk 分层
strata = defaultdict(list)
for s in dev:
    kp = s["input"]["knowledge_point"]
    lp = s["input"]["learner_profile"]
    key = f"{kp['domain']}|{lp['home_culture_code']}|{lp['hsk_level']}"
    strata[key].append(s)

# 每层取 1 条，总数控制在 30
samples = []
for key, pool in strata.items():
    samples.append(random.choice(pool))

random.shuffle(samples)
samples = samples[:30]

print(f"从 dev 集 {len(dev)} 条中抽取 {len(samples)} 条")
domains = defaultdict(int)
for s in samples:
    kp = s["input"]["knowledge_point"]
    lp = s["input"]["learner_profile"]
    domains[kp['domain']] += 1
    print(f"  {s['cieval_id']} | {kp['domain']:8s}/{kp['scene']:10s} | {lp['home_culture']} HSK{lp['hsk_level']} | 焦虑={lp['anxiety_score']}")
print(f"Domain覆盖: {len(domains)}")

with open("experiment_results/cieval_leaderboard_cases.json", "w") as f:
    json.dump(samples, f, ensure_ascii=False, indent=2)
