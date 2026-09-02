#!/usr/bin/env python3
"""
知识图谱 KP 批量生成脚本
========================
使用 LLM (DeepSeek) 为空的 Domain 批量生成 Scene 和 KnowledgePoint 数据，
以已有的 food + workplace 领域数据作为 few-shot 示例。

环境变量（必需）：
  DEEPSEEK_API_KEY

用法：
  python3 scripts/generate_kps.py [--domain daily] [--all] [--dry-run] [--output out.json]

  --domain <id>  只生成指定领域
  --all          生成所有空领域（默认）
  --dry-run      只打印 prompt 不调用 LLM
  --output       输出到指定文件（默认追加到 knowledge_graph_seed.json）
  --merge        自动合并到 knowledge_graph_seed.json
"""

import json
import os
import sys
import argparse
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

# ============================================================================
# 配置
# ============================================================================

SCRIPT_DIR = Path(__file__).resolve().parent
SEED_PATH = SCRIPT_DIR / "knowledge_graph_seed.json"
VALID_LANGUAGES = ["en", "ja", "ko", "es", "ar", "ru", "fr", "th"]

LANGUAGE_CONTEXT = {
    "en": "英语圈（美国/英国等），直接表达、AA制、低语境文化",
    "ja": "日语圈（日本），敬语体系、遠慮文化、高语境、縦社会（等级社会）",
    "ko": "韩语圈（韩国），年龄等级严格、한턱내다请客文化、반찬小菜文化",
    "es": "西班牙语圈（西班牙/拉美），热情直接、invitar邀请文化、sobremesa餐后长谈",
    "ar": "阿拉伯语圈（中东/北非），清真饮食、荣誉文化、性别空间分隔",
    "ru": "俄语圈（俄罗斯/中亚），直接坦率、застолье宴席文化、面包与盐迎客礼",
    "fr": "法语圈（法国/西非），用餐礼仪精致、non merci明确拒绝、美食文化自豪",
    "th": "东南亚文化圈（泰国/越南等），微笑文化、合十礼、庙宇礼仪、辛辣饮食",
}

# 12 个待填充的领域定义
EMPTY_DOMAINS_INFO = [
    {
        "id": "daily", "name": "日常社交", "icon": "👋",
        "name_en": "Daily Social",
        "description": "寒暄问候、自我介绍、邀约与拒绝、闲聊话题",
        "scene_suggestions": "greeting(寒暄问候), introduction(自我介绍), invitation(邀约与拒绝), small_talk(闲聊话题)"
    },
    {
        "id": "campus", "name": "校园生活", "icon": "🎓",
        "name_en": "Campus Life",
        "description": "课堂互动、宿舍生活、社团活动、与老师沟通",
        "scene_suggestions": "classroom(课堂互动), dormitory(宿舍生活), clubs(社团活动), teacher(与老师沟通)"
    },
    {
        "id": "travel", "name": "旅游出行", "icon": "✈️",
        "name_en": "Travel",
        "description": "酒店入住、景点游览、问路指路、交通票务",
        "scene_suggestions": "hotel(酒店入住), sightseeing(景点游览), directions(问路指路), tickets(交通票务)"
    },
    {
        "id": "shopping", "name": "购物消费", "icon": "🛒",
        "name_en": "Shopping",
        "description": "讨价还价、退换货、询问尺码、支付方式",
        "scene_suggestions": "bargain(讨价还价), returns(退换货), size_inquiry(询问尺码), payment(支付方式)"
    },
    {
        "id": "transport", "name": "交通出行", "icon": "🚇",
        "name_en": "Transportation",
        "description": "公共交通、打车叫车、导航指路、购票退票",
        "scene_suggestions": "public_transit(公共交通), taxi(打车叫车), navigation(导航指路), tickets(购票退票)"
    },
    {
        "id": "medical", "name": "医疗健康", "icon": "🏥",
        "name_en": "Medical Care",
        "description": "挂号就诊、描述症状、取药买药、中医文化",
        "scene_suggestions": "registration(挂号就诊), symptoms(描述症状), pharmacy(取药买药), tcm(中医文化)"
    },
    {
        "id": "banking", "name": "银行金融", "icon": "🏦",
        "name_en": "Banking & Finance",
        "description": "开户办卡、转账汇款、兑换货币、移动支付",
        "scene_suggestions": "account(开户办卡), transfer(转账汇款), exchange(兑换货币), mobile_pay(移动支付)"
    },
    {
        "id": "housing", "name": "租房住宿", "icon": "🏠",
        "name_en": "Housing & Rental",
        "description": "看房租房、与房东沟通、报修维护、邻里相处",
        "scene_suggestions": "viewing(看房租房), landlord(与房东沟通), maintenance(报修维护), neighbors(邻里相处)"
    },
    {
        "id": "entertainment", "name": "休闲娱乐", "icon": "🎬",
        "name_en": "Entertainment",
        "description": "看电影/KTV、运动健身、社交媒体、追剧讨论",
        "scene_suggestions": "ktv_cinema(电影KTV), sports(运动健身), social_media(社交媒体), drama(追剧讨论)"
    },
    {
        "id": "emergency", "name": "紧急情况", "icon": "🚨",
        "name_en": "Emergency",
        "description": "报警求助、失物招领、就医急诊、自然灾害应对",
        "scene_suggestions": "police(报警求助), lost_found(失物招领), er(就医急诊), disaster(灾害应对)"
    },
    {
        "id": "family", "name": "家庭与亲属", "icon": "👨‍👩‍👧‍👦",
        "name_en": "Family & Relatives",
        "description": "亲属称谓、家庭聚会、与长辈相处、春节拜年",
        "scene_suggestions": "kinship_terms(亲属称谓), family_gathering(家庭聚会), elders(与长辈相处), new_year(春节拜年)"
    },
    {
        "id": "festival", "name": "节日与传统", "icon": "🧧",
        "name_en": "Festivals & Traditions",
        "description": "传统节日、送礼礼仪、婚礼葬礼、庙会活动",
        "scene_suggestions": "traditional_festivals(传统节日), gift_giving(送礼礼仪), ceremonies(婚丧礼仪), temple_fair(庙会活动)"
    },
]


