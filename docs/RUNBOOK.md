# 运行手册 (Runbook)

> 最后更新：2026-09-02（反映横拆 + Auth 重构）
> 验证环境：macOS / Node v22.x / pnpm ≥ 9
> 验证结果：**全部通过** ✅

---

## 1. 快速启动

```bash
cd /Users/wanglei/Projects/ai-agents/mutiAgent3.0
pnpm install   # 首次或 package.json 变更后
pnpm dev
```

服务启动后：http://localhost:5000

| 页面 | URL |
|------|-----|
| 首页 | http://localhost:5000 |
| 学习页 | http://localhost:5000/learning |
| 知识图谱 | http://localhost:5000/knowledge-graph |
| LLM 测试 | http://localhost:5000/test |
| 管理后台 | http://localhost:5000/admin |

---

## 2. 环境准备

### 2.1 必备

| 依赖 | 要求 | 验证 |
|------|------|------|
| Node.js | ≥ 18（实测 22.x 最佳） | `node -v` |
| pnpm | ≥ 9（preinstall 强约束） | `pnpm -v` |

### 2.2 .env 核心变量

#### e-flowcode LLM 网关（必配）

```bash
EFLOWCODE_API_URL=https://e-flowcode.cc
EFLOWCODE_API_KEY=你的_API_KEY

# 可选：覆盖默认模型
LLM_GENERATION_PROFILE=daily      # daily=deepseek-v4-flash / quality=deepseek-v4-pro
LLM_A2_MODEL=deepseek-v4-flash    # 各 Agent 单独覆盖
LLM_EXTRA_MODELS=...               # 新模型追加到 allowlist
```

#### Supabase（必配）

```bash
COZE_SUPABASE_URL=https://xxx.supabase.co
COZE_SUPABASE_ANON_KEY=你的_anon_key
```

#### Neo4j（必配，图谱功能）

```bash
NEO4J_URI=neo4j+s://xxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=你的密码
```

#### 🆕 Auth（新认证系统）

```bash
AUTH_JWT_SECRET=你的_JWT_签名密钥
AUTH_COOKIE_NAME=auth_token            # 可选
AUTH_LOCKOUT_ATTEMPTS=5                # 可选，锁定阈值
AUTH_LOCKOUT_DURATION_MS=900000        # 可选，15min
```

#### 运行时开关

```bash
USE_LANGGRAPH=false                 # true 走 LangGraph StateGraph
LLM_MOCK_MODE=false                 # true 时所有 LLM 返回 fixture
LEARNING_PIPELINE_TIMEOUT_MS=480000 # 路由超时
LEARNING_RATE_LIMIT_PER_MIN=6       # IP 限流
HTTP_PROXY=http://127.0.0.1:7892    # 中国网络用
HTTPS_PROXY=http://127.0.0.1:7892
```

---

## 3. 开发模式

```bash
pnpm dev   # 等价 scripts/dev.sh
```

dev.sh 自动执行：清理 5000 端口 → 设置代理 → 检查 Embedding server → 启动 Next.js

### 端口冲突

```bash
lsof -ti:5000 | xargs kill -9
pnpm dev
```

### 调试技巧

```bash
# 完全离线（不消耗 LLM）
LLM_MOCK_MODE=true pnpm dev

# LangGraph 编排
USE_LANGGRAPH=true pnpm dev

# 长调用调试
LEARNING_PIPELINE_TIMEOUT_MS=600000 pnpm dev
```

### 关键日志前缀

| 前缀 | 含义 |
|------|------|
| `[场景映射]` | scene-mapper.ts |
| `[知识库]` | cache-io 命中/未命中 |
| `[A1]` ~ `[A5]` | Agent 执行 |
| `[TIMING]` | LLM 调用耗时 |
| `[Guardrail]` | 质量网关 |
| `[Auth]` | 认证流程 |

---

## 4. 生产模式

```bash
pnpm build    # 等价 scripts/build.sh
pnpm start    # 等价 scripts/start.sh
```

**部署注意**：
- Node ≥ 20
- 内存 ≥ 2GB
- 反向代理超时 ≥ 480s
- 并发 ≤ 3（4 次串行 LLM 调用，每次 20-40s）

---

## 5. API 测试

### 5.1 页面健康

```bash
curl -s -o /dev/null -w "Home: %{http_code}\n" http://localhost:5000/
curl -s -o /dev/null -w "Graph: %{http_code}\n" http://localhost:5000/knowledge-graph
```

### 5.2 静态 API

```bash
# Supabase 连接验证
curl -s http://localhost:5000/api/knowledge/points | python3 -c "
import json,sys;d=json.load(sys.stdin);print(f'✅ {d[\"data\"][\"total\"]} 个知识点')"

# 缓存统计
curl -s http://localhost:5000/api/cache/stats | python3 -m json.tool
```

### 5.3 LLM 连通

```bash
curl -s -X POST http://localhost:5000/api/test/llm \
  -H 'Content-Type: application/json' -d '{}' | python3 -m json.tool
```

