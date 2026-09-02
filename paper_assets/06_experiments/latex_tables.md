# LaTeX 实验表格

## 表1：消融实验结果

```latex
\begin{table*}[htbp]
\centering
\caption{消融实验结果（均值 $\pm$ 标准差，5分制）}
\label{tab:ablation}
\begin{tabular}{lccccc}
\toprule
\textbf{条件} & \textbf{CA} & \textbf{PA} & \textbf{PD} & \textbf{CN} & \textbf{TE} \\
\midrule
Full System         & —  & —  & —  & —  & — \\
$-$RAG              & —  & —  & —  & —  & — \\
$-$Profile          & —  & —  & —  & —  & — \\
$-$Anxiety          & —  & —  & —  & —  & — \\
$-$MultiAgent       & —  & —  & —  & —  & — \\
$-$Guardrail        & —  & —  & —  & —  & — \\
$-$L2Trend          & —  & —  & —  & —  & — \\
\bottomrule
\end{tabular}
\begin{tablenotes}
\small
\item 注：CA=文化准确性，PA=语用得体性，PD=个性化程度，CN=内容自然度，TE=教学有效性。
\item 评分者间一致性 Krippendorff's $\alpha$ = —。
\item $^{*}p<0.05$, $^{**}p<0.01$（Wilcoxon符号秩检验，Bonferroni校正）。
\end{tablenotes}
\end{table*}
```

## 表2：Baseline对比结果

```latex
\begin{table*}[htbp]
\centering
\caption{系统与Baseline对比结果（均值 $\pm$ 标准差，5分制）}
\label{tab:baseline}
\begin{tabular}{lcccccc}
\toprule
\textbf{系统} & \textbf{CA} & \textbf{PA} & \textbf{PD} & \textbf{CN} & \textbf{TE} & \textbf{GIR(\%)} \\
\midrule
本文系统 (Full)     & — & — & — & — & — & — \\
NoRAG               & — & — & — & — & — & — \\
NoProfile           & — & — & — & — & — & — \\
SingleAgent         & — & — & — & — & — & — \\
VanillaLLM          & — & — & — & — & — & — \\
\bottomrule
\end{tabular}
\begin{tablenotes}
\small
\item 注：GIR=Guardrail拦截率（问题内容被成功拦截的比例）。
\item Kruskal-Wallis检验 $p$ = —，事后Dunn检验结果见正文。
\end{tablenotes}
\end{table*}
```

## 表3：消融实验指标变化量

```latex
\begin{table}[htbp]
\centering
\caption{各消融条件相对Full系统的指标变化（$\Delta$值）}
\label{tab:ablation-delta}
\begin{tabular}{lccccc}
\toprule
\textbf{消融条件} & $\Delta$\textbf{CA} & $\Delta$\textbf{PA} & $\Delta$\textbf{PD} & $\Delta$\textbf{CN} & $\Delta$\textbf{TE} \\
\midrule
$-$RAG        & — & — & — & — & — \\
$-$Profile    & — & — & — & — & — \\
$-$Anxiety    & — & — & — & — & — \\
$-$MultiAgent & — & — & — & — & — \\
$-$Guardrail  & — & — & — & — & — \\
$-$L2Trend    & — & — & — & — & — \\
\bottomrule
\end{tabular}
\begin{tablenotes}
\small
\item 注：负值表示消融后指标下降。粗体标记效应量（Cliff's $d$）$\geq 0.5$的显著变化。
\end{tablenotes}
\end{table}
```

## 表4：Guardrail各层校验统计

