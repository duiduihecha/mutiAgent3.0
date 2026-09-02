#!/bin/bash
# LLM 网关出站配置（可被 source 复用：dev.sh / dev-test.sh / 评测脚本）
#
# 背景（2026-08-26 实测）：
#   - e-flowcode.cc 解析到 Cloudflare（172.67.160.86 / 104.21.74.173），但本机直连不通：
#     curl 直连 -> 000，Node fetch 直连 -> ENOTFOUND；经 Clash 127.0.0.1:7892 -> HTTP 200。
#   - Node 22 的内置 fetch(undici) 默认【忽略】HTTPS_PROXY，必须 NODE_USE_ENV_PROXY=1
#     才会启用 EnvHttpProxyAgent。
#   - NODE_USE_ENV_PROXY 必须在 node 进程启动【之前】设置，写进 .env 无效
#     （.env 由 Next 在运行时读取，此时 dispatcher 已装好）。
#
# 用法：
#   source scripts/llm-egress.sh          # 默认走 127.0.0.1:7892
#   LLM_HTTP_PROXY= source scripts/llm-egress.sh   # 置空 = 强制直连（Clash TUN 模式下可用）
#   LLM_HTTP_PROXY=http://127.0.0.1:7890 source scripts/llm-egress.sh   # 换端口

LLM_HTTP_PROXY="${LLM_HTTP_PROXY-http://127.0.0.1:7892}"

if [[ -n "${LLM_HTTP_PROXY}" ]]; then
  export NODE_USE_ENV_PROXY=1
  export HTTP_PROXY="${LLM_HTTP_PROXY}"
  export HTTPS_PROXY="${LLM_HTTP_PROXY}"
  export http_proxy="${LLM_HTTP_PROXY}"
  export https_proxy="${LLM_HTTP_PROXY}"
  # 本地 BGE 向量服务(8765)、Next 自身(5000) 不走代理
  export NO_PROXY="localhost,127.0.0.1,::1"
  export no_proxy="${NO_PROXY}"
  echo "[llm-egress] proxy=${LLM_HTTP_PROXY} NODE_USE_ENV_PROXY=1 (no_proxy=${NO_PROXY})"
else
  unset NODE_USE_ENV_PROXY HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy
  echo "[llm-egress] direct egress (proxy disabled)"
fi
