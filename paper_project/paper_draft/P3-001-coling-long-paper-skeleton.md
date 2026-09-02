# P3-001 — COLING Long-Paper Skeleton (Evidence-Bounded Draft)

**Status:** structured planning draft; no new experimental results are reported.  
**Scope:** RQ1–RQ3 as frozen in `RESEARCH_PLAN.md`.  
**Evidence rule:** all result cells remain empty until a registered, schema-valid run or frozen human-review artifact is available. Existing CIEval Dimension A and aggregate-score comparisons are contaminated and are excluded from the main results. Existing Full–NoA3 scores are not independent evidence for RQ2.  
**Citation rule:** citation keys in this draft are restricted to `literature/approved_references.bib`.

## 1. Title Candidates

Recommended working title:

1. **Native-Culture-Aware Instructional Content Generation for Chinese Learning: Role Decomposition, Cross-Cultural Comparison, and Quality Gates**

Alternatives:

2. **Evaluating Role-Decomposed Agents for Native-Culture-Aware Chinese Learning Content**
3. **Auditing Cross-Cultural Chinese Learning Content Generation with Role-Level Ablations and Admission Gates**
4. **From Native-Culture Explanation to Instructional Content: A Controlled Study of Role-Decomposed LLM Agents**

Title 1 supports the long-paper story without asserting superiority. Title 2 is preferable if RQ3 evidence remains weak. Titles must not add “first,” “state-of-the-art,” or “GraphRAG.”

## 2. Abstract — Placeholder Structure (about 170–200 words)

Do not finalize the Abstract until the registered results and human evaluation are frozen.

1. **Problem (2 sentences).** Generating Chinese-learning materials for learners from different native-cultural backgrounds requires both linguistic level control and careful treatment of sociopragmatic differences. Existing work studies educational agents, cultural adaptation, and content control, but these strands are often evaluated under different tasks and assumptions.
2. **Approach (2 sentences).** We study a native-culture-aware generation pipeline that decomposes learner profiling, native-language explanation, cross-cultural comparison, content generation, and quality control into auditable stages. Structured knowledge may condition generation, but it is treated as a supporting component rather than a separately validated contribution.
3. **Evaluation (2 sentences).** We evaluate three questions: Full versus a token-budget-matched Monolith; Full versus NoA3 using canonical final materials; and Gate versus NoGate against blinded human quality labels. Two reviewers assess the same frozen set of materials, while automated judging is supplementary.
4. **Results (2–3 sentences; **leave blank**).** Insert only registered paired estimates, uncertainty intervals, agreement statistics, token fairness, latency, and cost. Do not use the contaminated CIEval A or aggregate score as main evidence.
5. **Conclusion (1 sentence; conditional).** State only what the final evidence supports, using “in this evaluation” and avoiding universal claims about cultures, learners, or multi-agent systems.

## 3. Introduction — Argument Chain (target: 5–6 paragraphs)

### Paragraph 1: Task and stakes

Large language models can generate explanations and exercises for language learning, but cross-cultural instruction requires more than grammatical fluency. A useful material must connect a Chinese expression or practice to the learner’s background without turning population-level tendencies into fixed identities. Work on cross-cultural pragmatics distinguishes pragmalinguistic from sociopragmatic failure and cautions against prescriptive treatment of cultural behavior \cite{thomas1983}. Generative systems therefore need both explicit task structure and an evaluation that checks cultural reasoning, pedagogical suitability, and potential stereotyping.

### Paragraph 2: Why existing directions do not settle the question

Educational LLM agents already support specialized pedagogical tasks and multi-agent communication \cite{chu2025agents}, and MultiTutor coordinates specialized agents for explanations, resources, exercises, and other forms of student support \cite{sun2025multitutor}. Cultural adaptation and culturally aware dialogue evaluation have likewise been formulated as explicit NLP tasks \cite{singh2024culture,havaldar2025culture}. These results motivate the design space, but they do not establish whether role decomposition helps this task under a fair monolithic baseline, or whether an explicit cross-cultural comparison role has independently measurable value.

### Paragraph 3: Evaluation hazards