```latex
\begin{table}[htbp]
\centering
\caption{Guardrail各层校验通过率与置信度分布}
\label{tab:guardrail}
\begin{tabular}{lcccc}
\toprule
\textbf{Guardrail层} & \textbf{通过率(\%)} & \textbf{$\bar{C}$} & \textbf{$\sigma_C$} & \textbf{权重$w$} \\
\midrule
verifyA2Translation   & — & — & — & 0.25 \\
verifyA3Comparison    & — & — & — & 0.15 \\
verifyA4Grounding     & — & — & — & 0.10 \\
verifyA4Solver        & — & — & — & 0.05 \\
preA5HardRules        & — & — & — & 0.05 \\
verifyA5Joint         & — & — & — & 0.40 \\
\midrule
加权聚合 $C$          & — & — & — & 1.00 \\
\bottomrule
\end{tabular}
\begin{tablenotes}
\small
\item 注：$\bar{C}$为各层判决的平均置信度贡献，$\sigma_C$为标准差。
\item 加权聚合 $C = \sum w_i c_i / \sum w_i$，$C \geq 0.85$进入ACTIVE缓存（见 \texttt{CACHE\_WRITE\_CONFIDENCE\_THRESHOLD=0.85}）。
\end{tablenotes}
\end{table}
```

## 表5：人工评测评分者间一致性

```latex
\begin{table}[htbp]
\centering
\caption{人工评测评分者间一致性（Krippendorff's $\alpha$）}
\label{tab:agreement}
\begin{tabular}{lcc}
\toprule
\textbf{评估维度} & \textbf{评分者组} & \textbf{Krippendorff's $\alpha$} \\
\midrule
文化准确性 (CA)   & 教师$\times$2 + 跨文化研究者$\times$1 & — \\
语用得体性 (PA)   & 教师$\times$2                       & — \\
个性化程度 (PD)   & 母语者$\times$2                     & — \\
内容自然度 (CN)   & 母语者$\times$2                     & — \\
教学有效性 (TE)   & 教师$\times$2                       & — \\
\bottomrule
\end{tabular}
\begin{tablenotes}
\small
\item 注：$\alpha \geq 0.80$为良好一致性，$0.67 \leq \alpha < 0.80$为可接受。
\end{tablenotes}
\end{table}
```

## 表6：案例分析多画像对比

```latex
\begin{table*}[htbp]
\centering
\caption{案例"请客"在不同学习者画像下的系统输出特征对比}
\label{tab:case-qingke}
\begin{tabular}{p{2.5cm}p{4cm}p{4cm}p{4cm}}
\toprule
\textbf{维度} & \textbf{P1: 日语/HSK2/高焦虑} & \textbf{P2: 英语/HSK5/低焦虑} & \textbf{P3: 泰语/HSK3/中焦虑} \\
\midrule
母语占比 & 0.75（日语为主） & 0.25（中文为主） & 0.50（均衡） \\
阐释深度 & "是什么"层（基础概念） & "为什么"层（文化动因） & "是什么+何时用" \\
对比参照 & 日本「奢る」文化 & 英语圈AA制 (split the bill) & 泰国社交礼仪 \\
学术框架 & 无（基础层不引入） & Hofstede集体主义维度 & 简化引用Hall高语境 \\
练习难度 & 低（选择题为主） & 高（填空+情境判断） & 中等（选择+判断） \\
练习场景 & 餐厅/朋友聚餐 & 商务宴请/同事社交 & 校园/同学聚会 \\
\bottomrule
\end{tabular}
\end{table*}
```

## 表7：自适应闭环验证结果

```latex
\begin{table}[htbp]
\centering
\caption{模拟学习者焦虑度变化轨迹（10轮学习）}
\label{tab:adaptive}
\begin{tabular}{cccc}
\toprule
\textbf{轮次} & \textbf{S1 快速进步型} & \textbf{S2 稳定型} & \textbf{S3 受挫型} \\
\midrule
初始 & 70 (med, 0.50) & 50 (med, 0.50) & 40 (med, 0.50) \\
R1   & — & — & — \\
R2   & — & — & — \\
R3   & — & — & — \\
R4   & — & — & — \\
R5   & — & — & — \\
R6   & — & — & — \\
R7   & — & — & — \\
R8   & — & — & — \\
R9   & — & — & — \\
R10  & — & — & — \\
\bottomrule
\end{tabular}
\begin{tablenotes}
\small
\item 注：格式为"焦虑度分数 (等级, native\_ratio)"。等级变化触发native\_ratio阶跃。
\item S1预期轨迹：70$\rightarrow$下降$\rightarrow$约30；S3预期轨迹：40$\rightarrow$上升$\rightarrow$约80。
\end{tablenotes}
\end{table}
```

