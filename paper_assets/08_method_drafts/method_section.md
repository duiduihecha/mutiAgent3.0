# Method: A Multi-Agent Framework with Guardrail-Gated Generation for Cross-Cultural Chinese as a Second Language Instruction

## 1. System Overview

We propose a **multi-agent collaborative framework** for Teaching Chinese as a Second Language (TCSL) that integrates **learner modeling**, **knowledge-enhanced generation**, and a **multi-tier guardrail mechanism** to produce culturally grounded, level-appropriate instructional content. The system employs a six-layer architecture: a frontend interface for learner profile acquisition, an API gateway for request routing, an agent orchestration layer supporting both hand-crafted coordination and LangGraph-based directed acyclic graph (DAG) execution, five specialized pedagogical agents, a dual-database persistence layer (PostgreSQL for structured records and Neo4j for semantic knowledge graphs), and a heterogeneous model layer routing generation and high-stakes verification through DeepSeek (deepseek-chat) via a unified `UnifiedLLMService`, with low-stakes guardrail checks delegated to qwen3.6-plus, and CIEval evaluation judges using qwen3.7-plus and glm-5 (all via the eflowcode gateway, heterogeneous to the generator).

The framework addresses a critical gap in existing NLP-for-education systems: the tendency of large language models to hallucinate culturally specific content while appearing superficially plausible. Our approach embeds verification directly into the generation pipeline through a **guardrail-gated architecture** where each agent's output is validated by an independent judge model before propagating downstream.

## 2. Learner Modeling and Adaptive Mechanism

The **learner modeling** subsystem maintains a seven-dimensional profile for each learner: native language, HSK proficiency level (1-9), learning style (visual/auditory/kinesthetic), learning motivation (tourism/study/work/interest/exam), cultural anxiety score (0-100), and a five-dimensional ability vector covering grammar, listening, speaking, cultural-pragmatic competence, and reading.

Cultural anxiety serves as the central dynamic variable in our **adaptive mechanism**. The score is updated exclusively through a delta function:

$$\Delta = (0.5 - r) \times 20$$

where $r$ denotes the correctness rate on the most recent assessment. This delta is applied atomically via the results API to maintain consistency between the database and the generation pipeline. The anxiety score drives three downstream adaptations:

1. **Native language ratio** in explanations: $0.75$ for high anxiety ($\geq 80$), $0.50$ for medium ($40 \leq x < 80$), $0.25$ for low ($< 40$). High-anxiety learners receive predominantly native-language explanations to reduce cognitive load, while low-anxiety learners experience greater Chinese language immersion.

2. **Exercise difficulty calibration**: declining accuracy trends trigger simplified exercises with fewer distractor items, while improving trends enable progressive difficulty escalation.

3. **Dimension-weighted exercise composition**: dimensions with accuracy below 40% over the most recent five assessment records receive elevated representation ($\geq 40\%$ of generated exercises), enabling targeted remediation of weak areas.

We additionally incorporate a **Bayesian Knowledge Tracing** (BKT) module that estimates mastery probability for individual knowledge points:

$$P(L_{n+1}) = P(L_n | \text{evidence})$$

using prior probability, guess probability ($P(G) = 0.25$), and slip probability ($P(S) = 0.10$). The five-dimensional ability vector is updated via exponentially weighted moving average with $\alpha = 0.7$ favoring recent observations:

$$\vec{v}_{new}[i] = \alpha \cdot s_{new}[i] + (1 - \alpha) \cdot \vec{v}_{old}[i]$$

A **short-term memory module** (`getRecentLearningTrend`) aggregates the most recent $N=5$ assessment records to extract weak dimensions (accuracy < 40%), accuracy trends (improving/stable/declining, based on comparing mean scores of the first and second halves of the window), repeated error patterns (occurring $\geq 2$ times), and repeated scene types.

## 3. Multi-Agent Collaboration

The core generation pipeline consists of five specialized agents arranged in a DAG topology, executed either through LangGraph's `StateGraph` or a hand-crafted `MultiAgentCoordinator`. Both execution paths share identical agent implementations and guardrail services.

### 3.1 Agent A1: LearnerProfiler

Agent A1 ingests the learner profile and recent assessment history, mapping anxiety scores to discrete levels and computing adaptive parameters. It is deliberately constrained to perform only numerical computation and database queries—it does not invoke any LLM. This design ensures that the anxiety score, which governs all downstream adaptations, has a single authoritative source (the database) and a single update path (the results API via `applyAnxietyDelta`).

### 3.2 Agent A2: MotherTongueExplainer

A2 generates culturally grounded explanations in the learner's native language. The output is a structured JSON object containing: `precise_definition` (2-4 sentences with embedded Chinese keywords), `scene_introduction` (a concrete usage scenario with dialogue example), `pragmatic_rules` (3 application rules), `examples` (annotated with pinyin and cultural notes), `taboo_warnings`, and `difficulty_notes`. The prompt enforces four categories of hard constraints: (1) all non-Chinese content must use the target native language exclusively; (2) absolute statements, negative stereotypes, cultural superiority judgments, and orientalist exoticization are prohibited; (3) all cultural facts must be verifiable; (4) content depth must align with HSK tier guidelines—concrete scenarios for HSK1-3, pragmatic boundaries for HSK4-6, and philosophical/historical context for HSK7-9.

