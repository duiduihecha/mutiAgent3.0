"""
BGE 中文向量服务 — OpenAI 兼容 /v1/embeddings 接口
模型: BAAI/bge-large-zh-v1.5 (dim=1024)
来源: ModelScope 本地缓存
启动: python src/services/embedding_server.py
端口: 8765
"""

import os
from contextlib import asynccontextmanager
from typing import Union, List

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

MODEL_ID = "BAAI/bge-large-zh-v1.5"
MODEL_PATH = os.path.expanduser("~/.cache/modelscope/bge-large-zh-v1.5/BAAI/bge-large-zh-v1.5")
_model = None


class EmbeddingRequest(BaseModel):
    model: str = MODEL_ID
    input: Union[List[str], str]


class EmbeddingData(BaseModel):
    object: str = "embedding"
    embedding: list[float]
    index: int


class EmbeddingResponse(BaseModel):
    object: str = "list"
    data: list[EmbeddingData]
    model: str
    usage: dict


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model
    from sentence_transformers import SentenceTransformer
    print(f"[Embedding] 加载模型 {MODEL_ID} 从 {MODEL_PATH} ...")
    _model = SentenceTransformer(MODEL_PATH)
    dim = _model.get_sentence_embedding_dimension()
    print(f"[Embedding] 模型就绪, dim={dim}")
    yield
    print("[Embedding] 关闭")


app = FastAPI(title="BGE Embedding Server", lifespan=lifespan)


@app.get("/health")
async def health():
    if _model is None:
        raise HTTPException(503, "模型尚未加载完成")
    return {"status": "ok", "model": MODEL_ID}


@app.post("/v1/embeddings", response_model=EmbeddingResponse)
async def embeddings(req: EmbeddingRequest):
    if _model is None:
        raise HTTPException(503, "模型尚未加载完成")

    texts = [req.input] if isinstance(req.input, str) else req.input
    if not texts:
        raise HTTPException(400, "input 不能为空")

    vectors: np.ndarray = _model.encode(texts, normalize_embeddings=True)

    data = [
        EmbeddingData(embedding=vec.tolist(), index=i)
        for i, vec in enumerate(vectors)
    ]

    return EmbeddingResponse(
        data=data,
        model=MODEL_ID,
        usage={"prompt_tokens": sum(len(t) for t in texts), "total_tokens": len(texts)},
    )


if __name__ == "__main__":
    port = int(os.environ.get("EMBEDDING_PORT", "8765"))
    uvicorn.run(app, host="0.0.0.0", port=port)