The central empirical difficulty is avoiding circular evaluation. If a scorer reads an agent-specific intermediate field, removing that agent also removes the scorer’s expected input. Likewise, a multi-call pipeline and a one-call baseline are not comparable merely because they use the same backbone. We therefore require a condition-invariant view of the final learner-visible material and match Full and Monolith primarily by total input-plus-output tokens, while also reporting calls, latency, and cost. Because LLM judges exhibit systematic biases \cite{chen2024judge}, blinded human assessment is the primary evidence and automated judging is supplementary.

### Paragraph 4: Proposed study

We study a native-culture-aware pipeline with five functional stages: learner profiling, native-language cultural explanation, cross-cultural comparison, instructional content generation, and quality control. The comparison stage is isolated through a NoA3 ablation. A staged admission gate is evaluated as a reliability and cache-risk mechanism: its purpose is to prevent weak material from reaching learners or persistent storage, not to claim that the gate improves the average quality of already generated text.

### Paragraph 5: Research questions

- **RQ1:** Under matched backbone, knowledge input, and generation-token budget, how does the role-decomposed Full system compare with a Monolith on cross-cultural Chinese instructional content?
- **RQ2:** Does the explicit A3 comparison role provide independently measurable value when Full and NoA3 are evaluated through the same canonical final-material schema?
- **RQ3:** How does the staged gate trade off weak-content rejection, qualified-content rejection, weak-content admission, cache admission, regeneration, latency, and cost?

### Paragraph 6: Contributions (provisional wording)

This work makes three bounded contributions. First, it specifies an auditable, native-culture-aware workflow for Chinese instructional content generation. Second, it defines a controlled evaluation of role decomposition and the A3 comparison role using a budget-matched Monolith, role ablations, canonical learner-visible outputs, and blinded human review. Third, it frames staged quality control as an admission and cache-risk trade-off and specifies the corresponding human-grounded error and cost measures. The second and third contributions remain empirical protocols until the planned evidence is produced.

## 4. Related Work — Initial Draft

### 4.1 Educational LLM Agents and Role Decomposition

Educational LLM agents have been surveyed across pedagogical tasks, enabling technologies, and deployment challenges, including systems that use multiple communicating agents \cite{chu2025agents}. MultiTutor provides a closer architectural neighbor: specialized agents collaborate to produce explanations, visualizations, resources, practice problems, and interactive simulations, and the authors report automatic-metric and case-study comparisons with baseline models \cite{sun2025multitutor}. These studies establish that specialization and coordination are already present in educational AI. They do not, however, show that role decomposition is inherently better than a monolithic generator under matched knowledge and token budgets. Our RQ1 is therefore a controlled comparison within one cross-cultural Chinese-learning task, not a claim of architectural priority or universal multi-agent superiority.

### 4.2 L2 Pragmatics, Chinese Learning, and Cultural Adaptation

Cross-cultural pragmatic failure includes pragmalinguistic and sociopragmatic dimensions \cite{thomas1983}. This distinction motivates evaluating whether generated materials explain not only linguistic forms but also context-dependent social interpretations, while avoiding prescriptive cultural rules. Generative AI offers opportunities for language tutoring and material creation, yet concerns remain about pragmatic authenticity, lack of lived social experience, and English-dominant or Western training data \cite{godwinjones2024}. ChatGPT has also been examined as a conversational agent for Spanish-speaking learners of Chinese, with reported potential benefits that should not be generalized beyond that setting \cite{wang2024chatgpt}.

In NLP, intralingual cultural adaptation has been defined as a generation task with an explicit evaluation framework \cite{singh2024culture}, while culturally aware conversation evaluation has incorporated situational, relational, and cultural context and culturally diverse annotators \cite{havaldar2025culture}. These precedents rule out claims that cultural adaptation itself is new. Our narrower focus is to expose native-cultural background as a coarse-grained conditioning variable, make the comparison stage auditable, and test its marginal value using final outputs rather than an agent-specific field. Native-cultural background is not treated as an individual’s fixed cultural identity.

### 4.3 Structured-Knowledge-Conditioned Educational Generation

