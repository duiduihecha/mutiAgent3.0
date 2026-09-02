#!/bin/bash
# 轻量开发模式：只起 Next（不含 BGE 向量服务），走真实 LLM 网关。
set -Eeuo pipefail
cd "$(dirname "$0")/.."

# shellcheck source=./llm-egress.sh
source ./scripts/llm-egress.sh

# macOS: 若 shell 的 ulimit -n 大于 kern.maxfilesperproc，Turbopack 的 watcher 会立刻
# EMFILE 并导致路由扫描失败（表现为所有页面/API 404）。夹到合法区间。
if [[ "$(uname)" == "Darwin" ]]; then
  MAXPP=$(sysctl -n kern.maxfilesperproc 2>/dev/null || echo 24576)
  CUR=$(ulimit -n)
  if [[ "${CUR}" == "unlimited" || "${CUR}" -gt "${MAXPP}" ]]; then
    # 夹到内核上限 kern.maxfilesperproc（本机 92160）。
    # 注意：不能夹到 65536 —— node_modules 单目录就有 ~68k 文件，watcher 全量监听会超过 65536 而 EMFILE。
    # 92160 > 全量文件数(~70k)，留足够余量给 socket 等。
    ulimit -n "${MAXPP}" 2>/dev/null || true
    echo "[dev-test] ulimit -n: ${CUR} -> $(ulimit -n) (kern.maxfilesperproc=${MAXPP})"
  fi
fi

export LEARNING_PIPELINE_TIMEOUT_MS=1800000

exec pnpm exec next dev -p 5000
