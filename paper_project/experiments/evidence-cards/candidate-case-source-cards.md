# 6 个候选 case 文化来源证据卡（未验证模板）

> 用途：Pilot 材料准入前的人工事实核对。这不是问卷，也不是已验证证据。每条主张必须有可追溯来源、适用文化/地区、时间范围和核对者；在此之前状态为 `UNVERIFIED`。

## 通用字段

- case_id / 目标文化 / HSK / 场景
- atomic_claim_id；生成文本原句；可核验的最小主张
- source_type（一手规范/学术/权威机构/其他）；完整引用；页码/段落；访问日期
- supported / contradicted / contextual-only / unresolved
- 文化内部差异限定；刻板化风险；医疗/安全风险
- reviewer_id；`cultural_familiarity_1_3`；复核日期；备注

## 候选 case（六张独立卡）

1. `emergency_er_symptom_ar_hsk5` — 阿拉伯语圈 / HSK5 / 急诊症状；状态 `UNVERIFIED`
2. `campus_classroom_leave_ja_hsk5` — 日语圈 / HSK5 / 课堂请假；状态 `UNVERIFIED`
3. `housing_maintenance_report_fr_hsk3` — 法语圈 / HSK3 / 住房报修；状态 `UNVERIFIED`
4. `medical_pharmacy_otc_es_hsk3` — 西班牙语圈 / HSK3 / 药房非处方药；状态 `UNVERIFIED`
5. `shopping_inquiry_size_en_hsk1` — 英语圈 / HSK1 / 购物尺码；状态 `UNVERIFIED`
6. `transport_subway_basic_ja_hsk1` — 日语圈 / HSK1 / 地铁基础；状态 `UNVERIFIED`

每张卡须逐条复制“通用字段”并由人工填完。任一高风险主张 `unresolved/contradicted`，或目标文化错配，该 case 不得进入 Pilot。