## 表8：五个案例的多维度评分汇总

```latex
\begin{table*}[htbp]
\centering
\caption{五个案例的人工评测多维度评分（Full系统，3位专家均值）}
\label{tab:case-scores}
\begin{tabular}{lccccc}
\toprule
\textbf{案例} & \textbf{CA} & \textbf{PA} & \textbf{PD} & \textbf{CN} & \textbf{TE} \\
\midrule
请客        & — & — & — & — & — \\
买单/AA制   & — & — & — & — & — \\
喝茶        & — & — & — & — & — \\
红包        & — & — & — & — & — \\
称呼语      & — & — & — & — & — \\
\midrule
均值        & — & — & — & — & — \\
\bottomrule
\end{tabular}
\end{table*}
```

## 表9：系统自动化指标统计

```latex
\begin{table}[htbp]
\centering
\caption{系统自动化质量指标（30组实验样本）}
\label{tab:auto-metrics}
\begin{tabular}{lcc}
\toprule
\textbf{指标} & \textbf{均值} & \textbf{标准差} \\
\midrule
HSK合规率 (\%)                  & — & — \\
拼音格式通过率 (\%)             & — & — \\
缓存精确命中率 (\%)             & — & — \\
HSK容忍命中率 (\%)              & — & — \\
加权置信度 $C$                  & — & — \\
A5四维评分均值                  & — & — \\
双模型仲裁一致率 ($\delta \leq 0.15$, \%) & — & — \\
端到端延迟 (秒)                 & — & — \\
缓存命中路径延迟 (秒)           & — & — \\
\bottomrule
\end{tabular}
\end{table}
```

## 表10：实验配置

```latex
\begin{table}[htbp]
\centering
\caption{实验环境与模型配置}
\label{tab:config}
\begin{tabular}{lll}
\toprule
\textbf{组件} & \textbf{模型} & \textbf{参数} \\
\midrule
A2/A3/A4 生成   & DeepSeek (deepseek-chat) & $t=0.3$, timeout=60-90s \\
A5 质量审核     & DeepSeek         & $t=0.0$, timeout=60s \\
Guardrail 高 stakes 裁判  & DeepSeek         & $t=0.0$ \\
Guardrail 低 stakes 校验  & qwen3.6-plus (eflowcode) & $t=0.0$ \\
A5 仲裁         & DeepSeek 单模型 (原MiniMax已废弃,降级) & $t=0.0$ \\
CIEval 主裁判   & qwen3.7-plus (eflowcode,异族) & $t=0.0$ \\
CIEval 第二裁判 & glm-5 (eflowcode,双裁判一致性) & $t=0.0$ \\
\midrule
知识图谱        & Neo4j            & max 50连接, 10s超时 \\
结构化存储      & PostgreSQL       & Supabase托管 \\
缓存检索        & 复合主键等值查询  & $(kp\_id, hsk, scene)$ \\
\bottomrule
\end{tabular}
\end{table}
```

## 表11：RQ1 消融实验 — CIEval 评分（真实数据, n=26）

> 数据来源：`experiment_results/rq1_mini_cieval.jsonl`（26 测试用例 × 5 条件）。CIEval 四维：A理论(5)/B安全(5)/C空间(5)/D教学(5)，总分 20。均值±标准差。

