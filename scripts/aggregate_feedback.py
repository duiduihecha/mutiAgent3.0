#!/usr/bin/env python3
"""CEO 用户测试：聚合留学生体验反馈。

读取 data/feedback.jsonl，输出：
  1. 总样本数 + 各维度平均分（1-5）
  2. 按母语 / HSK 分组的平均分
  3. 自由文字汇总（最喜欢 / 卡住 / 冒犯或错误 / 建议）
  4. 高危项快筛：内容准确性<3 或 文化对比准确性<3 的条目

用法：
  python3 scripts/aggregate_feedback.py
  python3 scripts/aggregate_feedback.py --file data/feedback.jsonl
"""
import json
import sys
from collections import defaultdict

RATING_LABELS = {
    "ease_of_use": "易用性",
    "native_explanation_clarity": "母语讲解清楚度(A2)",
    "cultural_comparison_helpful": "文化对比有用性(A3)",
    "cultural_comparison_accuracy": "文化对比准确性/冒犯(A3)",
    "exercise_quality": "练习题质量/难度(A4)",
    "content_accuracy": "内容准确性(幻觉)",
    "overall_satisfaction": "整体满意度",
}
FREE_LABELS = {
    "what_liked": "最喜欢",
    "what_confused": "卡住/没懂",
    "felt_offended_or_wrong": "不对/冒犯/错误",
    "suggestions": "改进建议",
}


def load(path):
    items = []
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    items.append(json.loads(line))
    except FileNotFoundError:
        print(f"[!] 未找到反馈文件: {path}（留学生还没提交？）")
        sys.exit(0)
    return items


def avg(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "data/feedback.jsonl"
    items = load(path)
    n = len(items)
    print(f"\n=== 反馈汇总（共 {n} 份）===\n")

    # 1. 各维度平均分
    print("【维度平均分 (1-5)】")
    for key, label in RATING_LABELS.items():
        vals = [it["ratings"].get(key) for it in items]
        a = avg(vals)
        print(f"  {label:28s}: {a:.2f}" if a is not None else f"  {label:28s}: 无数据")

    # 2. 分组
    for group_key, group_label in [("native_language", "母语"), ("hsk_level", "HSK")]:
        print(f"\n【按{group_label}分组（整体满意度均值）】")
        buckets = defaultdict(list)
        for it in items:
            gv = it["learner"].get(group_key) or "未填"
            buckets[gv].append(it)
        for gv, grp in sorted(buckets.items(), key=lambda x: -len(x[1])):
            a = avg([g["ratings"].get("overall_satisfaction") for g in grp])
            print(f"  {str(gv):12s} (n={len(grp):2d}): 满意度 {a:.2f}" if a is not None else f"  {str(gv):12s} (n={len(grp):2d}): 无评分")

    # 3. 自由文字
    print("\n【自由文字汇总】")
    for key, label in FREE_LABELS.items():
        print(f"\n-- {label} --")
        any_text = False
        for it in items:
            txt = it["free_text"].get(key, "").strip()
            if txt:
                any_text = True
                who = f"{it['learner'].get('native_language','?')}/{it['learner'].get('hsk_level') or '?'}"
                print(f"  [{who}] {txt}")
        if not any_text:
            print("  (无)")

    # 4. 高危项
    print("\n【⚠️ 高危项快筛：内容准确性<3 或 文化对比准确性<3】")
    flagged = [
        it for it in items
        if (it["ratings"].get("content_accuracy") or 5) < 3
        or (it["ratings"].get("cultural_comparison_accuracy") or 5) < 3
    ]
    if not flagged:
        print("  ✅ 无低分高危项")
    else:
        for it in flagged:
            ca = it["ratings"].get("content_accuracy")
            cca = it["ratings"].get("cultural_comparison_accuracy")
            who = f"{it['learner'].get('native_language','?')}/{it['learner'].get('hsk_level') or '?'}"
            print(f"  [{who}] 内容准确性={ca} 文化对比准确性={cca} | 冒犯/错误: {it['free_text'].get('felt_offended_or_wrong','')[:80]}")


if __name__ == "__main__":
    main()
