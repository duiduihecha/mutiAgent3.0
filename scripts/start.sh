#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

PORT=5000
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-$PORT}"
EMBEDDING_PORT=8765

start_embedding_server() {
  if curl -s http://localhost:${EMBEDDING_PORT}/health > /dev/null 2>&1; then
    echo "BGE Embedding server already running on port ${EMBEDDING_PORT}."
    return
  fi
  echo "Starting BGE Embedding server on port ${EMBEDDING_PORT}..."
  python3 src/services/embedding_server.py &
  BGE_PID=$!
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

start_service() {
    cd "${COZE_WORKSPACE_PATH}"
    echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
    PORT=${DEPLOY_RUN_PORT} node dist/server.js
}

echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
start_embedding_server
start_service