### 3.3 Agent A3: CulturalComparator

A3 produces a cross-cultural comparison analysis grounded in either Hofstede's Cultural Dimensions theory or Hall's High/Low Context theory. The output is an XML document with four tagged sections: `framework_used`, `chinese_perspective` ($\leq 100$ characters on Chinese cultural behavior and underlying logic), `target_culture_perspective` ($\leq 100$ characters on equivalent or contrasting behavior in the target culture), and `learning_pitfall` (a single sentence identifying the most likely communication misunderstanding). The agent is instructed to maintain absolute objectivity—a constraint verified by the downstream guardrail rather than relied upon at generation time.

### 3.4 Fan-in and Fan-out

A2 and A3 execute in parallel after A1 completes. In the LangGraph implementation, this is achieved through the graph's natural fan-out mechanism: A1 has outgoing edges to both A2 and A3, and both converge at a `mergeA2A3` node before proceeding to A4. In the hand-crafted coordinator, `Promise.all()` achieves equivalent parallelism. The state object uses a replace reducer for most fields and a merge reducer for `guardrail_results` to accumulate verification outcomes from multiple nodes.

### 3.5 Agent A4: ContentGenerator

A4 synthesizes a complete lesson plan by integrating A2's cultural explanation, A3's cross-cultural comparison, and A1's L2 trend data. The output is a `GeneratedContent` object comprising: a `cultural_context` section (80-150 word explanation in the native language with adaptive `native_ratio`), 3-5 `language_points` (core Chinese expressions with translations), a `comparison` summary, and 3-5 `exercises` spanning at least two distinct types.

A4's prompt incorporates L2 trend data through an `<adaptive_guidance>` block that specifies weak dimensions for emphasis, accuracy trends for difficulty modulation, and repeated error patterns for targeted remediation. When accuracy is declining, the prompt instructs A4 to reduce difficulty by minimizing distractor items; when improving, progressive difficulty escalation is enabled. Weak dimensions (accuracy < 40%) receive elevated exercise allocation ($\geq 40\%$ of generated items).

### 3.6 Agent A5: QualityController

A5 performs a four-dimensional blind review of generated exercises with temperature zero for deterministic output: pinyin accuracy (adherence to standard Hanyu Pinyin scheme including tone mark placement), distractor quality (grammatical or semantic plausibility of incorrect options), HSK level compliance (vocabulary restricted to the target level with pinyin annotations for any exceeding words), and cultural-political safety (absence of politically sensitive, religiously contentious, or ethnically stereotypical content). Each dimension is scored on $[0.0, 1.0]$, and content is qualified only when all four scores exceed $0.85$.

## 4. Guardrail-Gated Verification

A distinctive feature of our framework is the **six-method guardrail layer** that intercepts agent outputs at critical pipeline junctures. Unlike post-hoc filtering approaches, our guardrails are embedded as **in-line verification nodes** within the DAG, enabling early rejection and preventing hallucinated content from propagating to downstream agents.

### 4.1 A2 Back-Translation Verification

The `verifyA2Translation` method employs a heterogeneous judge model (DeepSeek) to perform Natural Language Inference on back-translated content. The A2 output in the learner's native language is first back-translated to Chinese by qwen3.6-plus. The judge then evaluates a binary proposition: whether the back-translation accurately and objectively explains the original Chinese cultural concept. The judge is constrained to output only "True" or "False" with temperature zero, enforcing deterministic and auditable decisions. This cross-model, cross-lingual verification catches cases where A2 has fabricated or distorted cultural content in the target language.

### 4.2 A3 Objectivity Verification

The `verifyA3Comparison` method applies the same judge paradigm to A3's cross-cultural analyses. The judge evaluates three criteria: objectivity (grounding in academic frameworks rather than subjective assertion), absence of bias (no stereotyping, cultural superiority judgments, or orientalist exoticization), and factual basis (verifiable claims rather than fabrication). This replaces the previous keyword-based `detectBias` mechanism, which could only catch explicitly listed trigger words and was blind to more subtle forms of academic-sounding stereotyping.

### 4.3 A4 Solver Adversarial Verification

The `verifyA4SolverAdversarial` method implements a generator-solver adversarial protocol. For each exercise generated by A4, an independent DeepSeek instance attempts to solve it without access to the answer key. The comparison strategy varies by exercise type: multiple-choice requires exact letter match (A/B/C/D); true/false requires exact semantic match ("对"/"错"); fill-in-the-blank uses a three-tier fuzzy matching strategy—first exact match after punctuation normalization, then substring containment (catching cases where the solver provides a partial but correct answer), and finally Levenshtein distance with a 30% tolerance threshold for short answers.

### 4.4 A4 Grounding Verification

The `verifyA4Grounding` method cross-checks that generated exercises derive from the provided cultural explanation rather than being independently hallucinated. The judge evaluates whether exercise topics, scenarios, and cultural content can be traced back to A2's output. This addresses a failure mode where A4, despite receiving valid A2 and A3 inputs, generates exercises about unrelated cultural topics.