Graph-based retrieval and generation cover graph indexing, graph-guided retrieval, and graph-enhanced generation, including query-focused summarization over graph-derived community summaries \cite{edge2024graphrag,peng2024graphrag}. Educational material has also been represented as knowledge graphs and integrated with language models \cite{canal2024kg}. Standardize demonstrates a related form of control by extracting knowledge artifacts from expert standards such as CEFR and Common Core to guide educational content generation \cite{imperial2024standardize}. In our system, structured knowledge is a possible conditioning source and an exploratory ablation factor. We use **KG-grounded** or **structured-knowledge-conditioned generation** and do not claim a complete graph-retrieval-and-generation pipeline or a validated KG effect.

### 4.4 Evaluation and Admission Gates

LLM-as-a-judge evaluation is vulnerable to judgment biases and should not be treated as an unquestioned oracle \cite{chen2024judge}. We consequently prioritize two-reviewer blinded assessment and use an independent automated judge, if run, only as supplementary evidence. Programmable runtime rails can constrain topics, dialogue paths, and language style \cite{rebedea2023nemo}; in education, CodeGuard evaluates prompt-safety classification together with preservation of legitimate CS-education performance \cite{raihan2026codeguard}. Our RQ3 is adjacent but distinct: it evaluates generated instructional-content admission and cache contamination risk. We measure rejection and admission against independent human labels, alongside regeneration and cost, rather than claiming novelty for guardrails or an increase in average generated quality.

### 4.5 Positioning Summary

Prior work has studied educational LLM agents, cultural adaptation, structured-knowledge-conditioned generation, and programmable guardrails, but these strands are commonly evaluated under different tasks and assumptions. We study native-culture-aware cross-cultural instructional content generation for Chinese language learning, focusing on whether role decomposition remains beneficial under a budget-matched monolithic baseline, whether an explicit cross-cultural comparison role has independently measurable value, and whether staged admission gates reduce low-quality delivery and cache contamination at an acceptable cost.

## 5. Method — Section Structure and Draftable Content

### 5.1 Task Definition

Input consists of a learning case with a Chinese cultural or pragmatic knowledge point, domain/scene, pragmatic intent, target HSK level, learner native-cultural background, and a coarse anxiety band. Output is a learner-visible material containing a cultural explanation, cross-cultural comparison, language points, and exercises. The system does not infer an individual’s identity from the native-culture label; the label is an explicit, coarse conditioning variable supplied by the task.

### 5.2 Role-Decomposed Pipeline

Describe the five functional stages and their data flow:

- **A1 Learner Profiler:** derives adaptation variables, including a deterministic cultural-anxiety estimate; no longitudinal learning-effect claim.
- **A2 Mother-Tongue Explainer:** produces a native-language explanation intended to provide an accessible cultural basis.
- **A3 Cultural Comparator:** produces a structured account of similarities and differences while being checked for overt bias patterns.
- **A4 Content Generator:** combines task context and upstream outputs into the final explanation, comparison, language points, and exercises.
- **A5 Quality Controller:** reviews generated material for admission/rejection and cache eligibility.

A2 and A3 can operate in parallel before A4; A5 follows content generation. Include one compact pipeline figure only after verifying the frozen implementation snapshot. Describe model/provider/version and prompt details from the future immutable manifest, not from memory or mutable environment configuration.

### 5.3 Conditions and Ablations

- **Full:** all functional stages enabled.
- **Budget-matched Monolith:** one monolithic generation strategy with the same base case, learner context, available knowledge, backbone/version, and sampling settings; primary budget matching uses total prompt plus completion tokens summed over all generation calls.
- **NoA3:** removes the explicit comparison role while retaining the remaining frozen pipeline; used for RQ2.
- **NoA2A3:** diagnostic reference only unless included in a frozen analysis plan.
- **Gate / NoGate:** applies or bypasses the saved-output admission decision; gate evaluation must not regenerate different content across these two conditions.

The exact prompt, context allocation, retry behavior, timeouts, and token tolerances must be copied from the approved run manifest. Recommended smoke tolerances are at most 10% total-token difference per Full–Monolith pair and 5% between condition means; failure of this gate prevents an RQ1 superiority claim.

### 5.4 Structured Knowledge and Caching

