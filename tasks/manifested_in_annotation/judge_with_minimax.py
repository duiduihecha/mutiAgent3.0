#!/usr/bin/env python3
"""
MANIFESTED_IN 标注质量裁判脚本（双裁判版）
===========================================
用 DeepSeek + MiniMax 双模型作为裁判，对 Coze 生成的标注结果进行质量评分。

评分维度：
  1. 具体性（1-5）：描述是否具体到可观察行为，而非抽象概念
  2. 准确性（1-5）：对该文化特征的描述是否符合跨文化交际学共识
  3. 冲突清晰度（1-5）：与中国文化的冲突点是否表达清楚
  4. 实用性（1-5）：pragmatic_tip 是否可操作、学习者能否直接使用
  5. 场景真实度（1-5）：example_scenario 是否像真实交际场景

双裁判机制：
  - DeepSeek 和 MiniMax 各自独立评分
  - 取各维度平均分（四舍五入）作为最终得分
  - 双方总分差 > 6 时标记为"低一致性"，建议人工复核

总分 >= 20/25 → 通过
总分 15-19 → 需修改
总分 < 15 → 不合格

用法：
  python3 judge_with_minimax.py --input manifested_in_output.json [--sample 20]
"""

import json
import os
import sys
import time
import random
import argparse
import requests
import re
from typing import Optional

# ====================== 配置 ======================

DIMS = ["具体性", "准确性", "冲突清晰度", "实用性", "场景真实度"]

JUDGE_CONFIGS = {
    "minimax": {
        "name": "MiniMax-M2.7",
        "api_url_env": "MINIMAX_API_URL",
        "api_key_env": "MINIMAX_API_KEY",
        "default_url": "http://202.112.194.90:10300/v1/chat/completions",
        "model": "MiniMax-M2.7",
    },
    "deepseek": {
        "name": "DeepSeek-V3",
        "api_url_env": "DEEPSEEK_API_URL",
        "api_key_env": "DEEPSEEK_API_KEY",
        "default_url": "https://api.deepseek.com/v1/chat/completions",
        "model": "deepseek-chat",
    },
}

JUDGE_SYSTEM_PROMPT = """你是一位跨文化交际学专家，担任数据质量裁判。你需要对一条"文化维度×文化圈"的标注数据进行质量评分。

## 评分规则

从5个维度打分，每个维度1-5分（整数），总分=五个维度之和（满分25）。

## 各维度评分锚点

**1. 具体性** — manifestation是否描述到可观察行为：
- 5分：具体到可直接观察的言行，如"称呼上级用名字""拒绝时直接说No thanks"
- 3分：有行为描述但仍混有抽象概括，如"沟通风格较直接，但有时也委婉"
- 1分：纯抽象标签，如"该文化是低语境文化""XX文化权力距离高"

**2. 准确性** — 是否符合跨文化交际学主流共识：
- 5分：与Hofstede/Hall等理论一致，细节经得起推敲
- 3分：大方向正确但个别细节存疑或表述不够严谨
- 1分：存在根本性事实错误，如把美国标为高权力距离文化

**3. 冲突清晰度** — conflict_with_chinese是否说清差异链条：
- 5分：完整呈现"该文化做X → 中文环境期待Y → 导致Z误解"的因果链
- 3分：指出了差异但未说明会导致什么误解
- 1分：只泛泛说"两者有差异"或"存在冲突"

**4. 实用性** — pragmatic_tip是否可操作：
- 5分：给出具体句式/行为指导，如"应该说…不要说…""用'您'而非'你'"
- 3分：有建议但偏原则性，如"注意保持礼貌""尊重对方习惯"
- 1分：空泛无效，如"要理解文化差异""多观察多学习"

**5. 场景真实度** — example_scenario是否像真实交际：
- 5分：有具体人物/地点/对话内容，读者可直观感受冲突
- 3分：场景框架合理但缺少对话细节或过于简略
- 1分：虚构感强、不自然或纯理论描述

## 一致性要求（务必遵守）

1. 5个维度分数加总 = "总分"字段，请自检确保无误
2. "评价"必须如实反映总分：
   - 总分≥20：肯定为主
   - 总分15-19：说明具体扣分项
   - 总分<15：必须明确指出具体缺陷
3. 禁止评分与评价矛盾！若总分<15，评价绝不能出现"优秀""详实""各维度达标"等正面词

## 输出格式

禁止输出 <think> 标签或任何分析过程。直接输出一行JSON：

{"具体性": N, "准确性": N, "冲突清晰度": N, "实用性": N, "场景真实度": N, "总分": N, "评价": "一句话总结"}"""