### 5.4 Auth 流程（🆕）

```bash
# 注册
curl -c /tmp/cookie.txt -s -X POST http://localhost:5000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@x.com","password":"Test1234!"}'

# 登录
curl -c /tmp/cookie.txt -s -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@x.com","password":"Test1234!"}'

# 当前用户
curl -b /tmp/cookie.txt -s http://localhost:5000/api/auth/me
```

### 5.5 学习主链路（核心验证）

```bash
curl -s -X POST http://localhost:5000/api/learning \
  -H 'Content-Type: application/json' \
  -d '{"learner_id":"new","knowledge_point_id":"food","hsk_level":3,"native_language":"英语"}' \
  --max-time 300 | python3 -c "
import json,sys
d=json.load(sys.stdin)
if d.get('success'):
    ex=d['data']['learning_content']['exercises']
    print(f'✅ OK | cache={d[\"data\"][\"from_cache\"]} | exercises={len(ex)} | gate={d[\"data\"][\"quality_gate\"]}')
else:
    err=d.get('error',''); det=d.get('error_detail',{})
    if '质量网关' in err: print(f'⚠️  Guardrail 拦截: {det.get(\"failed_guardrails\",[])}')
    elif '超时' in err: print('❌ 超时 → 调大 LEARNING_PIPELINE_TIMEOUT_MS')
    else: print(f'❌ {err[:200]}')
"
```

**HTTP 返回码**：

| 码 | 含义 |
|----|------|
| 200 | ✅ 成功 |
| 422 | ⚠️ Guardrail 拦截 或 Auth 锁定 |
| 429 | ❌ 限流（IP 6次/min 或 auth 失败） |
| 502 | ❌ Agent 失败 |
| 504 | ❌ 超时 |

---

## 6. 耗时参考

| 场景 | 耗时 |
|------|------|
| 冷启动 Next.js | ~3-5s |
| Supabase / Neo4j 连接 | ~50ms / ~1-2s |
| 页面首屏 | ~100-300ms |
| LLM 缓存命中 | 90-150s |
| LLM 缓存未命中（4 次串行） | 120-180s |

---

## 7. 常见问题

| 现象 | 排查 |
|------|------|
| 端口占用 | `lsof -ti:5000 \| xargs kill -9` |
| 依赖找不到 | `pnpm install`（用 pnpm，不要 npm/yarn） |
| 502 Agent 失败 | 日志搜 `Agent xxx failed` |
| 504 超时 | `LEARNING_PIPELINE_TIMEOUT_MS` |
| 429 限流 | 每 IP 每分钟 ≤ 6 次 |
| 422 Auth 锁定 | 查 `auth_users.lockout_until`，重置密码 |
| Neo4j 空白 | `NEO4J_*` 三个变量 |
| 内容是 MOCK 字样 | `LLM_MOCK_MODE=true` 没关 |
| 每次一样 | 命中缓存（confidence > 0.85） |
| Auth 401 | 查 Cookie / JWT / `AUTH_JWT_SECRET` |
| Auth 500 | `auth_users` 表存在？跑 migration |
| LLM 网关连不上 | `curl -X POST https://e-flowcode.cc/v1/chat/completions ...` 测试 |
| Supabase 连不上 | REST API 直测：`curl "$SUPA_URL/rest/v1/cultural_knowledge_points?select=id&limit=1" -H "apikey: $ANON_KEY"` |

---

## 8. 验证 Checklist

### 基础连通性（5min）

- [ ] `pnpm dev` 正常启动，端口 5000 监听
- [ ] `curl http://localhost:5000/` → HTTP 200
- [ ] `curl /api/knowledge/points` → 有知识点
- [ ] `curl /api/learners` → 有学习者

### LLM 网关（2min）

- [ ] `POST /api/test/llm` 有响应

### 学习链路（3-5min）

- [ ] `POST /api/learning` → 200 或 422（422 算正常拦截）
- [ ] 响应有 5 道练习题
- [ ] `anxiety_level` 有值

### Auth 流程（3min）🆕

- [ ] `POST /api/auth/register` 成功
- [ ] `POST /api/auth/login` 返回 Cookie
- [ ] `GET /api/auth/me` 返回用户信息

### Mock 兜底（可选）

- [ ] `LLM_MOCK_MODE=true pnpm dev` 所有链路正常

---

## 9. 脚本速查

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 开发（scripts/dev.sh） |
| `pnpm build` | 生产构建 |
| `pnpm start` | 生产运行 |
| `pnpm ts-check` | 类型检查 |
| `pnpm test` | vitest run |
| `pnpm smoke` / `smoke:all` | 冒烟测试 |
| `bash scripts/prepare.sh` | 依赖与环境变量检查 |
| `node scripts/diag-neo4j.mjs` | Neo4j 诊断 |

---

> 完整架构说明见 [CODE_WIKI.md](./CODE_WIKI.md)。旧版单体架构说明书见 `AGENTS.md`。