Describe the structured knowledge source, lookup behavior, traceability, and fallback only after these are captured in a frozen source archive or run trace. The main paper may state that structured knowledge conditions generation if verified. Any KG/NoKG effect remains exploratory and belongs in an appendix unless a fair paired experiment is approved and completed. Do not use “GraphRAG” to describe the present system.

### 5.5 Canonical Evaluation View

All conditions are converted to schema version 1.0 using only the final `generated_content` or `learning_content`. The canonical material contains explanation, cross-cultural comparison, language points, and exercises. Agent-specific intermediate fields, A5 rationales, condition names, model metadata, and costs are excluded from blinded items. Missing or malformed fields remain in the intention-to-treat set with warnings; no LLM repairs, summaries, translations, or condition-specific truncation are permitted.

### 5.6 Admission Gate

Define pass/reject and cache-admission logic from the frozen implementation/manifest. The evaluation unit is a saved generation, and the independent reference is the aggregated human `qualified` label. A false rejection is human-qualified material rejected by A5; a false admission is human-unqualified material passed by A5. Reviewer disagreements remain `uncertain` and are handled through prespecified bounds rather than post-hoc adjudication.

## 6. Experiments — Frozen Protocol Draft

### 6.1 Research Questions and Comparisons

| RQ | Primary comparison | Primary evidence | Required validity gate |
|---|---|---|---|
| RQ1 | Full vs budget-matched Monolith | Paired human overall-quality difference and overall preference | Canonical schema; same cases/model/knowledge/settings; token fairness passes |
| RQ2 | Full vs NoA3 | Paired human cultural-theoretical correctness and comparison quality | Final canonical materials only; no A3-specific field; blinded conditions |
| RQ3 | Gate vs NoGate on saved outputs | Human-label confusion matrix and risk/cost measures | Independent human labels; identical generations across gate conditions |

### 6.2 Staged Execution and Stopping Rules

Execution proceeds only after local static checks: schema validation, deterministic canonical conversion, preservation of all existing records, blind-pack leakage checks, telemetry fixtures, secret-exclusion checks, and a frozen case-list hash. A paid smoke uses five base cases only after separate approval. Pilot generation uses 10–15 cases only if smoke artifacts are complete, generation failure is at most 10%, and token fairness, traceability, leakage, mapping, and cost gates pass. Formal generation requires a further approval after pilot review. These are planned stages, not completed experiments.

The project-wide new model/API limit is 500 CNY; 350 CNY triggers a stop/reduction review. Stage 1 is capped at 250 CNY, allocated across smoke (20), pilot generation (60), pilot Judge (20), formal generation (100), formal Judge (40), and failure reserve (10). Approval of a ceiling does not authorize a call. This P3 task makes no external calls and incurs 0 CNY.

### 6.3 Cases and Human Review

The recommended shared pilot contains six base cases and three conditions (Full, Monolith, NoA3), yielding 18 blinded materials evaluated by both reviewers. Cases cover at least three domains; HSK1, HSK3, and HSK5 contribute two cases each; at least four native-cultural groups are represented. Selection is frozen before condition results are inspected and is not based on prior CIEval or A5 scores.

Two qualified reviewers independently assess the same items in different randomized orders after two non-study calibration items. Each rates cultural-theoretical correctness, comparison quality, pedagogical appropriateness, HSK fit, and overall quality on anchored 1–5 scales, supplies evidence, and directly labels the material `qualified=yes/no`. Conditions, model details, A5 decisions, automatic scores, costs, and agent labels remain hidden until ratings are frozen.

### 6.4 Label Aggregation and Agreement

Two `yes` labels yield `qualified`; two `no` labels yield `unqualified`; disagreement yields `uncertain`. The main binary analysis excludes uncertain cases and reports their count and proportion. Sensitivity bounds assign uncertain cases to each class as prespecified for qualified rate, false admission, and false rejection. Report raw binary agreement and Cohen’s kappa. For ordinal scores, preselect weighted kappa or ICC before analysis and retain both reviewers’ scores.

### 6.5 Outcomes and Statistical Analysis