# ============================================================================
# Prompt 构建
# ============================================================================

def load_seed_data():
    with open(SEED_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def make_few_shot_example():
    """从已有数据中提取 food 的一个 scene 作为 few-shot 示例"""
    data = load_seed_data()
    food = next(d for d in data["domains"] if d["id"] == "food")
    workplace = next(d for d in data["domains"] if d["id"] == "workplace")

    examples = []
    # food 的 ordering scene（含3个tasks）
    ordering = next(s for s in food["scenes"] if s["id"] == "ordering")
    examples.append(json.dumps(ordering, ensure_ascii=False, indent=2))

    # workplace 的 hierarchy scene（含3个tasks，最具跨文化特征）
    hierarchy = next(s for s in workplace["scenes"] if s["id"] == "hierarchy")
    examples.append(json.dumps(hierarchy, ensure_ascii=False, indent=2))

    return examples


def build_prompt(domain_info: dict, few_shots: list) -> str:
    """构建 LLM 生成 prompt"""
    examples_text = "\n\n".join([
        f"/* 示例 {i+1}: {ex[:50]}... */\n{ex}"
        for i, ex in enumerate(few_shots)
    ])

    return f"""你是国际中文教育（TCSL）领域的语用任务图谱设计专家。

请为以下领域设计 3-4 个 Scene（场景），每个 Scene 包含 2-3 个 KnowledgePoint（语用任务）。

## 领域信息
- ID: {domain_info['id']}
- 名称: {domain_info['name']} ({domain_info['name_en']})
- 图标: {domain_info['icon']}
- 描述: {domain_info['description']}
- 建议场景方向: {domain_info.get('scene_suggestions', '请自行设计')}

## 输出格式要求
每个 Scene 的 JSON 结构如下：

```json
{{
  "id": "snake_case英文ID",
  "name": "中文名称（2-5字）",
  "name_en": "English Name",
  "icon": "单个emoji",
  "description": "中文描述（15-30字）",
  "tasks": [
    {{
      "id": "{{domain_id}}_{{scene_id缩写}}_{{语义标识}}",
      "name": "任务名称（3-8字）",
      "pragmatic_intent": "学习者在真实中文环境中能用中文完成的交际意图（20-40字）",
      "cultural_complexity": 1-5,
      "high_context": true/false,
      "hsk_level": 1-6,
      "l1_conflict_points": {{
        "en": "英语圈母语者在执行此任务时与文化相关的冲突点描述（15-40字中文）",
        "ja": "日语圈...",
        "ko": "韩语圈...",
        "es": "西班牙语圈...",
        "ar": "阿拉伯语圈...",
        "ru": "俄语圈...",
        "fr": "法语圈...",
        "th": "东南亚文化圈..."
      }}
    }}
  ]
}}
```

## 8种母语文化圈的差异性参考
- 英语圈(en): 直接表达、AA制、低语境
- 日语圈(ja): 敬语体系、遠慮文化、高语境等级社会
- 韩语圈(ko): 年龄等级严格、请客文化深厚
- 西班牙语圈(es): 热情直接、invitar邀请文化
- 阿拉伯语圈(ar): 清真饮食、荣誉文化、性别空间
- 俄语圈(ru): 直接坦率、宴席文化
- 法语圈(fr): 用餐礼仪精致、明确拒绝文化
- 东南亚文化圈(th): 微笑文化、辛辣饮食、佛教礼仪

## 设计要求
1. **id命名**: 遵循 `{{domain_id}}_{{scene_abbrev}}_{{语义标识}}` 格式，全小写+下划线
2. **cultural_complexity**: 1=直接表达即可，3=需要了解社交规则，5=涉及深层面子/人情博弈
3. **high_context**: 涉及推拉、暗示、非直接表达的场景标 true
4. **hsk_level**: 1-2=初级基础交际，3-4=中级社交场景，5-6=高级抽象话题/复杂社交
5. **l1_conflict_points**: 每个语言必须填写！描述该母语者在这个具体任务中会遇到的**文化冲突或语用差异**，不是泛泛的"文化不同"。要具体到行为层面。不是所有8个语言都要完全不同，有些文化相近的语言可以有类似的冲突描述。
6. **场景分布**: 按简单→复杂的顺序排列 tasks，hsk_level 和 cultural_complexity 逐渐递增

## 参考示例（来自已完成的 food 和 workplace 领域）
{examples_text}

## 请直接输出 JSON
只输出一个 JSON 数组，包含 3-4 个 Scene 对象。不要用 Markdown 代码块包裹，不要加任何注释或解释文字。

[
  {{
    "id": "...",
    "name": "...",
    ...
    "tasks": [...]
  }}
]"""


# ============================================================================
# LLM 调用 (支持 DeepSeek / MiniMax，均为 OpenAI 兼容 API)
# ============================================================================

PROVIDER_CONFIG = {
    "minimax": {
        "env_key": "MINIMAX_API_KEY",
        "env_url_key": "MINIMAX_API_URL",
        "default_endpoint": "http://202.112.194.90:10300/v1/chat/completions",
        "model": "MiniMax-M2.7",
        "max_tokens_field": "max_tokens",
    },
    "deepseek": {
        "env_key": "DEEPSEEK_API_KEY",
        "env_url_key": None,
        "default_endpoint": "https://api.deepseek.com/v1/chat/completions",
        "model": "deepseek-chat",
        "max_tokens_field": "max_tokens",
    },
}


def call_llm(prompt: str, provider: str = "minimax", dry_run: bool = False) -> str:
    """调用 LLM API 生成内容（支持 minimax / deepseek）"""
    cfg = PROVIDER_CONFIG.get(provider)
    if not cfg:
        raise ValueError(f"不支持的 provider: {provider}，可选: {list(PROVIDER_CONFIG.keys())}")

    api_key = os.getenv(cfg["env_key"], "").strip()
    if not api_key:
        raise RuntimeError(f"缺少 {cfg['env_key']} 环境变量")

    # 端点：优先用环境变量 MINIMAX_API_URL，否则用默认值
    endpoint = cfg["default_endpoint"]
    if cfg.get("env_url_key"):
        env_url = os.getenv(cfg["env_url_key"], "").strip()
        if env_url:
            endpoint = f"{env_url.rstrip('/')}/v1/chat/completions"

    if dry_run:
        print("\n" + "=" * 60)
        print(f"🔍 DRY RUN ({provider}) — endpoint: {endpoint}")
        print("=" * 60)
        print(prompt[:2000] + ("\n... (truncated)" if len(prompt) > 2000 else ""))
        print("=" * 60)
        return ""
    if (os.getenv("LLM_REAL_CALLS_ENABLED") != "true" or
            float(os.getenv("LLM_RUN_BUDGET_CNY", "0")) <= 0 or
            os.getenv("LLM_LEGACY_PRICE_VERIFIED") != "true"):
        raise RuntimeError("Real LLM calls are disabled, unbudgeted, or legacy pricing is unverified")

    body = {
        "model": cfg["model"],
        "messages": [
            {"role": "system", "content": "你是一个精确的 JSON 生成器。只输出合法的 JSON，不添加任何解释。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "top_p": 0.9,
    }
    body[cfg["max_tokens_field"]] = 8192

    print(f"  🌐 {provider} endpoint: {endpoint}")

    req = Request(
        endpoint,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )

    for attempt in range(3):
        try:
            with urlopen(req, timeout=180) as resp:
                data = json.loads(resp.read())

            # OpenAI 兼容格式: {"choices": [{"message": {"content": "..."}}]}
            content = data["choices"][0]["message"]["content"]
            return content
        except (KeyError, IndexError) as e:
            print(f"  ⚠️ 响应格式解析失败 (attempt {attempt+1}/3): {e}")
            print(f"  Response preview: {str(data)[:500]}")
            if attempt < 2:
                time.sleep(5 * (attempt + 1))
        except HTTPError as e:
            err_body = e.read().decode() if e.fp else ""
            print(f"  ⚠️ HTTP {e.code} (attempt {attempt+1}/3): {err_body[:300]}")
            if attempt < 2:
                time.sleep(5 * (attempt + 1))
        except Exception as e:
            print(f"  ⚠️ {e} (attempt {attempt+1}/3)")
            if attempt < 2:
                time.sleep(5 * (attempt + 1))

    raise RuntimeError(f"{provider} API 调用失败（重试3次后仍失败）")


# ============================================================================
# 校验 & 合并
# ============================================================================

def extract_json(raw_response: str) -> list:
    """从 LLM 回复中提取 JSON 数组"""
    text = raw_response.strip()
    # 移除可能的 markdown 代码块
    if text.startswith("```"):
        lines = text.split("\n")
        # 去掉首行 ```json 和末行 ```
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)

    # 找到 JSON 数组的起止位置
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        raise ValueError(f"未找到 JSON 数组。原始响应前200字: {text[:200]}")

    parsed = json.loads(text[start:end+1])
    if not isinstance(parsed, list):
        raise ValueError(f"输出不是数组而是 {type(parsed)}")
    return parsed


def patch_missing_languages(scenes: list, domain_info: dict) -> int:
    """对缺失 ru/fr/th 的 task，用简短的 LLM 调用补充"""
    # 收集所有需要补充的 task
    patches = []
    for si, scene in enumerate(scenes):
        for ti, task in enumerate(scene.get("tasks", [])):
            l1 = task.get("l1_conflict_points", {})
            missing = [l for l in VALID_LANGUAGES if l not in l1 or not l1[l]]
            if missing:
                patches.append((si, ti, task, missing))

    if not patches:
        return 0

    print(f"\n  🔧 补充 {len(patches)} 个 task 中缺失的语言 ({sum(len(m) for _,_,_,m in patches)} 个字段)...")

    for si, ti, task, missing in patches:
        existing = {l: task["l1_conflict_points"][l] for l in VALID_LANGUAGES if l in task["l1_conflict_points"] and task["l1_conflict_points"][l]}
        existing_text = "\n".join([f"  - {l}: {desc}" for l, desc in existing.items()])

        patch_prompt = f"""补全以下 KnowledgePoint 中缺少的母语文化冲突描述。

Task: {task['name']} ({task['pragmatic_intent']})
Domain: {domain_info['name']}

已有的冲突描述：
{existing_text}

请为以下语言各写一条冲突描述（15-40字中文，要具体到行为层面）：
{', '.join(missing)}

只输出 JSON 对象，格式：{{"ru": "...", "fr": "...", "th": "..."}}"""

        try:
            raw = call_llm(patch_prompt, provider="minimax", dry_run=False)
            # 提取 JSON（尝试直接解析，失败则提取第一个完整对象）
            raw_clean = raw.strip()
            try:
                new_desc = json.loads(raw_clean)
            except json.JSONDecodeError:
                # 提取最外层的 {} 或可能被 markdown 包裹的内容
                start = raw_clean.find("{")
                end = raw_clean.rfind("}")
                if start != -1 and end != -1 and end > start:
                    try:
                        new_desc = json.loads(raw_clean[start:end+1])
                    except json.JSONDecodeError:
                        # 最后手段：逐行匹配 JSON key-value
                        new_desc = {}
                        import re
                        for lang in missing:
                            m = re.search(f'"{lang}"\\s*:\\s*"([^"]*)"', raw_clean)
                            if m:
                                new_desc[lang] = m.group(1)
                else:
                    print(f"    ⚠️ {task['name']}: 未找到 JSON，raw={raw_clean[:100]}")
                    continue
            if new_desc:
                for lang, desc in new_desc.items():
                    if lang in missing and desc:
                        task["l1_conflict_points"][lang] = desc
                print(f"    ✅ {task['name']}: 补充 {len(new_desc)} 个语言")
            else:
                print(f"    ⚠️ {task['name']}: 响应格式异常")
        except Exception as e:
            print(f"    ⚠️ {task['name']}: {e}")

    return len(patches)


def validate_scene(scene: dict, domain_id: str, scene_index: int) -> list[str]:
    """校验单个 Scene 结构，返回错误列表"""
    errors = []

    # 必填顶层字段
    for field in ["id", "name", "name_en", "icon", "description", "tasks"]:
        if field not in scene:
            errors.append(f"Scene[{scene_index}] 缺少字段: {field}")

    if not isinstance(scene.get("tasks"), list) or len(scene["tasks"]) == 0:
        errors.append(f"Scene[{scene_index}] tasks 为空或非数组")
        return errors

    for ti, task in enumerate(scene["tasks"]):
        prefix = f"Scene[{scene_index}].tasks[{ti}]"

        for field in ["id", "name", "pragmatic_intent", "cultural_complexity",
                       "high_context", "hsk_level", "l1_conflict_points"]:
            if field not in task:
                errors.append(f"{prefix} 缺少字段: {field}")

        # ID 格式
        tid = task.get("id", "")
        if not tid.startswith(f"{domain_id}_"):
            errors.append(f"{prefix} id='{tid}' 不以 '{domain_id}_' 开头")

        # 数值范围
        cc = task.get("cultural_complexity", 0)
        if not (1 <= cc <= 5):
            errors.append(f"{prefix} cultural_complexity={cc} 超出 1-5")

        hsk = task.get("hsk_level", 0)
        if not (1 <= hsk <= 6):
            errors.append(f"{prefix} hsk_level={hsk} 超出 1-6")

        # high_context
        if not isinstance(task.get("high_context"), bool):
            errors.append(f"{prefix} high_context 不是 bool")

        # l1_conflict_points
        l1 = task.get("l1_conflict_points", {})
        if isinstance(l1, dict):
            missing_langs = [l for l in VALID_LANGUAGES if l not in l1 or not l1[l]]
            if missing_langs:
                errors.append(f"{prefix} l1_conflict_points 缺少语言: {missing_langs}")
        else:
            errors.append(f"{prefix} l1_conflict_points 不是 dict")

    return errors


def merge_into_seed(new_scenes: list, domain_id: str):
    """将生成的 scenes 合并到 knowledge_graph_seed.json"""
    data = load_seed_data()

    for domain in data["domains"]:
        if domain["id"] == domain_id:
            domain["scenes"] = new_scenes
            print(f"  ✅ 已合并到 {domain_id} ({domain['name']})：{len(new_scenes)} scenes, "
                  f"{sum(len(s.get('tasks', [])) for s in new_scenes)} tasks")
            break
    else:
        raise ValueError(f"未找到 domain_id={domain_id}")

    # 备份原文件
    backup_path = SEED_PATH.with_suffix(".json.bak")
    with open(backup_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  💾 已备份原文件到: {backup_path}")

    with open(SEED_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  💾 已写入: {SEED_PATH}")


# ============================================================================
# Main
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="LLM 批量生成 KnowledgePoint")
    parser.add_argument("--provider", default="minimax", choices=["minimax", "deepseek"],
                        help="LLM provider（默认 minimax）")
    parser.add_argument("--domain", default=None, help="指定单个 domain id")
    parser.add_argument("--all", action="store_true", help="生成所有空领域")
    parser.add_argument("--dry-run", action="store_true", help="只打印 prompt 不调用 LLM")
    parser.add_argument("--merge", action="store_true", help="自动合并到 seed JSON")
    parser.add_argument("--patch-only", default=None, help="仅修补已有的 generated_*.json 文件")
    parser.add_argument("--output", default=None, help="输出目录（默认 scripts/）")
    args = parser.parse_args()

    # --patch-only 模式：加载已有 JSON，仅修补
    if args.patch_only:
        patch_path = Path(args.patch_only)
        if not patch_path.exists():
            print(f"❌ 文件不存在: {patch_path}")
            sys.exit(1)
        with open(patch_path, "r", encoding="utf-8") as f:
            scenes = json.load(f)

        domain_id = patch_path.stem.replace("generated_", "")
        domain_info = next((d for d in EMPTY_DOMAINS_INFO if d["id"] == domain_id), None)
        if not domain_info:
            print(f"❌ 无法从文件名推断 domain，请用 --domain 指定")
            sys.exit(1)

        print(f"🔧 修补文件: {patch_path} (domain={domain_id})")
        all_errors = []
        for si, scene in enumerate(scenes):
            all_errors.extend(validate_scene(scene, domain_id, si))
        print(f"  修补前: {len(all_errors)} 个错误")

        if all_errors:
            patch_missing_languages(scenes, domain_info)
            all_errors = []
            for si, scene in enumerate(scenes):
                all_errors.extend(validate_scene(scene, domain_id, si))
            print(f"  修补后: {len(all_errors)} 个错误")

        with open(patch_path, "w", encoding="utf-8") as f:
            json.dump(scenes, f, ensure_ascii=False, indent=2)
        print(f"  💾 已保存: {patch_path}")

        if args.merge and not all_errors:
            merge_into_seed(scenes, domain_id)
        sys.exit(0)

    if not args.domain and not args.all:
        print("请指定 --domain <id> 或 --all")
        print("可用领域:")
        for d in EMPTY_DOMAINS_INFO:
            print(f"  {d['id']:15s} {d['icon']} {d['name']}")
        sys.exit(1)

    targets = EMPTY_DOMAINS_INFO
    if args.domain:
        targets = [d for d in EMPTY_DOMAINS_INFO if d["id"] == args.domain]
        if not targets:
            print(f"❌ 未找到领域: {args.domain}")
            sys.exit(1)

    few_shots = make_few_shot_example()
    output_dir = Path(args.output) if args.output else SCRIPT_DIR

    for domain_info in targets:
        print(f"\n{'='*60}")
        print(f"🎯 生成: {domain_info['icon']} {domain_info['name']} ({domain_info['id']})")
        print(f"{'='*60}")

        prompt = build_prompt(domain_info, few_shots)
        print(f"  📝 Prompt 长度: {len(prompt)} chars, Provider: {args.provider}")

        try:
            raw = call_llm(prompt, provider=args.provider, dry_run=args.dry_run)
        except Exception as e:
            print(f"  ❌ LLM 调用失败: {e}")
            continue

        if args.dry_run:
            continue

        # 解析
        try:
            scenes = extract_json(raw)
        except (ValueError, json.JSONDecodeError) as e:
            print(f"  ❌ JSON 解析失败: {e}")
            # 保存原始响应以便调试
            debug_path = output_dir / f"{domain_info['id']}_raw_response.txt"
            debug_path.write_text(raw, encoding="utf-8")
            print(f"  📄 原始响应已保存到: {debug_path}")
            continue

        print(f"  解析到 {len(scenes)} 个 Scene")

        # 校验
        all_errors = []
        for si, scene in enumerate(scenes):
            errors = validate_scene(scene, domain_info["id"], si)
            all_errors.extend(errors)
            task_count = len(scene.get("tasks", []))
            status = "✅" if not errors else f"⚠️ {len(errors)} errors"
            print(f"    Scene {si+1}: {scene.get('name', '?')} ({task_count} tasks) — {status}")

        if all_errors:
            print(f"\n  ⚠️ 共 {len(all_errors)} 个校验错误:")
            for err in all_errors[:10]:
                print(f"    - {err}")
            if len(all_errors) > 10:
                print(f"    ... 还有 {len(all_errors) - 10} 个")

        # 自动修补缺失语言
        if all_errors:
            patched = patch_missing_languages(scenes, domain_info)
            if patched > 0:
                # 重新校验
                all_errors = []
                for si, scene in enumerate(scenes):
                    all_errors.extend(validate_scene(scene, domain_info["id"], si))
                remaining = len(all_errors)
                print(f"  🔧 修补后剩余 {remaining} 个错误" if remaining else "  ✅ 修补后全部通过")

        # 保存
        out_path = output_dir / f"generated_{domain_info['id']}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(scenes, f, ensure_ascii=False, indent=2)
        print(f"  💾 已保存: {out_path}")

        # 合并
        if args.merge and not all_errors:
            merge_into_seed(scenes, domain_info["id"])

        # Rate limit
        time.sleep(2)

    print(f"\n{'='*60}")
    print("✅ 完成")


if __name__ == "__main__":
    main()
