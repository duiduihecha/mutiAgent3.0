#!/usr/bin/env python3
"""Zero-cost local tools for the P2 evaluation protocol.

This module never imports network clients and never calls external services.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import itertools
import json
import math
import random
import re
import statistics
import time
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

WARNING_CODES = {
    "NO_FINAL_CONTAINER", "MISSING_EXPLANATION", "MISSING_COMPARISON",
    "MISSING_LANGUAGE_POINTS", "MISSING_EXERCISES", "INVALID_EXERCISE_SCHEMA",
    "UNRECOGNIZED_TYPE", "INVALID_LANGUAGE_POINT", "INCOMPLETE_EXERCISE",
}
LANGUAGE_META = {
    "英语圈": ("en", "English", None), "英语": ("en", "English", None),
    "日语圈": ("ja", "Japanese", r"[\u3040-\u30ff]"), "日语": ("ja", "Japanese", r"[\u3040-\u30ff]"),
    "韩语圈": ("ko", "Korean", r"[\uac00-\ud7af]"), "韩语": ("ko", "Korean", r"[\uac00-\ud7af]"),
    "阿拉伯语圈": ("ar", "Arabic", r"[\u0600-\u06ff]"), "阿拉伯语": ("ar", "Arabic", r"[\u0600-\u06ff]"),
    "俄语圈": ("ru", "Russian", r"[\u0400-\u04ff]"), "俄语": ("ru", "Russian", r"[\u0400-\u04ff]"),
    "西班牙语圈": ("es", "Spanish", None), "西班牙语": ("es", "Spanish", None),
    "法语圈": ("fr", "French", None), "法语": ("fr", "French", None),
    "东南亚文化圈": ("th", "Thai", r"[\u0e00-\u0e7f]"), "泰语": ("th", "Thai", r"[\u0e00-\u0e7f]"),
}
TYPE_ALIASES = {
    "multiple_choice": "multiple_choice", "选择题": "multiple_choice",
    "true_false": "true_false", "判断题": "true_false",
    "fill_blank": "fill_blank", "fill_in_blank": "fill_blank", "填空题": "fill_blank",
    "short_answer": "short_answer", "简答题": "short_answer",
}
LEAK_PATTERNS = re.compile(
    r"(?:C[1-5]_(?:Full|NoAgent|NoA3|NoA5|NoA2A3)|monolith mode|"
    r"A[1-5][-_ ](?:Agent|Quality|Cultural|Mother|Content)|Full\+KG|NoKG)", re.I
)


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    with path.open(encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_no}: invalid JSON: {exc}") from exc
    return rows


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        value = str(value)
    return unicodedata.normalize("NFC", value).replace("\r\n", "\n").replace("\r", "\n").strip()


def render_explanation(value: Any) -> str:
    if isinstance(value, str):
        return clean_text(value)
    if not isinstance(value, dict):
        return clean_text(value)
    # Freeze the observable generated artifact, not internal A2 controls such as
    # native_ratio.  Never fall back to serialising arbitrary dictionary keys.
    return clean_text(value.get("explanation", ""))


def render_comparison(value: Any) -> str:
    if isinstance(value, str):
        return clean_text(value)
    if not isinstance(value, dict):
        return clean_text(value)
    preferred = ["cn", "target", "similarities", "differences"]
    parts = []
    for key in preferred + sorted(set(value) - set(preferred)):
        if key in value and value[key] not in (None, "", [], {}):
            rendered = json.dumps(value[key], ensure_ascii=False, sort_keys=True) if isinstance(value[key], (dict, list)) else clean_text(value[key])
            parts.append(f"{key}: {rendered}")
    return "\n".join(parts)


def normalize_language_points(values: Any) -> list[dict[str, str]]:
    if not isinstance(values, list):
        return []
    result = []
    for value in values:
        if not isinstance(value, dict):
            continue
        result.append({
            "zh": clean_text(value.get("zh", "")),
            "native": clean_text(value.get("native", value.get("en", ""))),
            "note": clean_text(value.get("note", value.get("explanation", ""))),
        })
    return result


def normalize_exercises(values: Any, warnings: list[str]) -> list[dict[str, Any]]:
    if not isinstance(values, list):
        return []
    result = []
    for value in values:
        if not isinstance(value, dict):
            warnings.append("INVALID_EXERCISE_SCHEMA")
            continue
        raw_type = clean_text(value.get("type", ""))
        kind = TYPE_ALIASES.get(raw_type, "other")
        if kind == "other":
            warnings.append("UNRECOGNIZED_TYPE")
        options = value.get("options", [])
        if not isinstance(options, list):
            warnings.append("INVALID_EXERCISE_SCHEMA")
            options = []
        result.append({
            "type": kind,
            "question": clean_text(value.get("question", "")),
            "options": [clean_text(x) for x in options],
            "correct_answer": clean_text(value.get("correct_answer", "")),
            "explanation": clean_text(value.get("explanation", "")),
            "dimension": clean_text(value.get("dimension", "")),
        })
    return result


def canonicalize_record(record: dict[str, Any], case: dict[str, Any], item_id: str) -> dict[str, Any]:
    warnings: list[str] = []
    container_source = "generated_content"
    container = record.get(container_source)
    if not isinstance(container, dict) or not container:
        container_source = "learning_content"
        container = record.get(container_source)
    if not isinstance(container, dict) or not container:
        container = {}
        container_source = "missing"
        warnings.append("NO_FINAL_CONTAINER")

    explanation = render_explanation(container.get("cultural_context"))
    comparison = render_comparison(container.get("comparison"))
    language_points = normalize_language_points(container.get("language_points"))
    exercises = normalize_exercises(container.get("exercises"), warnings)
    if not explanation: warnings.append("MISSING_EXPLANATION")
    if not comparison: warnings.append("MISSING_COMPARISON")
    if not language_points: warnings.append("MISSING_LANGUAGE_POINTS")
    if not exercises: warnings.append("MISSING_EXERCISES")

    for point in language_points:
        if not point["zh"] or not point["native"]: warnings.append("INVALID_LANGUAGE_POINT")
    for exercise in exercises:
        base_ok = all(exercise.get(k) for k in ("question", "correct_answer", "explanation", "dimension"))
        type_ok = ((exercise["type"] == "multiple_choice" and len(exercise["options"]) == 4)
                   or (exercise["type"] == "true_false" and len(exercise["options"]) == 2)
                   or (exercise["type"] == "fill_blank" and len(exercise["options"]) == 0))
        if not base_ok or not type_ok: warnings.append("INCOMPLETE_EXERCISE")

    culture = clean_text(case.get("native_language", ""))
    lang = LANGUAGE_META.get(culture)
    material_text = "\n".join([explanation, comparison, json.dumps(language_points, ensure_ascii=False)])
    content_warnings: list[str] = []
    target_language_status = "UNKNOWN_TARGET_CULTURE"
    target_code, target_name = "unknown", "unknown"
    if lang:
        target_code, target_name, script = lang
        target_language_status = "NOT_CHECKABLE_LATIN_SCRIPT" if script is None else ("SCRIPT_PRESENT" if re.search(script, material_text) else "SCRIPT_NOT_DETECTED")
        if target_code != "en" and re.search(r"\b(?:English|Western|American|British)\b|英语|西方文化|美国文化", comparison, re.I):
            content_warnings.append("UNEXPECTED_ENGLISH_CULTURE_REFERENCE")
    else:
        content_warnings.append("UNKNOWN_TARGET_CULTURE")

    strict_complete = not warnings and len(language_points) in {3, 4, 5} and len(exercises) == 5

    anxiety = case.get("anxiety_score", 50)
    band = "unknown" if anxiety is None else "low" if anxiety < 40 else "high" if anxiety > 80 else "medium"
    return {
        "schema_version": "1.1",
        "evaluation_item_id": item_id,
        "task": {
            "knowledge_point_id": clean_text(case.get("knowledge_point_id", "")),
            "domain": clean_text(case.get("domain_name", case.get("domain_id", ""))),
            "scene": clean_text(case.get("scene_name", case.get("scene_id", ""))),
            "pragmatic_intent": clean_text(case.get("pragmatic_intent", "")),
            "native_culture": clean_text(case.get("native_language", "")),
            "hsk_level": int(case.get("hsk_level", 1)),
            "anxiety_band": band,
        },
        "material": {
            "explanation": explanation,
            "cross_cultural_comparison": comparison,
            "language_points": language_points,
            "exercises": exercises,
        },
        "completeness": {
            "explanation_present": bool(explanation), "comparison_present": bool(comparison),
            "language_points_present": bool(language_points), "exercises_present": bool(exercises),
            "exercise_count": len(exercises), "mapping_warnings": sorted(set(warnings)),
        },
        "source_audit": {
            "container_source": container_source,
            "explanation_source": f"{container_source}.cultural_context.explanation",
            "comparison_source": f"{container_source}.comparison",
            "language_points_source": f"{container_source}.language_points",
            "exercises_source": f"{container_source}.exercises",
            "excluded_internal_fields": ["cultural_explanation", "cross_cultural_comparison", "cultural_context.native_ratio"],
        },
        "diagnostics": {
            "strict_complete": strict_complete,
            "content_warnings": sorted(set(content_warnings)),
            "target_culture_code": target_code,
            "target_language_name": target_name,
            "target_language_status": target_language_status,
            "explicit_condition_leaks": [],
            "material_char_count": len(material_text),
        },
    }


def convert_records(records: list[dict[str, Any]], cases: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    case_map = {str(case.get("id")): case for case in cases}
    canonical, key_rows = [], []
    for index, record in enumerate(records):
        tc_id, condition = str(record.get("_tc_id", "")), str(record.get("_cond", ""))
        digest = hashlib.sha256(f"canonical-v1.1|{tc_id}|{condition}|{index}".encode()).hexdigest()[:16]
        item_id = f"EV-{digest}"
        case = case_map.get(tc_id)
        if case is None:
            # Historical 26-case IDs encode culture and HSK but were not kept in
            # the current 168-case registry. Recover only explicit metadata and
            # mark provenance; never guess domain/scene content.
            match = re.search(r"_(en|ja|ko|es|ar|ru|fr|th)_hsk(\d+)$", tc_id)
            code_to_culture = {"en":"英语圈","ja":"日语圈","ko":"韩语圈","es":"西班牙语圈","ar":"阿拉伯语圈","ru":"俄语圈","fr":"法语圈","th":"东南亚文化圈"}
            case = {"id": tc_id, "knowledge_point_id": re.sub(r"_(?:en|ja|ko|es|ar|ru|fr|th)_hsk\d+$", "", tc_id)}
            if match:
                case.update({"native_language": code_to_culture[match.group(1)], "hsk_level": int(match.group(2)), "metadata_source": "parsed_from_frozen_case_id"})
        item = canonicalize_record(record, case, item_id)
        canonical.append(item)
        key_rows.append({"evaluation_item_id": item_id, "base_case_id": tc_id, "condition": condition})
    return canonical, key_rows


def scan_leaks(item: dict[str, Any]) -> list[str]:
    text = json.dumps(item.get("material", {}), ensure_ascii=False)
    return sorted(set(match.group(0) for match in LEAK_PATTERNS.finditer(text)))


def validate_canonical_static(item: dict[str, Any]) -> list[str]:
    """Strict, dependency-locked substitute for a JSON-Schema engine."""
    errors = []
    if set(item) != {"schema_version", "evaluation_item_id", "task", "material", "completeness", "source_audit", "diagnostics"}: errors.append("TOP_LEVEL_KEYS")
    if item.get("schema_version") != "1.1": errors.append("SCHEMA_VERSION")
    if not isinstance(item.get("evaluation_item_id"), str): errors.append("ITEM_ID_TYPE")
    material = item.get("material")
    if not isinstance(material, dict) or set(material) != {"explanation", "cross_cultural_comparison", "language_points", "exercises"}: errors.append("MATERIAL_SHAPE")
    elif not isinstance(material["explanation"], str) or not isinstance(material["cross_cultural_comparison"], str) or not isinstance(material["language_points"], list) or not isinstance(material["exercises"], list): errors.append("MATERIAL_TYPES")
    for key in ("task", "completeness", "source_audit", "diagnostics"):
        if not isinstance(item.get(key), dict): errors.append(f"{key.upper()}_TYPE")
    return errors


def build_blind_pack(canonical: list[dict[str, Any]], key_rows: list[dict[str, str]], base_case_ids: list[str], conditions: list[str], seed: int) -> dict[str, Any]:
    key_by_item = {row["evaluation_item_id"]: row for row in key_rows}
    selected = [item for item in canonical if key_by_item[item["evaluation_item_id"]]["base_case_id"] in base_case_ids and key_by_item[item["evaluation_item_id"]]["condition"] in conditions]
    expected = len(base_case_ids) * len(conditions)
    if len(selected) != expected:
        raise ValueError(f"blind pack expected {expected} items, got {len(selected)}")
    leaks = {item["evaluation_item_id"]: scan_leaks(item) for item in selected if scan_leaks(item)}

    def order_for(offset: int) -> list[str]:
        rng = random.Random(seed + offset)
        remaining = selected[:]
        rng.shuffle(remaining)
        ordered: list[dict[str, Any]] = []
        while remaining:
            previous_case = key_by_item[ordered[-1]["evaluation_item_id"]]["base_case_id"] if ordered else None
            candidates = [x for x in remaining if key_by_item[x["evaluation_item_id"]]["base_case_id"] != previous_case] or remaining
            choice = rng.choice(candidates)
            ordered.append(choice); remaining.remove(choice)
        return [x["evaluation_item_id"] for x in ordered]

    display = [{k: item[k] for k in ("schema_version", "evaluation_item_id", "task", "material")} for item in selected]
    return {"items": display, "reviewer_1_order": order_for(101), "reviewer_2_order": order_for(202), "leaks": leaks}


def token_fairness(calls: list[dict[str, Any]], left: str = "C1_Full", right: str = "C2_NoAgent_Monolith", pair_tolerance: float = 0.10, mean_tolerance: float = 0.05, planned_cases: list[str] | None = None, budget_limit_cny: float | None = None) -> dict[str, Any]:
    totals: dict[tuple[str, str], int] = defaultdict(int)
    audit_errors: list[str] = []
    call_ids, total_cost = set(), 0.0
    for call in calls:
        call_id = str(call.get("call_id", ""))
        if not call_id or call_id in call_ids: audit_errors.append("MISSING_OR_DUPLICATE_CALL_ID")
        call_ids.add(call_id)
        if call.get("status") == "success":
            usage = call.get("usage")
            if not isinstance(usage, dict): audit_errors.append(f"{call_id}:MISSING_USAGE")
            elif int(usage.get("prompt_tokens", 0)) + int(usage.get("completion_tokens", 0)) != int(usage.get("total_tokens", -1)): audit_errors.append(f"{call_id}:USAGE_SUM_MISMATCH")
        for field in ("messages_sha256", "model"):
            if not call.get(field): audit_errors.append(f"{call_id}:MISSING_{field.upper()}")
        if call.get("cost_cny") is None: audit_errors.append(f"{call_id}:UNKNOWN_COST")
        else: total_cost += float(call["cost_cny"])
        retry_of = call.get("retry_of")
        if retry_of and retry_of not in call_ids: audit_errors.append(f"{call_id}:INVALID_RETRY_OF")
        if call.get("category") != "generation":
            continue
        if call.get("status", "success") != "success":
            continue
        usage = call.get("usage", {})
        total = usage.get("total_tokens")
        if total is None:
            total = int(usage.get("prompt_tokens", 0)) + int(usage.get("completion_tokens", 0))
        totals[(str(call["base_case_id"]), str(call["condition"]))] += int(total)
    cases = sorted(set(planned_cases or []) | {case for case, cond in totals if cond in {left, right}})
    pairs = []
    for case in cases:
        a, b = totals.get((case, left)), totals.get((case, right))
        if a is None or b is None:
            pairs.append({"base_case_id": case, "left": a, "right": b, "relative_difference": None, "passed": False})
            continue
        rel = abs(a - b) / max(a, b) if max(a, b) else 0.0
        pairs.append({"base_case_id": case, "left": a, "right": b, "relative_difference": rel, "passed": rel <= pair_tolerance})
    valid = [p for p in pairs if p["left"] is not None and p["right"] is not None]
    left_mean = statistics.mean(p["left"] for p in valid) if valid else None
    right_mean = statistics.mean(p["right"] for p in valid) if valid else None
    mean_rel = abs(left_mean - right_mean) / max(left_mean, right_mean) if valid and max(left_mean, right_mean) else None
    if budget_limit_cny is not None and total_cost > budget_limit_cny: audit_errors.append("BUDGET_EXCEEDED")
    passed = not audit_errors and bool(pairs) and all(p["passed"] for p in pairs) and mean_rel is not None and mean_rel <= mean_tolerance
    return {"left": left, "right": right, "pair_tolerance": pair_tolerance, "mean_tolerance": mean_tolerance, "pairs": pairs, "left_mean": left_mean, "right_mean": right_mean, "mean_relative_difference": mean_rel, "total_cost_cny": total_cost, "audit_errors": audit_errors, "passed": passed}


def aggregate_binary_labels(review_rows: list[dict[str, str]], label_field: str = "exercise_qualified_yes_no") -> list[dict[str, str]]:
    grouped: dict[str, list[str]] = defaultdict(list)
    for row in review_rows:
        value = row.get(label_field, "").strip().lower()
        if value not in {"yes", "no"}:
            raise ValueError(f"invalid {label_field}: {value!r}")
        grouped[row["evaluation_item_id"]].append(value)
    result = []
    for item_id, labels in sorted(grouped.items()):
        if len(labels) != 2:
            raise ValueError(f"{item_id}: expected exactly two reviews, got {len(labels)}")
        truth = "qualified" if labels == ["yes", "yes"] else "unqualified" if labels == ["no", "no"] else "uncertain"
        result.append({"evaluation_item_id": item_id, "reviewer_1": labels[0], "reviewer_2": labels[1], "truth": truth})
    return result


def _rates(assignments: list[tuple[bool, bool]]) -> dict[str, Any]:
    # tuple: gate_pass, human_qualified
    qualified = sum(q for _, q in assignments)
    unqualified = len(assignments) - qualified
    false_block = sum((not gate) and q for gate, q in assignments)
    false_pass = sum(gate and (not q) for gate, q in assignments)
    return {
        "false_block_n": false_block, "qualified_n": qualified,
        "false_block_rate": false_block / qualified if qualified else None,
        "false_pass_n": false_pass, "unqualified_n": unqualified,
        "false_pass_rate": false_pass / unqualified if unqualified else None,
    }


def gate_sensitivity(items: list[dict[str, Any]]) -> dict[str, Any]:
    fixed, uncertain = [], []
    for item in items:
        gate = bool(item["gate_pass"])
        truth = item["truth"]
        if truth == "qualified": fixed.append((gate, True))
        elif truth == "unqualified": fixed.append((gate, False))
        elif truth == "uncertain": uncertain.append(gate)
        else: raise ValueError(f"invalid truth: {truth}")
    main = _rates(fixed)
    if len(uncertain) <= 24:
        possibilities = []
        for values in itertools.product([False, True], repeat=len(uncertain)):
            possibilities.append(_rates(fixed + list(zip(uncertain, values))))
    else:
        # Exact analytic candidates: a ratio of linear counts reaches extrema at
        # group boundaries, so evaluate all counts assigned qualified within
        # gate-pass and gate-block uncertain groups.
        up, ub = sum(uncertain), len(uncertain) - sum(uncertain)
        possibilities = []
        for q_pass in range(up + 1):
            for q_block in range(ub + 1):
                assignments = fixed + [(True, True)] * q_pass + [(True, False)] * (up - q_pass) + [(False, True)] * q_block + [(False, False)] * (ub - q_block)
                possibilities.append(_rates(assignments))
    bounds = {}
    for metric in ["false_block_rate", "false_pass_rate"]:
        values = [x[metric] for x in possibilities if x[metric] is not None]
        bounds[metric] = {"lower": min(values), "upper": max(values)} if values else {"lower": None, "upper": None}
    return {"main_excluding_uncertain": main, "uncertain_n": len(uncertain), "exact_bounds": bounds}


def manifest_fixture() -> tuple[dict[str, Any], list[dict[str, Any]]]:
    now = "2026-08-26T00:00:00Z"
    calls = [
        {"call_id": "fixture-1", "base_case_id": "case-1", "condition": "C1_Full", "category": "generation", "provider": "fixture", "model": "fixture-v1", "messages_sha256": "0" * 64, "knowledge_sha256": "7" * 64, "temperature": 0.0, "started_at": now, "ended_at": now, "latency_ms": 12, "usage": {"prompt_tokens": 60, "completion_tokens": 40, "total_tokens": 100, "estimated": False}, "cost_cny": 0.0, "status": "success", "error": None, "retry_of": None},
        {"call_id": "fixture-2", "base_case_id": "case-1", "condition": "C2_NoAgent_Monolith", "category": "generation", "provider": "fixture", "model": "fixture-v1", "messages_sha256": "1" * 64, "knowledge_sha256": "7" * 64, "temperature": 0.0, "started_at": now, "ended_at": now, "latency_ms": 10, "usage": {"prompt_tokens": 55, "completion_tokens": 45, "total_tokens": 100, "estimated": False}, "cost_cny": 0.0, "status": "success", "error": None, "retry_of": None},
    ]
    manifest = {"schema_version": "1.0", "experiment_id": "fixture", "run_id": "fixture-zero-cost", "stage": "local_reanalysis", "research_questions": ["RQ1"], "timestamps": {"started_at": now, "ended_at": now, "timezone": "Asia/Shanghai"}, "conditions": ["C1_Full", "C2_NoAgent_Monolith"], "versions": {"code_commit": None, "code_dirty": None, "source_archive_sha256": "2" * 64, "dataset_version": "fixture", "dataset_sha256": "3" * 64, "case_list_sha256": "4" * 64, "canonical_schema_version": "1.0", "converter_sha256": "5" * 64}, "generation_config": {"provider": "fixture", "model": "fixture-v1", "model_version": "1", "endpoint_id": "local-fixture", "temperature": 0.0, "top_p": 1.0, "seed": 1, "max_input_tokens": 100, "max_output_tokens": 100, "timeout_ms": 1000, "max_retries": 0, "prompt_template_sha256": "6" * 64}, "fairness": {"primary_metric": "sum_prompt_plus_completion_tokens", "pair_tolerance_pct": 10, "condition_mean_tolerance_pct": 5, "passed": True, "notes": []}, "counts": {"planned_calls": 2, "completed_calls": 2, "failed_calls": 0, "retry_calls": 0}, "cost": {"budget_limit_cny": 0, "estimated_cny": 0, "actual_cny": 0, "status": "zero_cost"}, "artifacts": [], "approval": {"protocol_frozen_by": "P2", "execution_approved_by": "P0", "approved_at": now, "stop_reason": None}}
    return manifest, calls


def command_convert(args: argparse.Namespace) -> None:
    records, cases = load_jsonl(Path(args.input)), json.loads(Path(args.cases).read_text(encoding="utf-8"))
    canonical, keys = convert_records(records, cases)
    write_jsonl(Path(args.output), canonical)
    with Path(args.key).open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["evaluation_item_id", "base_case_id", "condition"]); writer.writeheader(); writer.writerows(keys)
    static_errors = {x["evaluation_item_id"]: validate_canonical_static(x) for x in canonical if validate_canonical_static(x)}
    summary = {"input_records": len(records), "output_records": len(canonical), "schema_valid": len(canonical) - len(static_errors), "strict_complete": sum(x["diagnostics"]["strict_complete"] for x in canonical), "warnings": dict(Counter(w for x in canonical for w in x["completeness"]["mapping_warnings"])), "content_warnings": dict(Counter(w for x in canonical for w in x["diagnostics"]["content_warnings"])), "native_ratio_leaks": sum("native_ratio" in json.dumps(x["material"], ensure_ascii=False) for x in canonical), "output_sha256": sha256_file(Path(args.output))}
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    convert = sub.add_parser("convert"); convert.add_argument("--input", required=True); convert.add_argument("--cases", required=True); convert.add_argument("--output", required=True); convert.add_argument("--key", required=True); convert.set_defaults(func=command_convert)
    args = parser.parse_args(); args.func(args)


if __name__ == "__main__":
    main()