For RQ1, report the paired difference in human overall quality and overall preference, followed by the four component dimensions. For RQ2, cultural-theoretical correctness and cross-cultural comparison quality are primary. For RQ3, report the confusion matrix, false-rejection and false-admission rates with Wilson 95% intervals, cache-admission rate, regenerations, total generation tokens, latency, CNY, and cost per qualified admitted item.

Paired continuous/ordinal comparisons report paired differences, bootstrap 95% confidence intervals, Wilcoxon signed-rank tests, and a prespecified paired effect size. Secondary dimensions use Holm correction with both raw and adjusted p-values. Small pilot samples are labeled as such; non-significance is not interpreted as equivalence. Intention-to-treat is primary, with complete-case results only as sensitivity analysis.

### 6.6 Reproducibility and Failure Handling

Each immutable run stores a manifest, per-call telemetry, raw outputs, canonical outputs, failures, blind materials, reviewer orders, and SHA-256 checksums. It records the code/source archive, dataset and case-list hashes, model and endpoint identifiers, sampling and retry settings, prompt hashes, token usage, latency, and estimated or billed cost. Failures remain in the analysis denominator; retries receive new identifiers linked to the original call.

### 6.7 Contamination Exclusion

The existing RQ1 CIEval Dimension A compared asymmetric fields: Full exposed an A3 output while Monolith’s substantive comparison was located elsewhere. The resulting Dimension A and aggregate comparisons are designated contaminated and will not appear in the main results table. The existing Full–NoA3 comparison shares the same construct risk and cannot serve as independent evidence for RQ2. These assets may be discussed only as an audit lesson or mechanism diagnostic, clearly labeled as invalid for confirmatory claims.

## 7. Results — Placeholders Only

### 7.1 RQ1: Full vs Budget-Matched Monolith

**Table 1. Human evaluation and budget fairness for RQ1.** Populate only from frozen, schema-valid outputs and blinded reviews.

| Measure | Full | Monolith | Paired estimate [95% CI] | Test/effect size | Status |
|---|---:|---:|---:|---:|---|
| Human overall quality | — | — | — | — | Pending |
| Overall preference | — | — | — | — | Pending |
| Cultural-theoretical correctness | — | — | — | — | Pending |
| Pedagogical appropriateness | — | — | — | — | Pending |
| HSK fit | — | — | — | — | Pending |
| Total generation tokens | — | — | — | — | Pending fairness gate |
| Calls / latency / CNY | — | — | — | — | Pending |

Required prose pattern: “Under [verified fairness conditions], Full was [estimate and uncertainty] relative to Monolith on [registered outcome] in this sample.” If fairness fails, report the failure and omit an architectural superiority conclusion.

### 7.2 RQ2: Independent Evaluation of A3

**Table 2. Full vs NoA3 on canonical final materials.**

| Human measure | Full | NoA3 | Paired estimate [95% CI] | Adjusted inference | Status |
|---|---:|---:|---:|---:|---|
| Cultural-theoretical correctness (primary) | — | — | — | — | Pending |
| Cross-cultural comparison quality (primary) | — | — | — | — | Pending |
| Pedagogical appropriateness | — | — | — | — | Pending |
| Overall quality | — | — | — | — | Pending |

No existing CIEval A or aggregate score may fill this table. A supplementary Judge column may be added only if its rubric is condition-invariant, blind, and reported as secondary to humans.

### 7.3 RQ3: Admission and Cache Risk

**Table 3. Gate outcomes against aggregated human labels.**

| Human label × Gate decision | Gate pass | Gate reject |
|---|---:|---:|
| Qualified | — | — |
| Unqualified | — | — |

| Risk/cost measure | Estimate [95% CI where applicable] | Uncertain-label bounds | Status |
|---|---:|---:|---|
| False-rejection rate | — | — | Pending |
| False-admission rate | — | — | Pending |
| Cache-admission rate | — | — | Pending |
| Regenerations per qualified admission | — | n/a | Pending |
| Tokens / latency / CNY per qualified admission | — | n/a | Pending |

Existing condition rejection and cache-admission counts may be retained in an audit appendix as descriptive statistics, but they cannot be renamed false-rejection or false-admission rates without human truth labels.

