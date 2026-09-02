import unittest

from p2_protocol_tools import (
    aggregate_binary_labels, build_blind_pack, canonicalize_record,
    gate_sensitivity, manifest_fixture, scan_leaks, token_fairness,
    validate_canonical_static,
)


CASE = {"id": "case-1", "knowledge_point_id": "kp", "domain_name": "日常", "scene_name": "寒暄", "pragmatic_intent": "得体寒暄", "native_language": "英语圈", "hsk_level": 3, "anxiety_score": 50}


def record(condition="C1_Full", comparison=None):
    exercise = {"type": "fill_in_blank", "question": "请填空", "options": [], "correct_answer": "您好", "explanation": "答案", "dimension": "language"}
    return {"_tc_id": "case-1", "_cond": condition, "cross_cultural_comparison": {"ignored": "A3"}, "generated_content": {"cultural_context": {"explanation": "文化说明", "native_ratio": 0.7}, "comparison": comparison or {"cn": "中方", "target": "对方", "differences": [{"description": "差异"}]}, "language_points": [{"zh": "您好", "en": "hello", "note": "note"}] * 3, "exercises": [exercise] * 5}}


class CanonicalTests(unittest.TestCase):
    def test_uses_final_comparison_not_a3_field(self):
        item = canonicalize_record(record("C2_NoAgent_Monolith"), CASE, "EV-1")
        self.assertIn("中方", item["material"]["cross_cultural_comparison"])
        self.assertNotIn("A3", item["material"]["cross_cultural_comparison"])
        self.assertEqual(item["material"]["exercises"][0]["type"], "fill_blank")
        self.assertNotIn("native_ratio", str(item["material"]))
        self.assertEqual(validate_canonical_static(item), [])
        self.assertTrue(item["diagnostics"]["strict_complete"])

    def test_missing_container_is_retained(self):
        item = canonicalize_record({"_tc_id": "case-1", "_cond": "C3_NoA3"}, CASE, "EV-2")
        self.assertIn("NO_FINAL_CONTAINER", item["completeness"]["mapping_warnings"])
        self.assertEqual(item["material"]["cross_cultural_comparison"], "")

    def test_leak_scanner(self):
        item = canonicalize_record(record(comparison="monolith mode: embedded"), CASE, "EV-3")
        self.assertTrue(scan_leaks(item))


class FairnessTests(unittest.TestCase):
    def test_passes_equal_total_tokens_and_excludes_judge(self):
        calls = [
            {"call_id":"1", "base_case_id": "x", "condition": "C1_Full", "category": "generation", "model":"m", "messages_sha256":"h", "status":"success", "cost_cny":0, "usage": {"prompt_tokens":60,"completion_tokens":40,"total_tokens": 100}},
            {"call_id":"2", "base_case_id": "x", "condition": "C2_NoAgent_Monolith", "category": "generation", "model":"m", "messages_sha256":"h", "status":"success", "cost_cny":0, "usage": {"prompt_tokens":60,"completion_tokens":45,"total_tokens": 105}},
            {"call_id":"3", "base_case_id": "x", "condition": "C1_Full", "category": "judge", "model":"j", "messages_sha256":"j", "status":"success", "cost_cny":0, "usage": {"prompt_tokens":500,"completion_tokens":499,"total_tokens": 999}},
        ]
        self.assertTrue(token_fairness(calls)["passed"])

    def test_fails_missing_pair(self):
        calls = [{"call_id":"1", "base_case_id": "x", "condition": "C1_Full", "category": "generation", "model":"m", "messages_sha256":"h", "status":"success", "cost_cny":0, "usage": {"prompt_tokens":60,"completion_tokens":40,"total_tokens": 100}}]
        self.assertFalse(token_fairness(calls)["passed"])


class BlindPackTests(unittest.TestCase):
    def test_same_items_different_orders_and_no_adjacent_case(self):
        canonical, keys = [], []
        for ci in range(2):
            for condition in ["Full", "Mono", "NoA3"]:
                item_id = f"E-{ci}-{condition}"
                canonical.append(canonicalize_record(record(condition), {**CASE, "id": f"c{ci}"}, item_id))
                keys.append({"evaluation_item_id": item_id, "base_case_id": f"c{ci}", "condition": condition})
        pack = build_blind_pack(canonical, keys, ["c0", "c1"], ["Full", "Mono", "NoA3"], 42)
        self.assertEqual(set(pack["reviewer_1_order"]), set(pack["reviewer_2_order"]))
        key = {x["evaluation_item_id"]: x["base_case_id"] for x in keys}
        for order in [pack["reviewer_1_order"], pack["reviewer_2_order"]]:
            self.assertTrue(all(key[a] != key[b] for a, b in zip(order, order[1:])))


class AggregationTests(unittest.TestCase):
    def test_two_reviewer_truth(self):
        rows = [
            {"evaluation_item_id": "a", "exercise_qualified_yes_no": "yes"}, {"evaluation_item_id": "a", "exercise_qualified_yes_no": "yes"},
            {"evaluation_item_id": "b", "exercise_qualified_yes_no": "yes"}, {"evaluation_item_id": "b", "exercise_qualified_yes_no": "no"},
        ]
        truth = {x["evaluation_item_id"]: x["truth"] for x in aggregate_binary_labels(rows)}
        self.assertEqual(truth, {"a": "qualified", "b": "uncertain"})

    def test_uncertain_bounds_depend_on_gate_action(self):
        data = [
            {"gate_pass": False, "truth": "qualified"},
            {"gate_pass": True, "truth": "unqualified"},
            {"gate_pass": False, "truth": "uncertain"},
            {"gate_pass": True, "truth": "uncertain"},
        ]
        result = gate_sensitivity(data)
        self.assertEqual(result["main_excluding_uncertain"]["false_block_rate"], 1.0)
        self.assertEqual(result["main_excluding_uncertain"]["false_pass_rate"], 1.0)
        self.assertLess(result["exact_bounds"]["false_block_rate"]["lower"], 1.0)
        self.assertLess(result["exact_bounds"]["false_pass_rate"]["lower"], 1.0)

    def test_zero_denominator_is_none(self):
        result = gate_sensitivity([{"gate_pass": True, "truth": "qualified"}])
        self.assertIsNone(result["main_excluding_uncertain"]["false_pass_rate"])


class ManifestFixtureTests(unittest.TestCase):
    def test_fixture_has_zero_cost_and_required_telemetry(self):
        manifest, calls = manifest_fixture()
        self.assertEqual(manifest["cost"]["actual_cny"], 0)
        self.assertEqual(len(calls), 2)
        self.assertTrue(all("messages_sha256" in call and "usage" in call and "latency_ms" in call for call in calls))
        self.assertTrue(token_fairness(calls)["passed"])


if __name__ == "__main__":
    unittest.main()
