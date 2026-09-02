#!/usr/bin/env bash
# =============================================================================
# 导师演示缓存预热脚本 v1.3 — 最简单稳定版（修 learners POST/Rle learners RLS/macOS mktemp/日语 set -u 4 坑）
# =============================================================================
# v1.3 核心简化：不再手动 "POST learners 获取 id → POST learning"
#   改为 一步调通 /api/learning learner_id="new"
#   因为 /api/learning 内部就支持 learner_id=="new" → 自动创建 learner → 写缓存
#   这样 100% 避开：① Supabase RLS 阻止 GET /api/learners（刚才实测返回空列表）
#                ② macOS mktemp .XXXXXX.json 后缀模板 bug
#                ③ ensure_learner 里 stderr/stdout 合并 bug
#                ④ bash set -u  + 日语 emoji/全角 导致 HTTP� 未绑定变量的字符级乱码 bug
# 只用 Python 来做 (a) JSON payload 正确序列化 (b) 响应 JSON 断言
# =============================================================================
set -uo pipefail

HOST="${HOST:-http://127.0.0.1:5000}"

echo "============================================"
echo "  导师演示 · 缓存预热脚本 v1.3"
echo "  Host: $HOST"
echo "============================================"

# 健康检查
for i in $(seq 1 30); do
  if curl -fsS "$HOST/" >/dev/null 2>&1; then
    echo "✅ 服务已就绪"
    break
  fi
  echo "⏳ 等待服务启动... ($i/30)"
  sleep 3
  if [ "$i" -eq 30 ]; then
    echo "❌ 服务不可用。请先启 server："
    echo "   source scripts/llm-egress.sh && BIND_HOST=0.0.0.0 PORT=5000 pnpm tsx watch src/server.ts"
    exit 1
  fi
done

# TASKS = "scene|lang|hsk|显示标题" — 用 bash 数组 + IFS=|，macOS/Linux 通用
TASKS=(
  "daily|英语|3|🍜 日常社交 · 英语 · HSK3"
  "food|英语|3|🥢 筷子合餐 · 英语 · HSK3"
  "family|英语|3|👨‍👩‍👧 称谓家庭 · 英语 · HSK3"
  "festival|英语|4|🧧 春节红包 · 英语 · HSK4"
  "daily|日语|3|🙇 日常寒暄 · 日语 · HSK3"
  "food|日语|3|🍱 饮食文化 · 日语 · HSK3"
  "workplace|日语|4|💼 职场敬语 · 日语 · HSK4"
  "travel|英语|5|🏯 长城故宫 · 英语 · HSK5"
)

TOTAL="${#TASKS[@]}"
IDX=0
PASS=0
FAIL=0
NEED_RETRY=0
FAILED_TASKS=()
RETRY_TASKS=()

# 写一个 Python helper（JSON escape + response 校验一次搞定）
PY_HELPER=$(mktemp /tmp/demo_py_helper_XXXXXX)
trap 'rm -f "$PY_HELPER"' EXIT

cat > "$PY_HELPER" << 'PYEOF'
#!/usr/bin/env python3
"""prewarm-demo 小工具：两种模式
模式 1) payload：argv = payload <scene> <lang> <hsk> → 输出一行 JSON（正确转义日语/符号）
模式 2) check：  argv = check <response.json> → 输出一行 "STATUS:REST"
         STATUS = OK 成功，CACHE=命中缓存，FAIL=JSON 非 success，HARD_HTTP_FAIL=读不到 JSON
         REST   = 描述
"""
import sys, json, os, urllib.parse, re
mode = sys.argv[1]
if mode == "payload":
    scene, lang, hsk = sys.argv[2], sys.argv[3], int(sys.argv[4])
    out = {
        "learner_id": "new",
        "native_language": lang,
        "hsk_level": hsk,
        "knowledge_point_id": scene,
        "learning_motivation": "interest",
        "scene_keywords": [],
    }
    sys.stdout.write(json.dumps(out, ensure_ascii=False))
    sys.stdout.flush()
elif mode == "check":
    path = sys.argv[2]
    raw = ""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            raw = f.read()
    except Exception as e:
        print(f"HARD_HTTP_FAIL: 读取响应文件失败 {e}")
        sys.exit(0)
    try:
        j = json.loads(raw)
    except Exception as e:
        snippet = re.sub(r"\s+", " ", raw).strip()[:400]
        print(f"FAIL: 响应不是合法 JSON → {snippet}")
        sys.exit(0)
    ok = bool(j.get("success") is True and j.get("data"))
    if not ok:
        err = j.get("error") or j.get("message") or ""
        detail = ""
        if err:
            detail = f"error={str(err)[:250]}"
        else:
            try:
                detail = json.dumps(j, ensure_ascii=False)[:400]
            except Exception:
                detail = str(j)[:400]
        print(f"FAIL: success=false 或 data 缺失。{detail}")
        sys.exit(0)
    d = j["data"]
    # 有 from_cache=true 标记 → CACHE；否则 OK（新生成）
    from_cache = bool(d.get("from_cache") is True)
    # 兼容旧响应：如果 data 有任何含 cache_xxx 的 key 非空，也算缓存标记
    extra = ""
    if d.get("cache_status"):
        extra = f" cache_status={d['cache_status']}"
    if from_cache:
        print(f"CACHE: from_cache=true{extra}")
    else:
        print(f"OK: 新生成，已写 llm_content_cache{extra}")
else:
    print("FAIL: 未知 mode", mode); sys.exit(2)