def load_all_configs() -> dict:
    """加载所有裁判模型的配置。"""
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
    env_vars = {}
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    env_vars[key.strip()] = val.strip()

    configs = {}
    for judge_id, cfg in JUDGE_CONFIGS.items():
        api_key = os.getenv(cfg["api_key_env"], "") or env_vars.get(cfg["api_key_env"], "")
        api_url = os.getenv(cfg["api_url_env"], "") or env_vars.get(cfg["api_url_env"], "") or cfg["default_url"]
        if not api_url.endswith("/v1/chat/completions"):
            api_url = api_url.rstrip("/") + "/v1/chat/completions"
        configs[judge_id] = {
            "name": cfg["name"],
            "model": cfg["model"],
            "api_key": api_key,
            "api_url": api_url,
        }
    return configs


def validate_score(score: dict) -> tuple[bool, str]:
    """校验评分内部一致性。返回 (是否通过, 问题描述)。"""
    dim_sum = sum(score.get(d, 0) for d in DIMS)
    total = score.get("总分", 0)

    if dim_sum != total:
        return False, f"维度加总{dim_sum}≠总分{total}"

    comment = score.get("评价", "")
    positive_words = ["优秀", "详实", "出色", "各维度均", "完美", "很好", "非常好"]
    negative_words = ["很差", "严重失实", "完全不合格", "根本性错误", "纯属虚构"]

    if total < 10:
        if any(w in comment for w in positive_words):
            return False, f"总分{total}但评价为正面({comment[:30]}...)"
    if total >= 20:
        if any(w in comment for w in negative_words):
            return False, f"总分{total}但评价为负面({comment[:30]}...)"

    return True, ""


def extract_json(content: str) -> Optional[dict]:
    """鲁棒地从 LLM 原始输出中提取 JSON 评分。"""
    # Step 1: 移除 <think>...</think> 块（闭合 + 未闭合）
    content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL)
    if '<think>' in content:
        brace_pos = content.rfind('{')
        if brace_pos > content.find('<think>'):
            content = content[brace_pos:]
        else:
            content = re.sub(r'<think>.*', '', content, flags=re.DOTALL)

    # Step 2: 移除 markdown 代码块标记
    content = content.strip()
    if "```" in content:
        parts = content.split("```")
        for p in parts:
            p = p.strip()
            if p.startswith("json"):
                p = p[4:]
            if p.startswith("{"):
                content = p
                break

    # Step 3: 多级 JSON 提取
    # 3a: 完整 JSON（含所有必需字段）
    json_match = re.search(r'\{[^{}]*"具体性"[^{}]*"总分"[^{}]*\}', content)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

    # 3b: 宽松匹配任意 {...} 对象
    json_match = re.search(r'\{[^{}]+\}', content)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

    # 3c: 截断 JSON 修复 — 逐字段正则提取
    dim_scores = {}
    for dim in DIMS + ["总分"]:
        m = re.search(rf'"{dim}"\s*:\s*(\d+)', content)
        if m:
            dim_scores[dim] = int(m.group(1))
    if len(dim_scores) >= 5:
        dim_scores["评价"] = "(截断恢复)"
        return dim_scores

    return None


