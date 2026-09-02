#!/bin/bash
set -Eeuo pipefail

PORT=5000
COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
DEPLOY_RUN_PORT=5000
EMBEDDING_PORT=8765

cd "${COZE_WORKSPACE_PATH}"

kill_port_if_listening() {
    local port="${1:-${DEPLOY_RUN_PORT}}"
    local pids
    pids=$(ss -H -lntp 2>/dev/null | awk -v port="${port}" '$4 ~ ":"port"$"' | grep -o 'pid=[0-9]*' | cut -d= -f2 | paste -sd' ' - || true)
    if [[ -z "${pids}" ]]; then
      echo "Port ${port} is free."
      return
    fi
    echo "Port ${port} in use by PIDs: ${pids} (SIGKILL)"
    echo "${pids}" | xargs -I {} kill -9 {}
    sleep 1
    pids=$(ss -H -lntp 2>/dev/null | awk -v port="${port}" '$4 ~ ":"port"$"' | grep -o 'pid=[0-9]*' | cut -d= -f2 | paste -sd' ' - || true)
    if [[ -n "${pids}" ]]; then
      echo "Warning: port ${port} still busy after SIGKILL, PIDs: ${pids}"
    else
      echo "Port ${port} cleared."
    fi
}

start_embedding_server() {
  if curl -s http://localhost:${EMBEDDING_PORT}/health > /dev/null 2>&1; then
    echo "BGE Embedding server already running on port ${EMBEDDING_PORT}."
    return
  fi
  echo "Starting BGE Embedding server on port ${EMBEDDING_PORT}..."
  python3 src/services/embedding_server.py &
  BGE_PID=$!
  # 等模型加载完成
  for i in $(seq 1 30); do
    if curl -s http://localhost:${EMBEDDING_PORT}/health > /dev/null 2>&1; then
      echo "BGE Embedding server ready (PID ${BGE_PID})."
      return
    fi
    sleep 1
  done
  echo "Warning: BGE server did not become ready within 30s."
}

cleanup() {
  if [[ -n "${BGE_PID:-}" ]]; then
    echo "Stopping BGE Embedding server (PID ${BGE_PID})..."
    kill "${BGE_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# LLM 网关出站代理（e-flowcode 直连不通，必须过 Clash；Node22 需 NODE_USE_ENV_PROXY=1）
# shellcheck source=./llm-egress.sh
source ./scripts/llm-egress.sh

echo "Clearing port ${PORT} before start."
kill_port_if_listening "${DEPLOY_RUN_PORT}"
start_embedding_server
echo "Starting HTTP service on port ${PORT} for dev..."

BIND_HOST="${BIND_HOST:-0.0.0.0}" PORT=$PORT pnpm tsx watch src/server.ts