### 7.4 Reviewer Agreement and Robustness

**Table 4. Agreement, missingness, failures, and sensitivity checks.**

| Item | Estimate | Status |
|---|---:|---|
| Binary raw agreement / Cohen’s kappa | — | Pending |
| Ordinal agreement (prespecified weighted kappa or ICC) | — | Pending choice and data |
| Uncertain labels, n (%) | — | Pending |
| Generation/schema failures by condition | — | Pending |
| Intention-to-treat vs complete-case sensitivity | — | Pending |
| Raw vs Holm-adjusted secondary tests | — | Pending |

### 7.5 Exploratory Appendix Only

If retained, KG/NoKG findings must be labeled exploratory, paired only under comparable settings, and accompanied by missing provenance and traceability caveats. They do not support a main-paper claim that structured knowledge improves quality.

## 8. Limitations — Required Checklist and Draft Points

- [ ] **Small and selective evaluation:** The planned two-reviewer, 15–20-item design is suitable for a focused pilot but cannot establish population-wide effects.
- [ ] **Coarse cultural conditioning:** Native-cultural group labels are task conditions, not complete or stable representations of individual identity; within-group variation and multilingual identities are under-modeled.
- [ ] **Normativity and stereotyping:** Cross-cultural comparisons may reify tendencies, encode hierarchy, or apply theory mechanically. Human ratings reduce but do not eliminate this risk.
- [ ] **No learning-outcome claim:** The study evaluates generated materials, not learner achievement, retention, anxiety reduction, or longitudinal transfer.
- [ ] **Model/provider dependence:** Findings are bounded to the verified backbone/version, prompts, knowledge context, and budget regime used in the registered runs.
- [ ] **Budget matching is imperfect control:** Matching total tokens does not equalize information flow, sequential computation, latency, or monetary cost; all must be reported separately.
- [ ] **Human evaluation uncertainty:** Two reviewers may disagree; qualifications and calibration do not make human judgments bias-free. Disagreements remain uncertain rather than being forced into consensus.
- [ ] **Automated-evaluation limitations:** Any LLM Judge is supplementary. Existing CIEval A and aggregate comparisons are contaminated and excluded from confirmatory results.
- [ ] **Gate dependence on human labels:** False admission/rejection depend on the operational definition of `qualified` and on the small labeled sample.
- [ ] **Structured-knowledge scope:** KG use is supporting/exploratory; the study does not validate a complete graph retrieval pipeline or a causal KG benefit.
- [ ] **System traceability:** Claims about model versions, prompts, knowledge access, retries, and costs require a frozen manifest/source snapshot; undocumented historical runs are not treated as confirmatory.

## 9. Ethics and Responsible Research Checklist

- [ ] Obtain informed participation/consent documentation and conflict-of-interest disclosure from reviewers.
- [ ] Store reviewer identity mappings separately; publish only anonymous aggregate background information.
- [ ] Collect no unrelated personal data; freeze and hash submitted ratings.
- [ ] Tell reviewers that materials may contain factual errors, stereotypes, or inappropriate comparisons and provide a reporting route.
- [ ] Ensure cultural labels are self-contained task metadata and are not used to infer sensitive attributes of real individuals.
- [ ] Audit outputs for stereotyping, cultural hierarchy, homogenization, and prescriptive pragmatics; report unresolved failure modes.
- [ ] Describe model/provider data handling only from verified policies and manifests; do not place personal learner data in external prompts.
- [ ] Preserve failed and harmful outputs for audit under access controls rather than selectively deleting them from analysis.
- [ ] Disclose model/API usage, human contribution, annotation compensation if any, and generation/evaluation separation.
- [ ] Avoid deployment claims: the evaluated system produces candidate teaching materials and does not replace qualified teachers or cultural experts.

## 10. Conclusion — Placeholder

One short paragraph should answer only the RQs supported by the final evidence. It should restate the controlled setting, report the direction and uncertainty of the registered human outcomes, and summarize the gate’s observed risk–cost trade-off. If any validity gate fails, state that the corresponding question remains unresolved. Do not introduce new results or broader cultural generalizations.

## 11. Eight-Page Main-Text Budget

