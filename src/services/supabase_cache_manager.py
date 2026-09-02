"""
SupabaseCacheManager — TCSL 平台 LLM 内容缓存管理服务

功能：
  - get_valid_cache(): 复合主键精确查询，只返回高质量活跃缓存
  - upsert_cache(): UPSERT 写入，低置信度自动拒绝
  - evaluate_and_update(): 触发 PostgreSQL RPC 质量评估

依赖：pip install supabase httpx
"""

from __future__ import annotations

import logging
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# ---------------------------------------------------------------------------
# 加载 .env
# ---------------------------------------------------------------------------
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def _load_env() -> None:
    env_path = _PROJECT_ROOT / ".env"
    if not env_path.exists():
        return
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val


_load_env()

# ---------------------------------------------------------------------------
# 日志
# ---------------------------------------------------------------------------
logger = logging.getLogger("cache_manager")
logger.setLevel(logging.INFO)
if not logger.handlers:
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(logging.Formatter(
        "[%(asctime)s] %(levelname)-7s [CacheManager] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))
    logger.addHandler(h)

# ---------------------------------------------------------------------------
# 配置常量
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("COZE_SUPABASE_URL", "")
SERVICE_ROLE_KEY = os.environ.get("COZE_SUPABASE_SERVICE_ROLE_KEY", "")
ANON_KEY = os.environ.get("COZE_SUPABASE_ANON_KEY", "")

CONFIDENCE_THRESHOLD = 0.85
DEFAULT_SCENE = "general"
REQUEST_TIMEOUT = 15.0  # 秒


# ---------------------------------------------------------------------------
# 数据模型
# ---------------------------------------------------------------------------

@dataclass
class CacheEntry:
    """缓存条目"""
    knowledge_point_id: str
    hsk_level: int
    scene_id: str
    content_payload: dict[str, Any]
    is_llm_generated: bool = True
    confidence_score: float = 0.0
    upvotes: int = 0
    downvotes: int = 0
    status: str = "ACTIVE"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    def is_valid(self) -> bool:
        """是否为有效可用缓存"""
        return (
            self.status == "ACTIVE"
            and self.confidence_score >= CONFIDENCE_THRESHOLD
        )


@dataclass
class QualityEvalResult:
    """质量评估结果"""
    action_taken: str
    old_status: Optional[str]
    new_status: Optional[str]
    downvote_ratio: float
    total_votes: int
    detail: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# 异步 HTTP 客户端封装（不依赖 supabase-py，减少依赖链）
# ---------------------------------------------------------------------------

class _SupabaseHTTP:
    """轻量 Supabase REST + RPC 客户端"""

    def __init__(self, url: str, service_role_key: str):
        self.base = url.rstrip("/")
        self.key = service_role_key
        self._headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }

    async def _request(
        self,
        method: str,
        path: str,
        json_body: Optional[dict] = None,
        params: Optional[dict] = None,
    ) -> dict[str, Any]:
        import httpx

        url = f"{self.base}{path}"
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.request(
                method=method,
                url=url,
                headers=self._headers,
                json=json_body,
                params=params,
            )
            resp.raise_for_status()
            return resp.json() if resp.text else {}

    # ---- REST 表操作 ----

    async def select(
        self,
        table: str,
        columns: str = "*",
        filters: Optional[dict] = None,
        limit: int = 1,
    ) -> list[dict]:
        """SELECT 查询，返回行列表"""
        params: dict[str, str] = {
            "select": columns,
            "limit": str(limit),
        }
        if filters:
            for k, v in filters.items():
                params[k] = f"eq.{v}" if not isinstance(v, str) or " " not in v else v
        return await self._request("GET", f"/rest/v1/{table}", params=params)

    async def upsert(
        self,
        table: str,
        rows: list[dict],
        on_conflict: str,
    ) -> dict:
        """UPSERT 操作"""
        params = {"on_conflict": on_conflict}
        return await self._request(
            "POST", f"/rest/v1/{table}", json_body=rows, params=params
        )

    # ---- RPC 存储过程 ----

    async def rpc(self, fn_name: str, params: dict) -> dict:
        """调用 PostgreSQL RPC"""
        return await self._request(
            "POST", f"/rest/v1/rpc/{fn_name}", json_body=params
        )


# ---------------------------------------------------------------------------
# SupabaseCacheManager
# ---------------------------------------------------------------------------

class SupabaseCacheManager:
    """
    LLM 内容缓存管理服务

    使用方式:
        manager = SupabaseCacheManager()
        cache = await manager.get_valid_cache("kp_001", 3, "daily")
        if cache is None:
            # 缓存未命中或质量不达标 → 触发 LLM 生成
            ...
            await manager.upsert_cache("kp_001", 3, "daily", payload, confidence=0.92)
    """

    TABLE = "llm_content_cache"
    PK_CONFLICT = "knowledge_point_id,hsk_level,scene_id"

    def __init__(self):
        if not SUPABASE_URL:
            raise RuntimeError("COZE_SUPABASE_URL 未设置")
        if not SERVICE_ROLE_KEY:
            raise RuntimeError("COZE_SUPABASE_SERVICE_ROLE_KEY 未设置")

        self.client = _SupabaseHTTP(SUPABASE_URL, SERVICE_ROLE_KEY)
        logger.info(
            "SupabaseCacheManager 初始化完成 | url=%s | threshold=%.2f",
            SUPABASE_URL[:50] + "...",
            CONFIDENCE_THRESHOLD,
        )

    # ========================================================================
    # get_valid_cache — 精确查询，只返回有效缓存
    # ========================================================================

    async def get_valid_cache(
        self,
        kp_id: str,
        hsk_level: int,
        scene_id: str = DEFAULT_SCENE,
    ) -> dict | None:
        """
        使用复合主键精确查询缓存。

        过滤条件:
          - status = 'ACTIVE'
          - confidence_score >= 0.85

        Returns:
            命中 → content_payload (dict)
            未命中或不可用 → None
        """
        method = "get_valid_cache"
        logger.debug(
            "[%s] 查询 | kp=%s | hsk=%d | scene=%s",
            method, kp_id, hsk_level, scene_id,
        )

        try:
            rows = await self.client.select(
                table=self.TABLE,
                columns="content_payload,status,confidence_score",
                filters={
                    "knowledge_point_id": kp_id,
                    "hsk_level": str(hsk_level),
                    "scene_id": scene_id,
                },
                limit=1,
            )

            if not rows:
                logger.info("[%s] 缓存未命中 (无记录) | kp=%s hsk=%d", method, kp_id, hsk_level)
                return None

            row = rows[0]
            status = row.get("status", "")
            confidence = row.get("confidence_score", 0.0)
            payload = row.get("content_payload")

            # 双重校验
            if status != "ACTIVE":
                logger.info(
                    "[%s] 缓存不可用 (status=%s) | kp=%s hsk=%d",
                    method, status, kp_id, hsk_level,
                )
                return None

            if isinstance(confidence, (int, float)) and confidence < CONFIDENCE_THRESHOLD:
                logger.info(
                    "[%s] 缓存置信度不足 (%.3f < %.2f) | kp=%s hsk=%d",
                    method, float(confidence), CONFIDENCE_THRESHOLD, kp_id, hsk_level,
                )
                return None

            if isinstance(payload, str):
                import json
                payload = json.loads(payload)

            logger.info(
                "[%s] 缓存命中 | kp=%s hsk=%d scene=%s confidence=%.3f",
                method, kp_id, hsk_level, scene_id, float(confidence),
            )
            return payload if isinstance(payload, dict) else None

        except Exception as exc:
            logger.error(
                "[%s] 查询异常 | kp=%s hsk=%d | %s: %s",
                method, kp_id, hsk_level, type(exc).__name__, exc,
            )
            return None  # 异常时返回 None，触发 LLM 重新生成

    # ========================================================================
    # upsert_cache — UPSERT，低质量拒绝写入
    # ========================================================================

    async def upsert_cache(
        self,
        kp_id: str,
        hsk_level: int,
        scene_id: str,
        payload: dict[str, Any],
        confidence: float,
        is_llm_generated: bool = True,
        model_version: Optional[str] = None,
        generation_duration_ms: Optional[int] = None,
    ) -> bool:
        """
        UPSERT 缓存内容。

        安全策略:
          - confidence < 0.85 → status 直接设为 'REJECTED'，不污染 ACTIVE 池
          - confidence >= 0.85 → status = 'ACTIVE'

        Returns:
            True  → 写入成功
            False → 写入失败（异常或低质量拒绝）
        """
        method = "upsert_cache"

        # 低置信度拒绝
        if confidence < CONFIDENCE_THRESHOLD:
            logger.warning(
                "[%s] 拒绝写入低质量缓存 | kp=%s hsk=%d scene=%s confidence=%.3f < %.2f",
                method, kp_id, hsk_level, scene_id, confidence, CONFIDENCE_THRESHOLD,
            )
            # 仍写入但标记为 REJECTED（供诊断，不污染有效池）
            status = "REJECTED"
        else:
            status = "ACTIVE"

        row: dict[str, Any] = {
            "knowledge_point_id": kp_id,
            "hsk_level": hsk_level,
            "scene_id": scene_id,
            "content_payload": payload,
            "is_llm_generated": is_llm_generated,
            "confidence_score": round(confidence, 4),
            "status": status,
            "model_version": model_version,
            "generation_duration_ms": generation_duration_ms,
        }

        try:
            await self.client.upsert(
                table=self.TABLE,
                rows=[row],
                on_conflict=self.PK_CONFLICT,
            )
            logger.info(
                "[%s] 写入成功 | kp=%s hsk=%d scene=%s confidence=%.3f status=%s",
                method, kp_id, hsk_level, scene_id, confidence, status,
            )
            return True

        except Exception as exc:
            logger.error(
                "[%s] 写入失败 | kp=%s hsk=%d scene=%s | %s: %s",
                method, kp_id, hsk_level, scene_id, type(exc).__name__, exc,
            )
            return False

    # ========================================================================
    # evaluate_and_update — 触发 RPC 质量评估
    # ========================================================================

    async def evaluate_and_update(
        self,
        kp_id: str,
        hsk_level: int,
        scene_id: str = DEFAULT_SCENE,
    ) -> QualityEvalResult | None:
        """
        调用 PostgreSQL RPC evaluate_cache_quality() 进行质量评估。

        适用场景:
          - 用户投票后
          - 定时巡检任务
          - 质量审计触发
        """
        method = "evaluate_and_update"
        logger.debug(
            "[%s] 触发质量评估 | kp=%s hsk=%d scene=%s",
            method, kp_id, hsk_level, scene_id,
        )

        try:
            result_list = await self.client.rpc(
                "evaluate_cache_quality",
                {
                    "p_knowledge_point_id": kp_id,
                    "p_hsk_level": hsk_level,
                    "p_scene_id": scene_id,
                },
            )

            # RPC 返回 table 格式 → 列表
            if isinstance(result_list, list) and len(result_list) > 0:
                row = result_list[0]
                r = QualityEvalResult(
                    action_taken=str(row.get("action_taken", "NOOP")),
                    old_status=row.get("old_status"),
                    new_status=row.get("new_status"),
                    downvote_ratio=float(row.get("downvote_ratio", 0.0)),
                    total_votes=int(row.get("total_votes", 0)),
                    detail=row.get("detail", {}) if isinstance(row.get("detail"), dict) else {},
                )
                logger.info(
                    "[%s] 评估完成 | action=%s %s→%s ratio=%.3f votes=%d",
                    method,
                    r.action_taken, r.old_status, r.new_status,
                    r.downvote_ratio, r.total_votes,
                )
                return r

            logger.warning("[%s] RPC 返回空结果", method)
            return None

        except Exception as exc:
            logger.error(
                "[%s] 评估异常 | kp=%s hsk=%d | %s: %s",
                method, kp_id, hsk_level, type(exc).__name__, exc,
            )
            return None

    # ========================================================================
    # vote — 用户投票快捷方法
    # ========================================================================

    async def vote(
        self,
        kp_id: str,
        hsk_level: int,
        scene_id: str,
        is_upvote: bool,
    ) -> dict | None:
        """
        提交用户投票，自动触发质量评估。

        Returns:
            {"success": bool, "upvotes": int, "downvotes": int, "status": str}
        """
        method = "vote"
        direction = "upvote" if is_upvote else "downvote"
        logger.debug(
            "[%s] %s | kp=%s hsk=%d scene=%s",
            method, direction, kp_id, hsk_level, scene_id,
        )

        try:
            result = await self.client.rpc(
                "vote_cache",
                {
                    "p_knowledge_point_id": kp_id,
                    "p_hsk_level": hsk_level,
                    "p_scene_id": scene_id,
                    "p_is_upvote": is_upvote,
                },
            )
            if isinstance(result, dict):
                logger.info(
                    "[%s] 投票成功 | success=%s status=%s",
                    method, result.get("success"), result.get("status"),
                )
                return result
            return None

        except Exception as exc:
            logger.error(
                "[%s] 投票异常 | %s: %s",
                method, type(exc).__name__, exc,
            )
            return None

    # ========================================================================
    # get_stats — 查询缓存池健康度统计
    # ========================================================================

    async def get_stats(self, hsk_level: Optional[int] = None) -> dict:
        """
        查询缓存池整体健康度。

        Returns:
            {"total": int, "active": int, "degraded": int, "rejected": int, ...}
        """
        try:
            # 使用 RPC 查询活跃缓存统计（也可用 REST aggregate）
            rows = await self.client.select(
                table=self.TABLE,
                columns="status,confidence_score",
                filters={"hsk_level": str(hsk_level)} if hsk_level is not None else None,
                limit=1000,
            )

            stats = {
                "total": len(rows),
                "active": sum(1 for r in rows if r.get("status") == "ACTIVE"),
                "degraded": sum(1 for r in rows if r.get("status") == "DEGRADED"),
                "rejected": sum(1 for r in rows if r.get("status") == "REJECTED"),
                "avg_confidence": 0.0,
            }

            active_scores = [
                float(r.get("confidence_score", 0))
                for r in rows
                if r.get("status") == "ACTIVE"
            ]
            if active_scores:
                stats["avg_confidence"] = round(
                    sum(active_scores) / len(active_scores), 4
                )

            logger.info(
                "[get_stats] total=%d active=%d degraded=%d rejected=%d avg_conf=%.3f",
                stats["total"], stats["active"], stats["degraded"],
                stats["rejected"], stats["avg_confidence"],
            )
            return stats

        except Exception as exc:
            logger.error("[get_stats] 查询异常 | %s: %s", type(exc).__name__, exc)
            return {"total": 0, "active": 0, "degraded": 0, "rejected": 0, "avg_confidence": 0.0}


# ============================================================================
# 自检
# ============================================================================

async def _self_test():
    """快速验证缓存管理器基本功能"""
    print("=" * 60)
    print("SupabaseCacheManager 自检")
    print("=" * 60)

    # 检查环境变量
    checks = {
        "COZE_SUPABASE_URL": bool(SUPABASE_URL),
        "SERVICE_ROLE_KEY": bool(SERVICE_ROLE_KEY),
        "ANON_KEY": bool(ANON_KEY),
    }
    for name, ok in checks.items():
        print(f"  {name}: {'已配置 ✓' if ok else '未配置 ✗'}")
    if not all(checks.values()):
        print("\n[WARN] 缺少 Supabase 凭证，跳过功能测试")
        return

    try:
        manager = SupabaseCacheManager()
        print("\nManager 初始化成功 ✓")

        # 测试 get_valid_cache（预期不命中）
        result = await manager.get_valid_cache("test_kp_001", 3, "general")
        print(f"get_valid_cache(test_kp_001, 3): {'命中' if result else '未命中（预期）'} ✓")

        # 测试 upsert
        test_payload = {
            "type": "cultural_explanation",
            "content": {"definition": "测试内容", "examples": ["你好", "谢谢"]},
            "_test": True,
        }

        ok = await manager.upsert_cache(
            kp_id="test_kp_001",
            hsk_level=3,
            scene_id="general",
            payload=test_payload,
            confidence=0.92,
        )
        print(f"upsert_cache(confidence=0.92): {'成功' if ok else '失败'} ✓")

        # 验证刚写入的可被查询到
        result = await manager.get_valid_cache("test_kp_001", 3, "general")
        print(f"get_valid_cache 验证: {'命中 ✓' if result else '失败 ✗'}")

        # 测试低置信度拒绝
        ok_low = await manager.upsert_cache(
            kp_id="test_kp_001",
            hsk_level=3,
            scene_id="general",
            payload={"_rejected_test": True},
            confidence=0.60,
        )
        print(f"upsert_cache(confidence=0.60): 写入{'成功' if ok_low else '失败'}（低质量应标记REJECTED）✓")

        # 清理测试数据
        await manager.client._request(
            "DELETE",
            f"/rest/v1/{manager.TABLE}",
            params={
                "knowledge_point_id": "eq.test_kp_001",
                "hsk_level": "eq.3",
                "scene_id": "eq.general",
            },
        )
        print("测试数据已清理 ✓")

    except ImportError as e:
        print(f"\n[WARN] 缺少依赖: {e}")
        print("请运行: pip install httpx")
    except Exception as e:
        print(f"\n[ERROR] 自检失败: {e}")


if __name__ == "__main__":
    import asyncio
    asyncio.run(_self_test())