def call_judge(entry: dict, config: dict, max_retries: int = 2) -> Optional[dict]:
    """调用单个裁判模型对单条数据进行评分。"""
    user_prompt = f"""请评分以下标注数据：

维度: {entry.get('dimension_name', '')} ({entry.get('dimension_id', '')})
文化圈: {entry.get('culture_name', '')} ({entry.get('culture_id', '')})
权重: {entry.get('weight', '')}

manifestation: {entry.get('manifestation', '')}
conflict_with_chinese: {entry.get('conflict_with_chinese', '')}
pragmatic_tip: {entry.get('pragmatic_tip', '')}
example_scenario: {entry.get('example_scenario', '')}"""

    payload = {
        "model": config["model"],
        "messages": [
            {"role": "system", "content": JUDGE_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": 1024,
        "temperature": 0.0,
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {config['api_key']}",
    }

    for attempt in range(max_retries + 1):
        try:
            resp = requests.post(config["api_url"], json=payload, headers=headers, timeout=60)
            if resp.status_code != 200:
                print(f"  ⚠️ {config['name']} API错误{resp.status_code}: {resp.text[:100]}")
                return None

            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            result = extract_json(content)

            if result is not None:
                ok, err_msg = validate_score(result)
                if ok:
                    return result
                else:
                    if attempt < max_retries:
                        print(f"🔄 {config['name']}校验失败({err_msg})重试...", end=" ", flush=True)
                        time.sleep(0.5)
                        continue
                    else:
                        print(f"⚠️ {config['name']}校验失败({err_msg})，使用该结果")
                        return result
            else:
                print(f"  ⚠️ {config['name']}未找到JSON，raw: {content[:100]}")
                return None

        except json.JSONDecodeError:
            print(f"  ⚠️ {config['name']} JSON解析失败")
            return None
        except Exception as e:
            print(f"  ⚠️ {config['name']} 请求异常: {e}")
            return None

    return None


def aggregate_dual_scores(score_a: dict, score_b: dict) -> dict:
    """聚合双裁判评分：各维度取平均（四舍五入），总分=维度平均之和。"""
    aggregated = {}
    for dim in DIMS:
        avg = (score_a.get(dim, 0) + score_b.get(dim, 0)) / 2
        aggregated[dim] = round(avg)
    aggregated["总分"] = sum(aggregated[d] for d in DIMS)

    total_a = score_a.get("总分", 0)
    total_b = score_b.get("总分", 0)
    diff = abs(total_a - total_b)
    if diff <= 3:
        aggregated["agreement"] = "high"
    elif diff <= 6:
        aggregated["agreement"] = "medium"
    else:
        aggregated["agreement"] = "low"

    aggregated["评价"] = f"[MiniMax:{score_a.get('评价','')}] [DeepSeek:{score_b.get('评价','')}]"
    return aggregated


def main():
    parser = argparse.ArgumentParser(description="MANIFESTED_IN 标注质量裁判（双裁判）")
    parser.add_argument("--input", required=True, help="Coze 生成的 JSON 文件")
    parser.add_argument("--sample", type=int, default=0, help="随机抽样数量（0=全部）")
    parser.add_argument("--threshold", type=int, default=20, help="通过阈值（默认20）")
    args = parser.parse_args()

    # 加载所有裁判配置
    all_configs = load_all_configs()
    active_judges = []
    for judge_id, cfg in all_configs.items():
        if cfg["api_key"]:
            active_judges.append(judge_id)
            print(f"🔑 {cfg['name']}: {cfg['api_url'][:50]}...")
        else:
            print(f"⚠️ {cfg['name']}: 未配置API Key，跳过")

    if len(active_judges) < 2:
        print("❌ 至少需要2个裁判模型，请检查 .env 配置")
        sys.exit(1)

    print(f"📄 输入文件: {args.input}")

    # 加载数据
    with open(args.input, encoding="utf-8") as f:
        content = f.read()

    if "```" in content:
        parts = content.split("```")
        for p in parts:
            p = p.strip()
            if p.startswith("json"):
                p = p[4:]
            if p.startswith("["):
                content = p
                break

    entries = json.loads(content)
    if not isinstance(entries, list):
        print("❌ 输入文件格式错误：期望 JSON 数组")
        sys.exit(1)

    print(f"📊 共 {len(entries)} 条记录")

    if args.sample > 0 and args.sample < len(entries):
        entries = random.sample(entries, args.sample)
        print(f"🎲 随机抽样 {args.sample} 条")

    # 逐条双裁判评分
    results = []
    passed = 0
    needs_fix = 0
    failed = 0
    low_agreement = 0

    for i, entry in enumerate(entries):
        key = f"{entry.get('dimension_id','?')}/{entry.get('culture_id','?')}"
        print(f"\n[{i+1}/{len(entries)}] {key}", end="", flush=True)

        # 调用两个裁判
        scores = {}
        for judge_id in active_judges:
            print(f" [{all_configs[judge_id]['name']}]...", end="", flush=True)
            score = call_judge(entry, all_configs[judge_id])
            if score:
                scores[judge_id] = score
            else:
                print(f"❌", end="", flush=True)

        if len(scores) < 2:
            print(" ❌ 双裁判均失败")
            results.append({"entry": entry, "scores": scores, "aggregated": None, "status": "error"})
            continue

        # 聚合
        agg = aggregate_dual_scores(scores["minimax"], scores["deepseek"])

        # 一致性标记
        agree_icon = {"high": "✓", "medium": "~", "low": "⚠️"}.get(agg["agreement"], "?")
        if agg["agreement"] == "low":
            low_agreement += 1

        total = agg["总分"]
        if total >= args.threshold:
            status = "passed"
            passed += 1
            icon = "✅"
        elif total >= 15:
            status = "needs_fix"
            needs_fix += 1
            icon = "🔧"
        else:
            status = "failed"
            failed += 1
            icon = "❌"

        mm_total = scores["minimax"].get("总分", "?")
        ds_total = scores["deepseek"].get("总分", "?")
        print(f" {icon} {total}/25 (MM:{mm_total} DS:{ds_total} {agree_icon}) | {agg.get('评价','')[:60]}")

        results.append({
            "entry": entry,
            "scores": scores,
            "aggregated": agg,
            "status": status,
        })

        time.sleep(0.3)

    # 汇总报告
    print("\n" + "=" * 60)
    print("📋 双裁判评分汇总")
    print("=" * 60)
    print(f"  总计: {len(results)} 条")
    print(f"  ✅ 通过 (≥{args.threshold}): {passed} 条 ({passed*100//max(len(results),1)}%)")
    print(f"  🔧 需修改 (15-{args.threshold-1}): {needs_fix} 条")
    print(f"  ❌ 不合格 (<15): {failed} 条")
    print(f"  ⚠️ 低一致性 (总分差>6): {low_agreement} 条")

    # 平均分（聚合后）
    valid_agg = [r["aggregated"]["总分"] for r in results if r.get("aggregated")]
    if valid_agg:
        avg = sum(valid_agg) / len(valid_agg)
        print(f"  📊 聚合平均分: {avg:.1f}/25")
        for dim in DIMS:
            dim_scores = [r["aggregated"][dim] for r in results if r.get("aggregated")]
            if dim_scores:
                print(f"     {dim}: {sum(dim_scores)/len(dim_scores):.1f}/5")

    # 低一致性条目
    low_items = [r for r in results if r.get("aggregated", {}).get("agreement") == "low"]
    if low_items:
        print(f"\n⚠️ 低一致性条目 ({len(low_items)} 条，建议人工复核):")
        for r in low_items:
            e = r["entry"]
            agg = r["aggregated"]
            mm_t = r["scores"]["minimax"]["总分"]
            ds_t = r["scores"]["deepseek"]["总分"]
            key = f"{e.get('dimension_id','?')}/{e.get('culture_id','?')}"
            print(f"  {key} MiniMax:{mm_t} DeepSeek:{ds_t} 差:{abs(mm_t-ds_t)} | {agg.get('评价','')[:80]}")

    # 不通过的条目
    problem_entries = [r for r in results if r["status"] in ("needs_fix", "failed")]
    if problem_entries:
        print(f"\n🔍 需要修改的条目 ({len(problem_entries)} 条):")
        for r in problem_entries:
            e = r["entry"]
            agg = r["aggregated"]
            key = f"{e.get('dimension_id','?')}/{e.get('culture_id','?')}"
            print(f"  [{r['status']}] {key} (聚合{agg['总分']}/25): {agg.get('评价','')[:80]}")

    # 保存评分结果
    output_path = args.input.replace(".json", "_judge_results.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n💾 评分结果已保存到: {output_path}")

    # 判断任务是否通过
    pass_rate = passed / max(len(results), 1)
    if pass_rate >= 0.8:
        print(f"\n🎉 整体通过率 {pass_rate:.0%} ≥ 80%，可以放心使用！")
    elif pass_rate >= 0.5:
        print(f"\n⚠️ 整体通过率 {pass_rate:.0%}，建议修改不通过项后重新评分")
    else:
        print(f"\n🚫 整体通过率 {pass_rate:.0%} < 50%，建议重新生成")


if __name__ == "__main__":
    main()