```latex
\begin{table*}[htbp]
\centering
\caption{RQ1 消融实验 CIEval 评分（均值 $\pm$ 标准差，n=26，总分 20）}
\label{tab:rq1-ablation}
\begin{tabular}{lccccc}
\toprule
\textbf{条件} & \textbf{A理论} & \textbf{B安全} & \textbf{C空间} & \textbf{D教学} & \textbf{CIEval总分} \\
\midrule
C1 完整系统 (Full)            & 4.04$\pm$0.85 & 4.88$\pm$0.42 & 3.27$\pm$0.59 & 3.50$\pm$0.50 & \textbf{15.80$\pm$1.38} \\
C2 单体 LLM (Monolith)       & 1.77$\pm$0.97 & 4.88$\pm$0.32 & 3.19$\pm$0.88 & 3.00$\pm$0.00 & 12.60$\pm$2.00 \\
C3 去掉 A3 (NoA3)            & 1.69$\pm$0.95 & 4.92$\pm$0.27 & 3.15$\pm$0.53 & 3.54$\pm$0.50 & 12.94$\pm$1.06 \\
C4 去掉 A5 (NoA5)            & 4.04$\pm$0.85 & 4.92$\pm$0.27 & 3.12$\pm$0.58 & 3.46$\pm$0.50 & 15.65$\pm$1.54 \\
C5 去掉 A2+A3 (NoA2A3)       & 1.69$\pm$0.95 & 5.00$\pm$0.00 & 3.23$\pm$0.70 & 3.46$\pm$0.50 & 13.03$\pm$1.48 \\
\bottomrule
\end{tabular}
\begin{tablenotes}
\small
\item 注：A=文化理论正确性，B=内容安全性，C=语用空间适配，D=教学有效性。
\item C4（去 A5）与 C1 在总分与 A 维度上几乎相等，表明 A5 为纯质量网关、不改写内容（T45 通过）。
\item 各条件在 B/C/D 三维度无显著差异；分数差距集中在 A 维度。
\end{tablenotes}
\end{table*}
```

## 表12：RQ1 配对 t 检验（同测试用例跨条件配对, C1 为基线, n=26）

> 检验方法：配对样本 t 检验（scipy），报告均值差 $\Delta$=C1−条件、95% 置信区间、t 与 p。显著性阈值 $p<0.05$。

```latex
\begin{table}[htbp]
\centering
\caption{RQ1 配对 t 检验：C1 为基线（$\Delta$=C1−条件），n=26}
\label{tab:rq1-paired}
\begin{tabular}{lcccc}
\toprule
\textbf{对比 (维度)} & \boldmath{$\Delta$} & \textbf{95\% CI} & \textbf{t} & \textbf{p} \\
\midrule
C1 vs C2 (TOTAL) & $-$3.20 & [$-$4.52, $-$1.88] & $-$5.01 & $<$.0001$^{**}$ \\
C1 vs C3 (TOTAL) & $-$2.86 & [$-$3.71, $-$2.01] & $-$6.94 & $<$.0001$^{**}$ \\
C1 vs C4 (TOTAL) & $-$0.15 & [$-$0.50, $+$0.21] & $-$0.85 & .405 \\
C1 vs C5 (TOTAL) & $-$2.77 & [$-$3.86, $-$1.68] & $-$5.25 & $<$.0001$^{**}$ \\
\midrule
C1 vs C2 (A理论) & $-$2.27 & [$-$2.98, $-$1.56] & $-$6.55 & $<$.0001$^{**}$ \\
C1 vs C3 (A理论) & $-$2.35 & [$-$3.04, $-$1.66] & $-$7.00 & $<$.0001$^{**}$ \\
C1 vs C4 (A理论) & $+$0.00 & [$-$0.11, $+$0.11] & $+$0.00 & 1.000 \\
C1 vs C5 (A理论) & $-$2.35 & [$-$3.04, $-$1.66] & $-$7.00 & $<$.0001$^{**}$ \\
\midrule
C1 vs C2 (D教学) & $-$0.50 & [$-$0.70, $-$0.30] & $-$5.10 & $<$.0001$^{**}$ \\
C1 vs C3 (D教学) & $+$0.04 & [$-$0.17, $+$0.25] & $+$0.38 & .708 \\
C1 vs C4 (D教学) & $-$0.04 & [$-$0.25, $+$0.17] & $-$0.38 & .708 \\
C1 vs C5 (D教学) & $-$0.04 & [$-$0.30, $+$0.22] & $-$0.30 & .765 \\
\bottomrule
\end{tabular}
\begin{tablenotes}
\small
\item B安全、C空间两维度所有对比 $p>.05$（不显著），故略去。
\item $^{**}p<0.01$。C1 vs C4 在所有维度均不显著，与 T45 内容一致性结论一致。
\item C3（去 A3）与 C5（去 A2+A3）在 TOTAL 与 A 维度表现几乎相同，说明 A3 是提分主力、A2 增量有限。
\end{tablenotes}
\end{table}
```