Working budget includes Abstract, Limitations, Ethics, and Conclusion. References and any venue-required supplementary sections should be checked against the final COLING/ARR template before typesetting.

| Section | Pages | Content control |
|---|---:|---|
| Abstract | 0.30 | Problem, method, protocol, evidence-bounded findings |
| 1 Introduction | 0.85 | Six-paragraph argument chain and three RQs |
| 2 Related Work | 0.90 | Four compact clusters plus positioning |
| 3 Method | 2.00 | Task, pipeline, conditions, canonical view, gate; one compact figure |
| 4 Experiments | 1.65 | Fairness, staged protocol, human review, statistics, reproducibility |
| 5 Results | 1.55 | Three RQ tables plus agreement/robustness; no exploratory KG table in main text |
| 6 Limitations | 0.35 | Highest-risk boundaries only; expanded checklist in appendix if allowed |
| 7 Ethics | 0.20 | Participants, culture labels, data handling, deployment boundary |
| 8 Conclusion | 0.20 | Evidence-calibrated answers to supported RQs |
| **Total** | **8.00** | Main text |

Space-protection rules:

- Prefer one pipeline figure and three compact main results tables; merge agreement into a result table if needed.
- Put prompt text, schema examples, complete rubrics, full manifest fields, secondary dimensions, failure examples, and exploratory KG results in appendices/supplementary material.
- Do not cut fairness, human-review design, contamination disclosure, Limitations, or Ethics to make room for platform description.
- Front-end features, BKT, review scheduling, and system screenshots are outside the main story.

## 12. Four-Page Short-Paper Cut Plan for the 15 September Gate

**Trigger:** if any long-paper gate fails, especially a fair Monolith pilot, independent A3 evidence, runnable RQ3 risk measures, budget control, complete skeleton, or P4 defensibility.

**Short-paper scope:** retain RQ1 and RQ2 only. Remove RQ3 as a research question; mention admission gates briefly as system context or future work. KG, BKT, the full platform, cache-cost engineering, and NoA2A3 move to supplementary material or are omitted.

| Section | Pages | Short-version action |
|---|---:|---|
| Abstract | 0.25 | RQ1–RQ2 only; one sentence on canonical/blind evaluation |
| 1 Introduction | 0.55 | Compress motivation, circular-evaluation risk, two RQs, two contributions |
| 2 Related Work | 0.45 | Merge agents + cultural adaptation; one sentence on Judge bias; omit guardrail subsection |
| 3 Method | 0.90 | Task, Full/Monolith/NoA3, canonical view; one half-page figure at most |
| 4 Experiments | 0.75 | Token fairness, 18-item shared blind review, paired analysis |
| 5 Results | 0.80 | One combined RQ1/RQ2 table plus fairness/agreement row |
| 6 Limitations | 0.15 | Small sample, coarse cultures, no learning outcomes, model dependence |
| 7 Ethics | 0.08 | Reviewer privacy and stereotyping risk |
| 8 Conclusion | 0.07 | One bounded take-away |
| **Total** | **4.00** | Main text |

Short-version deletion order:

1. Delete RQ3 experiment and result tables from the main text.
2. Delete structured-knowledge subsection except one factual sentence if needed to understand inputs.
3. Collapse reproducibility details into a manifest statement and supplementary pointer.
4. Retain the contaminated-result exclusion in one explicit sentence.
5. Retain human-review primacy, canonical output mapping, and token fairness; without these, RQ1/RQ2 are not defensible.

## 13. Evidence-to-Draft Completion Gates

| Draft element | Required artifact before prose can be finalized |
|---|---|
| Model/system description | Frozen source archive or commit plus run manifest |
| RQ1 claim | Fairness-passing Full/Monolith run and frozen human ratings |
| RQ2 claim | Canonical Full/NoA3 materials and independent human ratings |
| RQ3 error rates | Frozen A5 decisions joined to aggregated human labels |
| Statistical language | Reproducible analysis output with uncertainty and correction |
| Abstract/Conclusion numbers | Values copied from registered result tables only |
| KG statement beyond method context | Approved fair paired evidence; otherwise exploratory appendix only |

