#!/bin/bash
# 列出 e-flowcode 网关当前可用的模型（OpenAI 兼容 GET /v1/models）
# 用法：
#   source .env 之前请先在本文件同目录外执行：
#   set -a; source .env; set +a
#   bash scripts/list_eflow_models.sh
#
# 用途：核对 src/lib/llm-config.ts 的 EFLOW_VERIFIED_MODELS 白名单是否过期/遗漏，
#       贴了新 API key 后跑一次，把新增模型名同步进白名单。
set -Eeuo pipefail

ENDPOINT="${EFLOWCODE_API_URL:-${OPENAI_API_URL:-https://e-flowcode.cc}}"
KEY="${EFLOWCODE_API_KEY:-${OPENAI_API_KEY:-}}"

if [[ -z "${KEY}" || "${KEY}" == *★* ]]; then
  echo "✗ 未找到有效 API key（EFLOWCODE_API_KEY 或 OPENAI_API_KEY）。先在 .env 粘贴 eflowcode key。"
  exit 1
fi

echo "== 网关: ${ENDPOINT} =="
echo "== 可用模型 =="
curl -s --noproxy '*' --max-time 30 "${ENDPOINT}/v1/models" \
  -H "Authorization: Bearer ${KEY}" \
  | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
except Exception as e:
    print('解析失败:', e); sys.exit(1)
ids = sorted(m.get('id','') for m in data.get('data', []))
for i in ids: print(' ', i)
print(f'== 共 {len(ids)} 个模型 ==')
" || echo "✗ 请求失败（检查 key/端点/网络；e-flowcode 国内可直连，勿开代理）"
