"""
GuardrailService 入口 — 从 .env 读取配置，创建客户端，暴露 service 单例

运行方式:
  cd src/services
  python guardrail_runner.py           # 运行自检
  python guardrail_runner.py --serve    # 启动 HTTP 微服务 (预留)
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

# 把项目根目录加到 sys.path，确保可以 import guardrail_service
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "src" / "services"))

# ---------------------------------------------------------------------------
# 读取 .env
# ---------------------------------------------------------------------------
def _load_dotenv() -> None:
    env_path = PROJECT_ROOT / ".env"
    if not env_path.exists():
        print(f"[WARN] 未找到 .env 文件: {env_path}")
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

_load_dotenv()

# ---------------------------------------------------------------------------
# OpenAI 兼容客户端 (DeepSeek / Qwen)
# ---------------------------------------------------------------------------
import aiohttp

class OpenAIClient:
    """轻量 OpenAI-compatible chat 客户端"""

    def __init__(self, base_url: str, api_key: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model

    async def generate(self, prompt: str, temperature: float = 0.0, max_tokens: int = 2048) -> str:
        """生成回复（guardrail_service 期望的接口签名）"""
        if os.environ.get("LLM_REAL_CALLS_ENABLED") != "true" or float(os.environ.get("LLM_RUN_BUDGET_CNY", "0")) <= 0:
            raise RuntimeError("Real LLM calls are disabled or no approved run budget is configured")
        url = f"{self.base_url}/v1/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        body = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=body, headers=headers, timeout=aiohttp.ClientTimeout(total=60)) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    raise RuntimeError(f"{self.model} API error {resp.status}: {text[:300]}")
                data = await resp.json()
                return data["choices"][0]["message"]["content"]


# ---------------------------------------------------------------------------
# Embedding 客户端 — 用 sentence-transformers 本地跑，不依赖外部 API
# ---------------------------------------------------------------------------
class LocalEmbeddingClient:
    """本地 embedding，使用 paraphrase-multilingual-MiniLM-L12-v2（中英文兼容）"""

    _instance: "LocalEmbeddingClient | None" = None

    def __init__(self):
        from sentence_transformers import SentenceTransformer
        self._model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """异步包装，返回 float 向量列表"""
        embeddings = self._model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
        return embeddings.tolist()


# ---------------------------------------------------------------------------
# 工厂函数 — 创建 GuardrailService
# ---------------------------------------------------------------------------
from guardrail_service import GuardrailService

def create_guardrail_service() -> GuardrailService:
    """从环境变量创建 GuardrailService 实例"""

    ds_client = OpenAIClient(
        base_url=os.environ.get("DEEPSEEK_API_URL", "https://api.deepseek.com"),
        api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
        model="deepseek-chat",
    )

    qwen_client = OpenAIClient(
        base_url=os.environ.get("QWEN_API_URL", "http://202.112.194.88:10300"),
        api_key=os.environ.get("QWEN_API_KEY", ""),
        model="Qwen3-235B-Instruct-2507-FP8",
    )

    emb_client = LocalEmbeddingClient()

    return GuardrailService(
        ds_client=ds_client,
        qwen_client=qwen_client,
        embedding_client=emb_client,
    )


# ---------------------------------------------------------------------------
# 快速自检
# ---------------------------------------------------------------------------
async def _self_test():
    print("=" * 60)
    print("GuardrailService 自检")
    print("=" * 60)

    # 检查环境变量
    ds_key = os.environ.get("DEEPSEEK_API_KEY", "")
    qw_key = os.environ.get("QWEN_API_KEY", "")
    print(f"  DEEPSEEK_API_KEY : {'已配置 ✓' if ds_key else '未配置 ✗'}")
    print(f"  QWEN_API_KEY     : {'已配置 ✓' if qw_key else '未配置 ✗'}")
    print(f"  DEEPSEEK_API_URL : {os.environ.get('DEEPSEEK_API_URL', '默认')}")
    print(f"  QWEN_API_URL     : {os.environ.get('QWEN_API_URL', '默认')}")

    if not ds_key or not qw_key:
        print("\n[WARN] API key 不完整，跳过客户端创建测试")
        return

    try:
        print("\n初始化 GuardrailService ...")
        svc = create_guardrail_service()
        print("GuardrailService 初始化成功 ✓")

        # 测试硬规则过滤器（不需要 LLM 调用）
        from guardrail_service import GuardrailVerdict
        result = await svc.pre_a5_hard_rules_filter(
            pinyin_guide="nǐ hǎo",
            chinese_text="你好",
            hsk_level=1,
        )
        print(f"\n硬规则自检结果: passed={result['passed']}, action={result['action']}")
        print("硬规则过滤器调用成功 ✓")

    except ImportError as e:
        print(f"\n[WARN] 缺少依赖: {e}")
        print("请运行: pip install aiohttp sentence-transformers numpy")
    except Exception as e:
        print(f"\n[ERROR] 自检失败: {e}")


if __name__ == "__main__":
    asyncio.run(_self_test())