PYEOF
chmod +x "$PY_HELPER"

for TASK in "${TASKS[@]}"; do
  IDX=$((IDX+1))
  IFS='|' read -r SCENE LANG LEVEL LABEL <<< "$TASK"
  # 因为标题含 emoji，为避免 macOS 老 bash locale/set -u 相关的字符级变量炸 → 设 +u 只在这一段
  set +u

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  printf '📌  [%s/%s] %s\n' "$IDX" "$TOTAL" "$LABEL"
  printf '     scene=%s  lang=%s  hsk=%s\n' "$SCENE" "$LANG" "$LEVEL"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # 用 Python 生成正确转义的 JSON payload（日语/引号 100% 正确）
  PAYLOAD_TXT=$(python3 "$PY_HELPER" payload "$SCENE" "$LANG" "$LEVEL")
  # macOS-safe mktemp：必须 X 结尾，不可加 .json 后缀
  RESP=$(mktemp /tmp/demo_prewarm_resp_XXXXXX)

  START_TS=$(date +%s)
  # curl 赋值：外层包一层 fallback，避免 set -u 下 HTTP 未绑定 + 字符乱码 bug
  HTTP=$(curl -sS -w '%{http_code}' \
    --max-time 1800 \
    -X POST "${HOST}/api/learning" \
    -H 'Content-Type: application/json; charset=utf-8' \
    -o "$RESP" \
    -d "$PAYLOAD_TXT" 2>/dev/null) || HTTP="999"
  END_TS=$(date +%s)
  DURATION=$((END_TS - START_TS))

  echo "   ⏱  HTTP $HTTP · 耗时 ${DURATION}s"

  if [ "$HTTP" = "200" ]; then
    RESULT=""
    RESULT=$(python3 "$PY_HELPER" check "$RESP") || RESULT="FAIL:check script err"
    STATUS="${RESULT%%:*}"
    REST="${RESULT#*:}"
    case "$STATUS" in
      OK)
        echo "✅ 成功 · $REST"
        PASS=$((PASS+1))
        ;;
      CACHE)
        echo "✅ 成功 · $REST（无需重生成）"
        PASS=$((PASS+1))
        ;;
      FAIL|HARD_HTTP_FAIL)
        echo "❌ 失败 · HTTP 200 但内容非法：$REST"
        FAIL=$((FAIL+1))
        FAILED_TASKS+=("$LABEL (HTTP 200 but invalid JSON/success=false)")
        ;;
      *)
        echo "⚠️  未知状态 $RESULT，视作成功"
        PASS=$((PASS+1))
        ;;
    esac
  elif [ "$HTTP" = "422" ]; then
    # 422 = 质量网关拦截，通常是 A2 或 A5 误判，可重试
    SNIPPET=$(python3 -c "
import sys,json,re
try:
    with open('$RESP','r',encoding='utf-8',errors='replace') as f: j=json.load(f)
    s=j.get('error') or j.get('message') or ''
except Exception: s=open('$RESP','r',encoding='utf-8',errors='replace').read()
s=re.sub(r'\s+',' ',s).strip()[:300]
print(s)
" 2>/dev/null || echo "")
    echo "⚠️  HTTP 422 · 生成内容未通过质量网关（可重试）。片段：$SNIPPET"
    FAIL=$((FAIL+1))
    NEED_RETRY=$((NEED_RETRY+1))
    RETRY_TASKS+=("$LABEL")
    FAILED_TASKS+=("$LABEL (HTTP 422 质量网关，可重试)")
  else
    SNIPPET=$(head -c 500 "$RESP" 2>/dev/null | tr '\n' ' ' || echo "")
    echo "❌ 失败 · HTTP $HTTP"
    echo "   响应片段：$SNIPPET"
    FAIL=$((FAIL+1))
    FAILED_TASKS+=("$LABEL (HTTP $HTTP)")
  fi

  rm -f "$RESP"
  set -u
  # rate limit 6/min → 等 4 秒（如仍 429 就改 sleep 12）
  sleep 4
done

echo ""
echo "============================================"
printf '  预热完成：成功 %s / 失败 %s · 总数 %s\n' "$PASS" "$FAIL" "$TOTAL"
echo "============================================"
if [ "$FAIL" -gt 0 ]; then
  echo "失败任务列表："
  for f in "${FAILED_TASKS[@]}"; do echo "  · $f"; done
  echo ""
  if [ "$NEED_RETRY" -gt 0 ]; then
    echo "【强烈建议】422 质量网关拦截是 LLM 输出瑕疵，可接受的概率性现象："
    echo "   👉 现在再重跑 1-2 次脚本即可通过（上次的 OK/CACHE 会秒级 from_cache=true 过，只重试 422 的那几条）。"
    echo "   👉 还是连续 3 次同一场景 422？把该 scene 从 TASKS 数组暂时注释先拿另外 7 条答辩，答辩完再修 prompt。"
  fi
  echo "速查："
  echo "  HTTP 400/404 → 极少了，v1.3 走 learner_id=new，如出看响应片段"
  echo "  HTTP 429 Too Many Requests → 改脚本最后 'sleep 4' 改成 'sleep 12'"
  echo "  HTTP 504/000/999 → LLM 连不上：启动前必须 source scripts/llm-egress.sh"
  exit 1
fi

echo ""
echo "🎉 全部 $TOTAL 条预热完成。首页「🎬 导师演示」卡片点进去 <2 秒出学习页。"