## 表13：T50 A5 质量网关 — 拒绝率与判别力（n=52, C1/C2 各 26）

> 方法：复用生产级 `GuardrailService.verifyA5JointArbitration` 对 RQ1 生成内容重打分。confidence = 双模型 overall\_score 均值(0–1)。阈值 `CACHE_WRITE_CONFIDENCE_THRESHOLD=0.85`。

```latex
\begin{table}[htbp]
\centering
\caption{T50 A5 质量网关：拒绝率与置信度判别（n=52）}
\label{tab:t50-guardrail}
\begin{tabular}{lccccc}
\toprule
\textbf{条件} & \textbf{n} & \textbf{拒绝率} & \textbf{conf 均值} & \textbf{conf sd} & \textbf{conf 范围} \\
\midrule
C1 完整系统 (多Agent)   & 26 & 0.0\%  & 0.843 & 0.060 & [0.60, 0.90] \\
C2 单体 LLM             & 26 & 23.1\% & 0.665 & 0.143 & [0.30, 0.90] \\
\bottomrule
\end{tabular}
\begin{tablenotes}
\small
\item C1 vs C2 confidence 差异 $\Delta$=+0.178, t=5.74, $p\approx2\times10^{-6}$（显著）。
\item A5 对好内容零误杀（0\% 拒绝）、对弱内容拦截约 1/4，与 T45/T47「纯质量网关」一致。
\item A5 confidence 与 CIEval 总分同条件内弱相关（$|r|<0.15$）：二者评测构念不同（练习题质量 vs 教学多维），判别力体现在跨架构层面。
\end{tablenotes}
\end{table}
```

## 表14：T50 A5 质量网关 — 缓存准入率（n=52）

> 缓存准入：content 进入 ACTIVE 缓存当且仅当 A5 聚合置信度 $C\ge0.85$。门控命中率 = 准入率。

```latex
\begin{table}[htbp]
\centering
\caption{T50 A5 质量网关：缓存准入率与再生成本（n=52）}
\label{tab:t50-cache}
\begin{tabular}{lccc}
\toprule
\textbf{条件} & \textbf{准入率 (C$\ge$0.85)} & \textbf{门控命中率} & \textbf{相对再生倍数} \\
\midrule
C1 完整系统 (多Agent)   & 73.1\% & 73.1\% & 1.0$\times$ \\
C2 单体 LLM             & 15.4\% & 15.4\% & 3.1$\times$ \\
\bottomrule
\end{tabular}
\begin{tablenotes}
\small
\item 多Agent 内容缓存可准入率约为单体的 4.7 倍；同等流量下单体需多再生约 3.1 倍 $\rightarrow$ A5 门控带来显著成本优势。
\item 门控不降解好内容：C1 门控池 vs 全量池 served CIEval 均值 = 15.67 vs 15.80（几乎无差）。
\item 全量缓存虽命中率 100\%，但弱内容（如 C2 被拒的 23\%）也会入池并被服务，存在质量风险。
\end{tablenotes}
\end{table}
```

## 使用说明

- 表格中"—"为待填入实验数据的占位符
- 所有表格均使用`booktabs`宏包排版
- 宽表使用`table*`环境跨双栏
- 表注使用`tablenotes`环境（需`threeparttable`宏包）
- 实际使用时需在导言区添加：
  ```latex
  \usepackage{booktabs}
  \usepackage{threeparttable}
  \usepackage{multirow}
  ```
