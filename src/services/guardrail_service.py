"""
GuardrailService — TCSL 平台核心防幻觉拦截网关

架构：DeepSeek-V4 + Qwen 双模型交叉校验 + Embedding 语义比对 + 硬规则过滤器

设计原则：
  - 任何外部 API 异常均不向上传播，统一返回兜底字典
  - 每个校验方法自洽、独立，单点故障不波及其他节点
  - 日志分级记录：INFO（正常流水）/ WARNING（降级通过）/ ERROR（触发熔断或异常）
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np
from pydantic import BaseModel, Field, ValidationError, field_validator

# ============================================================================
# 日志配置
# ============================================================================

logger = logging.getLogger("guardrail")
logger.setLevel(logging.DEBUG)

if not logger.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter(
        "[%(asctime)s] %(levelname)-8s [Guardrail] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))
    logger.addHandler(h)


# ============================================================================
# Pydantic 数据模型 — 对外统一返回结构 & 练习题强类型校验
# ============================================================================

class GuardrailVerdict(BaseModel):
    """所有校验方法的统一返回结构"""
    passed: bool
    action: str  # "PASS" | "FLAG_PENDING_REVIEW" | "FLAG_REJECT"
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    detail: dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None


class ExerciseItem(BaseModel):
    """A4 练习题强类型 Schema"""
    question_stem: str = Field(..., min_length=1, description="题干")
    options: list[str] = Field(..., min_length=4, max_length=4, description="4个选项")
    answer_key: str = Field(..., min_length=1, max_length=1, description="正确答案字母 A/B/C/D")
    pinyin_guide: Optional[str] = Field(default=None, description="拼音标注")
    dimension: Optional[str] = Field(default=None)
    explanation: Optional[str] = Field(default=None)

    @field_validator("answer_key")
    @classmethod
    def answer_must_be_letter(cls, v: str) -> str:
        if v.upper() not in ("A", "B", "C", "D"):
            raise ValueError(f"answer_key 必须是 A/B/C/D, 收到: {v}")
        return v.upper()

    @field_validator("options")
    @classmethod
    def options_must_be_four(cls, v: list[str]) -> list[str]:
        if len(v) != 4:
            raise ValueError(f"options 必须恰好 4 个, 收到: {len(v)}")
        return v


class A5ReviewScore(BaseModel):
    """A5 双模型评审原子维度评分"""
    pinyin_accuracy: float = Field(ge=0.0, le=1.0)
    distractor_quality: float = Field(ge=0.0, le=1.0)
    cultural_compliance: float = Field(ge=0.0, le=1.0)
    level_appropriateness: float = Field(ge=0.0, le=1.0)
    overall_score: float = Field(ge=0.0, le=1.0)
    is_qualified: bool


# ============================================================================
# 拼音正则 — 预编译（覆盖 āáǎà ēéěè īíǐì ōóǒò ūúǔù ǖǘǚǜ）
# ============================================================================

_PINYIN_SYLLABLE = (
    r"[bpmfdtnlgkhjqxrzcsyw]?"
    r"(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?"
    r"(?:[a-zāĀáÁǎǍàÀ"
    r"ēĒéÉěĚèÈ"
    r"īĪíÍǐǏìÌ"
    r"ōŌóÓǒǑòÒ"
    r"ūŪúÚǔǓùÙ"
    r"ǖǕǘǗǚǙǜǛüÜ"
    r"ng?|er|r)"
    r"[1-5]?"
)

_PINYIN_LINE_PATTERN = re.compile(
    r"^" + _PINYIN_SYLLABLE + r"(\s+" + _PINYIN_SYLLABLE + r")*[\s,.!?;:'\"()\[\]{}，。！？；：""''（）【】]*$"
)

# 合法拼音声调字符集（用于快速预检）
_PINYIN_TONE_CHARS = set(
    "aāáǎàeēéěèiīíǐìoōóǒòuūúǔùüǖǘǚǜ"
    "bcdfghjklmnpqrstwxyz"
    "AĀÁǍÀEĒÉĚÈIĪÍǏÌOŌÓǑÒUŪÚǓÙÜǕǗǙǛ"
    "BCDFGHJKLMNPQRSTWXYZ 12345"
    ",.!?;:'\"()[]{}，。！？；：""''（）【】"
)

# 中文字符 Unicode 范围
_CHINESE_CHAR_PATTERN = re.compile(r"[一-鿿㐀-䶿]")

# ============================================================================
# 兜底函数 — 所有异常的安全网
# ============================================================================

def _safe_fallback(error: Exception, method: str, extra: dict | None = None) -> dict:
    """统一的异常兜底：记录错误 → 返回 FLAG_PENDING_REVIEW"""
    logger.error(
        "[%s] 异常触发安全兜底 | %s: %s",
        method, type(error).__name__, str(error)[:200],
        exc_info=True,
    )
    detail = {"method": method, "exception_type": type(error).__name__}
    if extra:
        detail.update(extra)
    return {
        "passed": False,
        "action": "FLAG_PENDING_REVIEW",
        "confidence": 0.0,
        "detail": detail,
        "error": f"[{type(error).__name__}] {str(error)[:300]}",
    }


# ============================================================================
# 工具函数
# ============================================================================

def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """计算两个向量的余弦相似度，处理零向量边界"""
    a = np.asarray(vec_a, dtype=np.float64)
    b = np.asarray(vec_b, dtype=np.float64)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a < 1e-9 or norm_b < 1e-9:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def extract_chinese_words(text: str) -> set[str]:
    """从文本中提取所有中文字符组成的词（简单分词：连续中文作为一个词）"""
    words: set[str] = set()
    for match in _CHINESE_CHAR_PATTERN.finditer(text):
        words.add(match.group())
    return words


# ============================================================================
# GuardrailService 主类
# ============================================================================

class GuardrailService:
    """
    TCSL 防幻觉拦截网关

    四道防线：
      1. verify_a2_translation      — 异构回译 + Embedding 语义比对
      2. verify_a4_solver_adversarial — Generator-Solver 对抗盲测
      3. pre_a5_hard_rules_filter   — 拼音/HSK 硬规则
      4. verify_a5_joint_arbitration — 双模型联席仲裁
    """

    # 阈值常量
    BACK_TRANSLATION_THRESHOLD: float = 0.82
    JOINT_ARBITRATION_MAX_DELTA: float = 0.15

    def __init__(self, ds_client: Any, qwen_client: Any, embedding_client: Any):
        """
        Args:
            ds_client:   DeepSeek-V4 客户端，需实现 async generate(prompt, temperature, max_tokens) -> str
            qwen_client: Qwen 客户端，   需实现 async generate(prompt, temperature, max_tokens) -> str
            embedding_client: 向量模型客户端，需实现 async embed(texts: list[str]) -> list[list[float]]
        """
        self.ds_client = ds_client
        self.qwen_client = qwen_client
        self.embedding_client = embedding_client
        self._pinyin_re = _PINYIN_LINE_PATTERN
        self._pinyin_tone_set = _PINYIN_TONE_CHARS
        logger.info(
            "GuardrailService 初始化完成 | DS=%s | Qwen=%s | Embedding=%s | THRESHOLD=%.2f",
            type(ds_client).__name__,
            type(qwen_client).__name__,
            type(embedding_client).__name__,
            self.BACK_TRANSLATION_THRESHOLD,
        )

    # ========================================================================
    # 1. 异构模型回译校验 (A2 母语阐释)
    # ========================================================================

    async def verify_a2_translation(
        self,
        original_chinese: str,
        target_lang: str,
        ds_generated_text: str,
    ) -> dict:
        """
        DeepSeek 生成母语阐释 → Qwen 反向回译为中文 → Embedding 语义比对

        防止同模型自圆其说的欺骗性幻觉。Qwen 作为独立"破环者"回译，
        若回译结果与原文语义偏离过大（cosine < 0.82），标记待审核。

        Returns:
            {"passed": bool, "action": str, "confidence": float, "detail": {...}}
        """
        method = "verify_a2_translation"
        t0 = time.monotonic()
        logger.info("[%s] 开始 | target_lang=%s | original_len=%d | ds_text_len=%d",
                     method, target_lang, len(original_chinese), len(ds_generated_text))

        try:
            # ---- Step 1: Qwen 反向回译 ----
            back_prompt = (
                f"你是一个专业的中文翻译。请将以下{target_lang}文本严格、精确地翻译成中文。\n"
                f"只输出翻译后的中文，不要添加任何解释、注释或额外内容。\n\n"
                f"原文:\n{ds_generated_text}\n\n翻译:"
            )

            try:
                qwen_back_translation = await asyncio.wait_for(
                    self.qwen_client.generate(back_prompt, temperature=0.0, max_tokens=1024),
                    timeout=30.0,
                )
                qwen_back_translation = (qwen_back_translation or "").strip()
            except asyncio.TimeoutError:
                logger.warning("[%s] Qwen 回译超时 (30s)", method)
                return _safe_fallback(
                    TimeoutError("Qwen 回译超时"), method,
                    {"step": "qwen_back_translation"}
                )

            if not qwen_back_translation:
                logger.warning("[%s] Qwen 回译返回空内容", method)
                return {
                    "passed": False,
                    "action": "FLAG_PENDING_REVIEW",
                    "confidence": 0.0,
                    "detail": {"step": "qwen_back_translation", "reason": "回译结果为空"},
                    "error": "Qwen 回译返回空内容",
                }

            logger.debug("[%s] Qwen 回译完成 | len=%d", method, len(qwen_back_translation))

            # ---- Step 2: Embedding 语义比对 ----
            try:
                embeddings = await asyncio.wait_for(
                    self.embedding_client.embed([original_chinese, qwen_back_translation]),
                    timeout=15.0,
                )
                vec_original = embeddings[0]
                vec_back = embeddings[1]
            except asyncio.TimeoutError:
                logger.warning("[%s] Embedding 调用超时 (15s)", method)
                return _safe_fallback(
                    TimeoutError("Embedding 调用超时"), method,
                    {"step": "embedding"}
                )

            similarity = cosine_similarity(vec_original, vec_back)
            passed = similarity >= self.BACK_TRANSLATION_THRESHOLD

            elapsed = time.monotonic() - t0
            logger.info(
                "[%s] 完成 | similarity=%.4f | threshold=%.2f | passed=%s | elapsed=%.2fs",
                method, similarity, self.BACK_TRANSLATION_THRESHOLD, passed, elapsed,
            )

            return {
                "passed": passed,
                "action": "PASS" if passed else "FLAG_PENDING_REVIEW",
                "confidence": round(similarity, 4),
                "detail": {
                    "cosine_similarity": round(similarity, 4),
                    "threshold": self.BACK_TRANSLATION_THRESHOLD,
                    "qwen_back_translation": qwen_back_translation[:500],
                    "elapsed_ms": round(elapsed * 1000),
                },
                "error": None,
            }

        except Exception as exc:
            return _safe_fallback(exc, method)

    # ========================================================================
    # 2. Generator-Solver 对抗盲测 (A4 练习题)
    # ========================================================================

    async def verify_a4_solver_adversarial(self, generated_json: dict) -> dict:
        """
        Solver Agent 盲解 A4 生成的练习题，验证答案自洽性。

        流程：
          1. Pydantic 强类型校验输入 JSON
          2. 剥离 answer_key，构建纯净做题 Prompt
          3. DeepSeek (temperature=0.0) 盲解
          4. 比对答案 → 不一致则 FLAG_REJECT

        Returns:
            {"passed": bool, "action": str, "confidence": float, "detail": {...}}
        """
        method = "verify_a4_solver_adversarial"
        t0 = time.monotonic()
        logger.info("[%s] 开始", method)

        try:
            # ---- Step 1: Pydantic 强类型校验 ----
            try:
                exercise = ExerciseItem(**generated_json)
            except ValidationError as ve:
                logger.warning("[%s] Pydantic 校验失败 | errors=%d", method, len(ve.errors()))
                return {
                    "passed": False,
                    "action": "FLAG_REJECT",
                    "confidence": 0.0,
                    "detail": {"validation_errors": ve.errors()},
                    "error": f"Pydantic 校验失败: {ve.error_count()} 个字段不合法",
                }

            # ---- Step 2: 构建纯净 Solver Prompt ----
            options_text = "\n".join(
                f"{chr(65 + i)}. {opt}" for i, opt in enumerate(exercise.options)
            )
            solver_prompt = (
                "你是一个对外汉语考试答题助手。请仔细阅读题目和选项，选出唯一正确的答案。\n"
                "只输出正确选项的字母（A/B/C/D），不要输出任何其他内容。\n\n"
                f"题目：{exercise.question_stem}\n\n"
                f"选项：\n{options_text}\n\n"
                "正确答案："
            )

            # ---- Step 3: Solver 盲解 ----
            try:
                solver_answer = await asyncio.wait_for(
                    self.ds_client.generate(solver_prompt, temperature=0.0, max_tokens=4),
                    timeout=30.0,
                )
                solver_answer = (solver_answer or "").strip().upper()
            except asyncio.TimeoutError:
                logger.warning("[%s] Solver 盲解超时 (30s)", method)
                return _safe_fallback(
                    TimeoutError("Solver 盲解超时"), method,
                    {"step": "solver_blind_test"}
                )

            # 提取第一个 A-D 字母
            solver_letter = ""
            for ch in solver_answer:
                if ch in "ABCD":
                    solver_letter = ch
                    break

            if not solver_letter:
                logger.warning("[%s] Solver 未返回有效字母 | raw=%r", method, solver_answer[:50])
                return {
                    "passed": False,
                    "action": "FLAG_PENDING_REVIEW",
                    "confidence": 0.0,
                    "detail": {"solver_raw_output": solver_answer[:100]},
                    "error": "Solver 盲解未返回有效选项字母",
                }

            # ---- Step 4: 答案比对 ----
            correct_answer = exercise.answer_key.upper()
            passed = solver_letter == correct_answer

            elapsed = time.monotonic() - t0
            logger.info(
                "[%s] 完成 | solver=%s | expected=%s | passed=%s | elapsed=%.2fs",
                method, solver_letter, correct_answer, passed, elapsed,
            )

            return {
                "passed": passed,
                "action": "PASS" if passed else "FLAG_REJECT",
                "confidence": 1.0 if passed else 0.0,
                "detail": {
                    "solver_answer": solver_letter,
                    "expected_answer": correct_answer,
                    "solver_raw": solver_answer[:100],
                    "elapsed_ms": round(elapsed * 1000),
                },
                "error": None if passed else f"Solver 盲解得 {solver_letter}, 期望 {correct_answer}",
            }

        except Exception as exc:
            return _safe_fallback(exc, method)

    # ========================================================================
    # 3. 确定性硬规则过滤器 (A5 前置)
    # ========================================================================

    def pre_a5_hard_rules_filter(
        self,
        generated_json: dict,
        hsk_whitelist: list[str],
    ) -> dict:
        """
        不含 LLM 调用的硬规则校验（100% 确定、零幻觉风险）：
          1. 拼音格式硬卡点：正则检测声调拼音合法性
          2. HSK 超纲词强校验：题干中文 vs 白名单

        Returns:
            dict 同 GuardrailVerdict 结构
        """
        method = "pre_a5_hard_rules_filter"
        t0 = time.monotonic()
        logger.info("[%s] 开始 | whitelist_size=%d", method, len(hsk_whitelist))
        violations: list[dict] = []

        try:
            question_stem = generated_json.get("question_stem", "")
            pinyin_guide = generated_json.get("pinyin_guide") or ""

            # ---- 规则 1: 拼音格式校验 ----
            if pinyin_guide:
                pinyin_ok, pinyin_detail = self._validate_pinyin(pinyin_guide)
                if not pinyin_ok:
                    violations.append({
                        "rule": "PINYIN_FORMAT",
                        "detail": pinyin_detail,
                    })
                    logger.warning("[%s] 拼音格式校验失败 | %s", method, pinyin_detail)

            # ---- 规则 2: HSK 超纲词校验 ----
            if question_stem:
                chinese_words = extract_chinese_words(question_stem)
                hsk_set = set(hsk_whitelist)
                out_of_scope = chinese_words - hsk_set
                if out_of_scope:
                    violations.append({
                        "rule": "HSK_LEVEL_MISMATCH",
                        "out_of_scope_chars": sorted(out_of_scope)[:30],
                        "total_out_of_scope": len(out_of_scope),
                    })
                    logger.warning(
                        "[%s] HSK超纲 | 超纲字数=%d | samples=%s",
                        method, len(out_of_scope),
                        ", ".join(sorted(out_of_scope)[:10]),
                    )

            passed = len(violations) == 0
            elapsed = time.monotonic() - t0

            logger.info(
                "[%s] 完成 | passed=%s | violations=%d | elapsed=%.2fms",
                method, passed, len(violations), elapsed * 1000,
            )

            return {
                "passed": passed,
                "action": "PASS" if passed else "FLAG_PENDING_REVIEW",
                "confidence": 1.0 if passed else 0.0,
                "detail": {
                    "violations": violations,
                    "elapsed_ms": round(elapsed * 1000),
                },
                "error": None if passed else f"硬规则校验失败: {len(violations)} 项违规",
            }

        except Exception as exc:
            return _safe_fallback(exc, method, {"violations": violations})

    def _validate_pinyin(self, pinyin_text: str) -> tuple[bool, str]:
        """
        校验拼音文本合法性。
        - 允许空格、声调字母、标准标点
        - 拒绝英文音标字符、乱码、非拼音内容
        """
        if not pinyin_text or not pinyin_text.strip():
            return False, "拼音字段为空"

        # 逐行检查
        for line_num, line in enumerate(pinyin_text.strip().split("\n"), 1):
            line = line.strip()
            if not line:
                continue

            # 预检：所有字符必须在拼音声调字符集中
            for ch in line:
                if ch not in self._pinyin_tone_set:
                    return False, f"第{line_num}行含非法字符: U+{ord(ch):04X} '{ch}'"

            # 正则匹配音节结构
            if not self._pinyin_re.match(line):
                return False, f"第{line_num}行不符合拼音音节格式: '{line[:60]}'"

        return True, "ok"

    # ========================================================================
    # 4. 双模型联席仲裁评审 (A5 质量审核)
    # ========================================================================

    async def verify_a5_joint_arbitration(
        self,
        target_level: int,
        exercise_json: dict,
    ) -> dict:
        """
        DeepSeek + Qwen 并发评审，双模型联合仲裁。

        并发控制：asyncio.gather 同时请求两个模型
        仲裁逻辑：
          - 双方 is_qualified=true 且分项差值 ≤ 0.15 → PASS
          - 任一方反对或分歧过大 → FLAG_PENDING_HUMAN_REVIEW

        Returns:
            dict 同 GuardrailVerdict 结构
        """
        method = "verify_a5_joint_arbitration"
        t0 = time.monotonic()
        logger.info("[%s] 开始 | target_level=%d", method, target_level)

        try:
            review_prompt = self._build_a5_review_prompt(target_level, exercise_json)

            # ---- Step 1: 并发调用双模型 ----
            ds_task = self._call_ds_with_timeout(review_prompt, method)
            qwen_task = self._call_qwen_with_timeout(review_prompt, method)

            ds_result, qwen_result = await asyncio.gather(
                ds_task, qwen_task, return_exceptions=True,
            )

            # ---- Step 2: 处理各模型结果 ----
            ds_score = self._parse_a5_response(ds_result, "DeepSeek")
            qwen_score = self._parse_a5_response(qwen_result, "Qwen")

            # 双方均失败 → 兜底
            if ds_score is None and qwen_score is None:
                logger.error("[%s] 双模型均评审失败", method)
                return {
                    "passed": False,
                    "action": "FLAG_PENDING_REVIEW",
                    "confidence": 0.0,
                    "detail": {
                        "ds_error": str(ds_result) if isinstance(ds_result, Exception) else "parse_failed",
                        "qwen_error": str(qwen_result) if isinstance(qwen_result, Exception) else "parse_failed",
                    },
                    "error": "双模型均评审失败，无法仲裁",
                }

            # 单模型失败 → 降级为仅用成功方的结论
            if ds_score is None:
                logger.warning("[%s] DeepSeek 评审失败，仅用 Qwen 结论", method)
                return self._single_model_verdict(qwen_score, method, t0, "qwen_only")
            if qwen_score is None:
                logger.warning("[%s] Qwen 评审失败，仅用 DeepSeek 结论", method)
                return self._single_model_verdict(ds_score, method, t0, "ds_only")

            # ---- Step 3: 双模型联合仲裁 ----
            both_qualified = ds_score.is_qualified and qwen_score.is_qualified

            # 计算各分项差值
            dimension_deltas: dict[str, float] = {
                "pinyin_accuracy": abs(ds_score.pinyin_accuracy - qwen_score.pinyin_accuracy),
                "distractor_quality": abs(ds_score.distractor_quality - qwen_score.distractor_quality),
                "cultural_compliance": abs(ds_score.cultural_compliance - qwen_score.cultural_compliance),
                "level_appropriateness": abs(ds_score.level_appropriateness - qwen_score.level_appropriateness),
                "overall_score": abs(ds_score.overall_score - qwen_score.overall_score),
            }
            max_delta = max(dimension_deltas.values())
            has_divergence = max_delta > self.JOINT_ARBITRATION_MAX_DELTA

            # 综合得分取两模型平均
            avg_overall = round((ds_score.overall_score + qwen_score.overall_score) / 2, 4)

            passed = both_qualified and not has_divergence
            action = "PASS" if passed else "FLAG_PENDING_HUMAN_REVIEW"

            elapsed = time.monotonic() - t0
            logger.info(
                "[%s] 完成 | ds_qualified=%s qwen_qualified=%s max_delta=%.3f "
                "avg_score=%.3f passed=%s elapsed=%.2fs",
                method,
                ds_score.is_qualified, qwen_score.is_qualified,
                max_delta, avg_overall, passed, elapsed,
            )

            return {
                "passed": passed,
                "action": action,
                "confidence": avg_overall,
                "detail": {
                    "ds_scores": ds_score.model_dump(),
                    "qwen_scores": qwen_score.model_dump(),
                    "dimension_deltas": dimension_deltas,
                    "max_delta": max_delta,
                    "delta_threshold": self.JOINT_ARBITRATION_MAX_DELTA,
                    "average_overall_score": avg_overall,
                    "elapsed_ms": round(elapsed * 1000),
                },
                "error": None if passed else (
                    f"仲裁未通过: both_qualified={both_qualified}, "
                    f"max_delta={max_delta:.3f} > {self.JOINT_ARBITRATION_MAX_DELTA}"
                    if has_divergence else "至少一个模型投了反对票"
                ),
            }

        except Exception as exc:
            return _safe_fallback(exc, method)

    # ========================================================================
    # 辅助方法
    # ========================================================================

    def _build_a5_review_prompt(self, target_level: int, exercise_json: dict) -> str:
        """构建 A5 双模型评审 Prompt"""
        return (
            "你是对外汉语（TCSL）教学内容质量评审专家。请对以下练习题进行原子维度评分。\n\n"
            f"目标 HSK 等级: {target_level}\n\n"
            "题目内容:\n"
            f"```json\n{exercise_json}\n```\n\n"
            "请从以下维度打分（0.0-1.0）：\n"
            "1. pinyin_accuracy: 拼音标注的准确性\n"
            "2. distractor_quality: 干扰项（错误选项）的迷惑性和合理性\n"
            "3. cultural_compliance: 文化内容的合规性（无偏见、无敏感内容）\n"
            "4. level_appropriateness: 与目标 HSK 等级的匹配度\n"
            "5. overall_score: 综合质量评分\n"
            "6. is_qualified: 是否合格（true/false）\n\n"
            "只输出以下 JSON 格式，不要输出任何其他内容：\n"
            '{"pinyin_accuracy":0.0,"distractor_quality":0.0,'
            '"cultural_compliance":0.0,"level_appropriateness":0.0,'
            '"overall_score":0.0,"is_qualified":true}'
        )

    async def _call_ds_with_timeout(self, prompt: str, method: str) -> str | Exception:
        """调用 DeepSeek，带超时和异常捕获"""
        try:
            return await asyncio.wait_for(
                self.ds_client.generate(prompt, temperature=0.0, max_tokens=512),
                timeout=45.0,
            )
        except Exception as e:
            logger.error("[%s] DeepSeek 调用异常: %s", method, e)
            return e

    async def _call_qwen_with_timeout(self, prompt: str, method: str) -> str | Exception:
        """调用 Qwen，带超时和异常捕获"""
        try:
            return await asyncio.wait_for(
                self.qwen_client.generate(prompt, temperature=0.0, max_tokens=512),
                timeout=45.0,
            )
        except Exception as e:
            logger.error("[%s] Qwen 调用异常: %s", method, e)
            return e

    def _parse_a5_response(
        self, result: str | Exception, model_name: str
    ) -> A5ReviewScore | None:
        """解析 A5 模型返回的 JSON 评分为 A5ReviewScore，失败返回 None"""
        if isinstance(result, Exception):
            logger.error("[A5] %s 返回异常: %s", model_name, result)
            return None

        raw = (result or "").strip()
        if not raw:
            logger.warning("[A5] %s 返回空响应", model_name)
            return None

        # 尝试提取 JSON
        try:
            import json
            # 先试直接解析
            data = json.loads(raw)
        except json.JSONDecodeError:
            # 尝试提取 {...}
            match = re.search(r"\{[^{}]*\}", raw, re.DOTALL)
            if match:
                try:
                    data = json.loads(match.group())
                except json.JSONDecodeError:
                    logger.warning("[A5] %s JSON 解析失败 | raw=%r", model_name, raw[:200])
                    return None
            else:
                logger.warning("[A5] %s 响应中无有效 JSON | raw=%r", model_name, raw[:200])
                return None

        try:
            return A5ReviewScore(**data)
        except ValidationError as ve:
            logger.warning("[A5] %s 评分字段不合法 | errors=%s", model_name, ve.errors())
            return None

    def _single_model_verdict(
        self,
        score: A5ReviewScore,
        method: str,
        t0: float,
        mode: str,
    ) -> dict:
        """单模型降级评审结论"""
        elapsed = time.monotonic() - t0
        return {
            "passed": score.is_qualified,
            "action": "PASS" if score.is_qualified else "FLAG_PENDING_REVIEW",
            "confidence": score.overall_score,
            "detail": {
                "mode": mode,
                "scores": score.model_dump(),
                "elapsed_ms": round(elapsed * 1000),
            },
            "error": None if score.is_qualified else f"单模型({mode})投了反对票",
        }