### 4.5 Hard Rule Filtering

The `preA5HardRulesFilter` method performs non-LLM validation at two levels. First, a pinyin format check uses a permissive character-class regular expression supporting all tone-marked vowels, tone numbers (1-5), spaces, and standard Chinese and English punctuation. Second, an HSK character-level whitelist check decomposes the HSK vocabulary list into individual Chinese characters and verifies that each character in the exercise stem appears in this decomposed set. This granular character-level matching avoids the false-positive problem where individual characters like "什" (from "什么") were incorrectly flagged as out-of-scope when the vocabulary list was checked at the word level.

### 4.6 A5 Joint Arbitration

The `verifyA5JointArbitration` method was originally designed as a dual-model review in which DeepSeek and a second heterogeneous model independently scored the exercises across the same four dimensions used by A5 (pinyin accuracy, distractor quality, HSK compliance, safety), with a divergence metric $\delta = \max_i |s_i^{DS} - s_i^{MM}|$ and a pass threshold of $\delta \leq 0.15$. In the current deployment the second model (MiniMax-M2.7) is no longer available, so arbitration degrades to a single-model DeepSeek verdict (see Limitations); the dual-model design remains documented as the intended configuration.

## 5. Knowledge-Enhanced Generation with Caching

The system employs a **cache-augmented generation** strategy where LLM outputs are persisted with quality metadata, enabling retrieval-based shortcut paths that reduce latency and computational cost while maintaining quality standards.

### 5.1 Composite Key Design

The cache uses a composite primary key of `(knowledge_point_id, hsk_level, scene_id)`. This three-dimensional key space ensures that cached content is retrieved only when all three contextual dimensions match: the semantic domain (knowledge point), the learner's proficiency level (HSK), and the situational context (scene type). This design prevents inappropriate cross-domain or cross-level content reuse.

### 5.2 Quality-Gated Admission

Cache entries carry a `status` field governed by a finite state machine (ACTIVE $\rightarrow$ DEGRADED $\rightarrow$ REJECTED). The confidence score for cache admission is computed via a weighted aggregation of all available guardrail verdicts:

$$C = \frac{\sum_i w_i \cdot c_i}{\sum_i w_i}$$

where $w_{\text{A5}} = 0.40$, $w_{\text{A2}} = 0.25$, $w_{\text{A3}} = 0.15$, $w_{\text{grounding}} = 0.10$, $w_{\text{hard\_rules}} = 0.05$, $w_{\text{solver}} = 0.05$. Guardrails that did not execute (e.g., in cache-hit shortcut paths where only A4 solver verification runs) are excluded from the weighted sum. A threshold of $C \geq 0.60$ governs cache admission.

The weighting scheme reflects the relative reliability and granularity of each guardrail: joint arbitration (weight 0.40) provides the only real-valued score from dual-model consensus; the two LLM judge methods (A2 and A3, weights 0.25 and 0.15) provide binary semantic-level verification; the grounding check (weight 0.10) ensures content fidelity; and the hard rules and solver check (weights 0.05 each) provide lightweight structural validation. Content failing to meet the threshold is marked REJECTED and excluded from the effective cache pool, preventing low-quality content from polluting future retrievals.

### 5.3 Lifecycle Management

User voting (`vote_cache` RPC) and periodic quality evaluation (`evaluate_cache_quality` RPC) provide ongoing quality monitoring. Entries accumulating sufficient downvotes are demoted from ACTIVE to DEGRADED status, and persistently low-quality entries may be further demoted to REJECTED. This feedback loop enables the cache pool to self-correct over time.

## 6. Implementation

The framework is implemented in TypeScript using Next.js 16 for the application layer, LangChain LangGraph (`StateGraph` with `Annotation.Root`) for agent orchestration, Drizzle ORM for database access, and direct fetch-based OpenAI-compatible API calls for LLM integration. The state graph defines 10 nodes with conditional branching (cache hit/miss) and parallel fan-out/fan-in (A2 $\parallel$ A3). Each node is wrapped with retry logic ($\leq 2$ retries with exponential backoff) and timeout protection (90s for generation nodes, 45s for verification nodes). All guardrail exceptions are caught and converted to safe-fallback verdicts, ensuring pipeline resilience—no single model failure can cause the overall system to crash.

The HSK 3.0 vocabulary whitelist is bundled as a static TypeScript module and decomposed to the character level at runtime for granular validation. Scene mapping is handled through a bidirectional lookup table connecting 12 scene types (daily, campus, food, travel, shopping, transport, workplace, medical, banking, housing, entertainment, emergency) to cultural knowledge point keywords, with fallback to `ilike` database queries when direct matching fails.

The prompt engineering strategy employs a consistent XML-tagged structure across all agents, with `<system_prompt>`, `<strict_constraints>`, `<tier_guidelines>`, and `<output_schema>` sections ensuring uniformity, and `<user_input>` sections isolating external data from instructional content to mitigate prompt injection risks.
