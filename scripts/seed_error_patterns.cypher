// ============================================================================
// seed_error_patterns.cypher
// 自适应偏误模式分类学图谱种子脚本
// ============================================================================
// 基于《面向国际中文教育智能代理的自适应偏误模式分类学与图谱构建研究》
//
// 学术框架：
//   - 表层策略分类 (TMT/Surface Strategy)：[M]遗漏 [R]冗余 [S]选用错误 [W]错序 [A]类推泛化
//   - 语言学分类 (LCC)：v动作动词 adv副词 n名词 asp时态助词 de结构助词 Aux能愿动词
//                        conj连词 p介词 vs状态动词 form格式
//   - 特殊句式标记：ba把 rang让 you有 bei被 shi是
//   - 偏误成因：NegativeTransfer负迁移 Overgeneralization泛化 Avoidance回避
//
// 节点标签：ErrorCategory / ErrorPattern / LinguisticFeature / Etiology / InterventionStrategy
// 关系：BELONGS_TO / HAS_FEATURE / CAUSED_BY / REMEDIATED_BY / FREQUENT_ERROR
//
// 用法：粘贴到 Neo4j Browser 或通过 Cypher Shell 执行
// ============================================================================


// ============================================================================
// PART 1: ErrorCategory — 四大偏误范畴
// ============================================================================

MERGE (ec1:ErrorCategory {id: 'ec_phonology'})
SET ec1.name = '语音与汉字偏误',
    ec1.name_en = 'Phonology & Orthography',
    ec1.description = '涵盖声调混淆、发音偏差、汉字部件错乱等底层感知与书写偏误',
    ec1.severity_weight = 0.7,
    ec1.updated_at = datetime();

MERGE (ec2:ErrorCategory {id: 'ec_lexicon'})
SET ec2.name = '词汇层面偏误',
    ec2.name_en = 'Lexical Errors',
    ec2.description = '涵盖离合词误用、名词复合结构错序、量词搭配不当等词汇句法接口偏误',
    ec2.severity_weight = 0.6,
    ec2.updated_at = datetime();

MERGE (ec3:ErrorCategory {id: 'ec_syntax'})
SET ec3.name = '句法规则偏误',
    ec3.name_en = 'Syntactic Errors',
    ec3.description = '涵盖把字句/给字句等特殊句型偏误、助词形态规则错用等句法结构偏误',
    ec3.severity_weight = 0.8,
    ec3.updated_at = datetime();

MERGE (ec4:ErrorCategory {id: 'ec_pragmatics'})
SET ec4.name = '语用与篇章偏误',
    ec4.name_en = 'Pragmatic & Discourse Errors',
    ec4.description = '涵盖元话语标记缺失、语体失当、逻辑连词偏误等高级交际与篇章连贯偏误',
    ec4.severity_weight = 0.5,
    ec4.updated_at = datetime();


// ============================================================================
// PART 2: Etiology — 三大偏误成因
// ============================================================================

MERGE (et1:Etiology {id: 'et_negative_transfer'})
SET et1.cause_type = 'NegativeTransfer',
    et1.name = '母语负迁移',
    et1.name_en = 'Negative L1 Transfer',
    et1.description = '学习者母语规则对目的语（汉语）的干扰，如非声调母语者对声调感知的先天弱势、SOV母语者对汉语SVO语序的错配',
    et1.cognitive_mechanism = '跨语言类型学特征干扰，母语语音/句法范畴向目的语的非适应性映射',
    et1.updated_at = datetime();

MERGE (et2:Etiology {id: 'et_overgeneralization'})
SET et2.cause_type = 'Overgeneralization',
    et2.name = '目的语规则泛化',
    et2.name_en = 'Target Language Overgeneralization',
    et2.description = '学习者将已掌握的有限汉语规则错误地过度推广至不适用的语境，如将通用量词"个"替代所有特定量词、将"了"泛化到所有过去事件',
    et2.cognitive_mechanism = '语内迁移(Intralingual Transfer)，规则适用边界感知模糊，缺乏对例外与限制条件的认知',
    et2.updated_at = datetime();

MERGE (et3:Etiology {id: 'et_avoidance'})
SET et3.cause_type = 'Avoidance',
    et3.name = '交际回避策略',
    et3.name_en = 'Communicative Avoidance',
    et3.description = '学习者为了规避困难而刻意回避使用复杂结构（如连词、把字句），导致语言产出呈现简单化与同质化倾向',
    et3.cognitive_mechanism = '交际焦虑驱动的策略性简化，害怕犯错导致的选择性沉默或句式降级',
    et3.updated_at = datetime();


// ============================================================================
// PART 3: LinguisticFeature — TMT+LCC 阶层化标记体系
// ============================================================================
// 格式: {tmt_code}_{lcc_tag} 如 M_v = 动作动词遗漏, S_asp = 时态助词选用错误
// 优先级: special_construction > misordering > selection > redundancy > missing

// --- 3a. TMT 表层策略标记 (独立) ---

MERGE (lf_tmt_m:LinguisticFeature {id: 'lf_TMT_M'})
SET lf_tmt_m.tmt_code = '[M]',
    lf_tmt_m.lcc_tag = '',
    lf_tmt_m.name = '遗漏 (Missing)',
    lf_tmt_m.description = '句法结构或词法形态中少用了必需的语法成分',
    lf_tmt_m.priority_level = 1,
    lf_tmt_m.updated_at = datetime();

MERGE (lf_tmt_r:LinguisticFeature {id: 'lf_TMT_R'})
SET lf_tmt_r.tmt_code = '[R]',
    lf_tmt_r.lcc_tag = '',
    lf_tmt_r.name = '冗余 (Redundancy)',
    lf_tmt_r.description = '在特定语境中添加了不必要的语言成分',
    lf_tmt_r.priority_level = 2,
    lf_tmt_r.updated_at = datetime();

MERGE (lf_tmt_s:LinguisticFeature {id: 'lf_TMT_S'})
SET lf_tmt_s.tmt_code = '[S]',
    lf_tmt_s.lcc_tag = '',
    lf_tmt_s.name = '选用错误 (Selection)',
    lf_tmt_s.description = '在特定语义或句法槽位中填入了功能、词性或语义不符的词汇',
    lf_tmt_s.priority_level = 3,
    lf_tmt_s.updated_at = datetime();

MERGE (lf_tmt_w:LinguisticFeature {id: 'lf_TMT_W'})
SET lf_tmt_w.tmt_code = '[W]',
    lf_tmt_w.lcc_tag = '',
    lf_tmt_w.name = '错序 (Misordering)',
    lf_tmt_w.description = '句子成分排列顺序违反了目标语的句法规则或类型学约束',
    lf_tmt_w.priority_level = 4,
    lf_tmt_w.updated_at = datetime();

MERGE (lf_tmt_a:LinguisticFeature {id: 'lf_TMT_A'})
SET lf_tmt_a.tmt_code = '[A]',
    lf_tmt_a.lcc_tag = '',
    lf_tmt_a.name = '类推泛化 (Analogy/Overgeneralization)',
    lf_tmt_a.description = '通过有限的已知规则去覆盖所有的语言现象，导致语法规则错配',
    lf_tmt_a.priority_level = 5,
    lf_tmt_a.updated_at = datetime();

// --- 3b. LCC 语言学类标记 (独立) ---

MERGE (lf_lcc_v:LinguisticFeature {id: 'lf_LCC_v'})
SET lf_lcc_v.tmt_code = '',
    lf_lcc_v.lcc_tag = 'v',
    lf_lcc_v.name = '动作动词 (Action Verb)',
    lf_lcc_v.description = '高频偏误词类(5445次)，涉及动词论元结构认知偏差及及物/不及物混淆',
    lf_lcc_v.priority_level = 10,
    lf_lcc_v.updated_at = datetime();

MERGE (lf_lcc_adv:LinguisticFeature {id: 'lf_LCC_adv'})
SET lf_lcc_adv.tmt_code = '',
    lf_lcc_adv.lcc_tag = 'adv',
    lf_lcc_adv.name = '副词 (Adverb)',
    lf_lcc_adv.description = '高频偏误词类(4133次)，副词遗漏或副词与否定词、时间词的语序错位',
    lf_lcc_adv.priority_level = 10,
    lf_lcc_adv.updated_at = datetime();

MERGE (lf_lcc_n:LinguisticFeature {id: 'lf_LCC_n'})
SET lf_lcc_n.tmt_code = '',
    lf_lcc_n.lcc_tag = 'n',
    lf_lcc_n.name = '名词 (Noun)',
    lf_lcc_n.description = '高频偏误词类(3001次)，名词选用错误，名词复合结构中的语义映射偏差',
    lf_lcc_n.priority_level = 10,
    lf_lcc_n.updated_at = datetime();

MERGE (lf_lcc_asp:LinguisticFeature {id: 'lf_LCC_asp'})
SET lf_lcc_asp.tmt_code = '',
    lf_lcc_asp.lcc_tag = 'asp',
    lf_lcc_asp.name = '时态助词 (Aspect Marker)',
    lf_lcc_asp.description = '高频偏误词类(2808次)，了、着、过的遗漏或冗余，体现汉语时体特征感知模糊',
    lf_lcc_asp.priority_level = 10,
    lf_lcc_asp.updated_at = datetime();

MERGE (lf_lcc_de:LinguisticFeature {id: 'lf_LCC_de'})
SET lf_lcc_de.tmt_code = '',
    lf_lcc_de.lcc_tag = 'de',
    lf_lcc_de.name = '结构助词 (Structural Particle)',
    lf_lcc_de.description = '高频偏误词类(2334次)，"的"的冗赘使用反映定语标记规则的过度泛化',
    lf_lcc_de.priority_level = 10,
    lf_lcc_de.updated_at = datetime();

MERGE (lf_lcc_aux:LinguisticFeature {id: 'lf_LCC_aux'})
SET lf_lcc_aux.tmt_code = '',
    lf_lcc_aux.lcc_tag = 'Aux',
    lf_lcc_aux.name = '能愿动词 (Modal Verb)',
    lf_lcc_aux.description = '高频偏误词类(2325次)，遗漏与冗余并存，影响句子情态与主观性表达',
    lf_lcc_aux.priority_level = 10,
    lf_lcc_aux.updated_at = datetime();

MERGE (lf_lcc_conj:LinguisticFeature {id: 'lf_LCC_conj'})
SET lf_lcc_conj.tmt_code = '',
    lf_lcc_conj.lcc_tag = 'conj',
    lf_lcc_conj.name = '连词 (Conjunction)',
    lf_lcc_conj.description = '高频偏误词类(1418次)，连词误用与篇章逻辑连接及母语连接机制负迁移相关',
    lf_lcc_conj.priority_level = 10,
    lf_lcc_conj.updated_at = datetime();

MERGE (lf_lcc_p:LinguisticFeature {id: 'lf_LCC_p'})
SET lf_lcc_p.tmt_code = '',
    lf_lcc_p.lcc_tag = 'p',
    lf_lcc_p.name = '介词 (Preposition)',
    lf_lcc_p.description = '高频偏误词类(1215次)，介词的遗漏或滥用，"给"等多功能词的混淆',
    lf_lcc_p.priority_level = 10,
    lf_lcc_p.updated_at = datetime();

MERGE (lf_lcc_vs:LinguisticFeature {id: 'lf_LCC_vs'})
SET lf_lcc_vs.tmt_code = '',
    lf_lcc_vs.lcc_tag = 'vs',
    lf_lcc_vs.name = '状态动词 (Stative Verb)',
    lf_lcc_vs.description = '偏误词类(1154次)，状态动词被误用为名词或修饰语时的形态错误',
    lf_lcc_vs.priority_level = 10,
    lf_lcc_vs.updated_at = datetime();

MERGE (lf_lcc_form:LinguisticFeature {id: 'lf_LCC_form'})
SET lf_lcc_form.tmt_code = '',
    lf_lcc_form.lcc_tag = 'form',
    lf_lcc_form.name = '格式/形式 (Form)',
    lf_lcc_form.description = '偏误词类(1020次)，涉及固定搭配或特定句型的结构性破损',
    lf_lcc_form.priority_level = 10,
    lf_lcc_form.updated_at = datetime();

// --- 3c. 特殊句式标记 (高优先级) ---

MERGE (lf_special_ba:LinguisticFeature {id: 'lf_SC_ba'})
SET lf_special_ba.tmt_code = 'ba',
    lf_special_ba.lcc_tag = '',
    lf_special_ba.name = '把字句 (Ba Construction)',
    lf_special_ba.description = '特殊句式标记，优先级最高。把字句的多用/少用/错用/错序时应优先标注此标记',
    lf_special_ba.priority_level = 99,
    lf_special_ba.updated_at = datetime();

MERGE (lf_special_gei:LinguisticFeature {id: 'lf_SC_gei'})
SET lf_special_gei.tmt_code = 'gei',
    lf_special_gei.lcc_tag = '',
    lf_special_gei.name = '给字句 (Gei Construction)',
    lf_special_gei.description = '特殊句式标记。给字句的动词/介词双重属性混淆及成分遗漏',
    lf_special_gei.priority_level = 99,
    lf_special_gei.updated_at = datetime();

MERGE (lf_special_bei:LinguisticFeature {id: 'lf_SC_bei'})
SET lf_special_bei.tmt_code = 'bei',
    lf_special_bei.lcc_tag = '',
    lf_special_bei.name = '被字句 (Bei Construction)',
    lf_special_bei.description = '特殊句式标记。被字句的施受关系混淆及语序偏误',
    lf_special_bei.priority_level = 99,
    lf_special_bei.updated_at = datetime();

MERGE (lf_special_shi:LinguisticFeature {id: 'lf_SC_shi'})
SET lf_special_shi.tmt_code = 'shi',
    lf_special_shi.lcc_tag = '',
    lf_special_shi.name = '是...的句 (Shi...De Construction)',
    lf_special_shi.description = '特殊句式标记。是...的强调句式的结构残缺或"的"字遗漏',
    lf_special_shi.priority_level = 99,
    lf_special_shi.updated_at = datetime();

// --- 3d. 高频组合标记 (TMT+LCC 交叉) ---

MERGE (lf_Sv:LinguisticFeature {id: 'lf_Sv'})
SET lf_Sv.tmt_code = '[S]',
    lf_Sv.lcc_tag = 'v',
    lf_Sv.name = '[Sv] 动作动词选用错误',
    lf_Sv.description = '最高频组合偏误(5445次)，动词论元结构的认知偏差，及物/不及物混淆',
    lf_Sv.priority_level = 30,
    lf_Sv.updated_at = datetime();

MERGE (lf_Madv:LinguisticFeature {id: 'lf_Madv'})
SET lf_Madv.tmt_code = '[M]',
    lf_Madv.lcc_tag = 'adv',
    lf_Madv.name = '[Madv] 副词遗漏',
    lf_Madv.description = '高频组合偏误(4133次)，副词与否定词、时间词的语序错位',
    lf_Madv.priority_level = 30,
    lf_Madv.updated_at = datetime();

MERGE (lf_Sn:LinguisticFeature {id: 'lf_Sn'})
SET lf_Sn.tmt_code = '[S]',
    lf_Sn.lcc_tag = 'n',
    lf_Sn.name = '[Sn] 名词选用错误',
    lf_Sn.description = '高频组合偏误(3001次)，名词复合结构中的语义映射偏差',
    lf_Sn.priority_level = 30,
    lf_Sn.updated_at = datetime();

MERGE (lf_Masp:LinguisticFeature {id: 'lf_Masp'})
SET lf_Masp.tmt_code = '[M]',
    lf_Masp.lcc_tag = 'asp',
    lf_Masp.name = '[Masp] 时态助词遗漏',
    lf_Masp.description = '了、着、过的遗漏(2808次)，学习者对汉语时体特征感知模糊',
    lf_Masp.priority_level = 30,
    lf_Masp.updated_at = datetime();

MERGE (lf_Rasp:LinguisticFeature {id: 'lf_Rasp'})
SET lf_Rasp.tmt_code = '[R]',
    lf_Rasp.lcc_tag = 'asp',
    lf_Rasp.name = '[Rasp] 时态助词冗余',
    lf_Rasp.description = '了、着、过的过度使用，如"很生气了"中多余的"了"',
    lf_Rasp.priority_level = 30,
    lf_Rasp.updated_at = datetime();

MERGE (lf_Rde:LinguisticFeature {id: 'lf_Rde'})
SET lf_Rde.tmt_code = '[R]',
    lf_Rde.lcc_tag = 'de',
    lf_Rde.name = '[Rde] 结构助词"的"冗余',
    lf_Rde.description = '"的"的冗赘使用(2334次)，定语标记规则过度泛化',
    lf_Rde.priority_level = 30,
    lf_Rde.updated_at = datetime();

MERGE (lf_Maux:LinguisticFeature {id: 'lf_Maux'})
SET lf_Maux.tmt_code = '[M]',
    lf_Maux.lcc_tag = 'Aux',
    lf_Maux.name = '[Maux] 能愿动词遗漏',
    lf_Maux.description = '能愿动词遗漏(2325次)，影响句子情态与主观性表达',
    lf_Maux.priority_level = 30,
    lf_Maux.updated_at = datetime();

MERGE (lf_Mba:LinguisticFeature {id: 'lf_Mba'})
SET lf_Mba.tmt_code = '[M]',
    lf_Mba.lcc_tag = 'ba',
    lf_Mba.name = '[Mba] 把字句遗漏',
    lf_Mba.description = '遗漏"把"字构成的处置式结构，如"我現在沒有時間寫下來所有要告訴你的東西"遗漏了"把"',
    lf_Mba.priority_level = 99,
    lf_Mba.updated_at = datetime();

MERGE (lf_Wba:LinguisticFeature {id: 'lf_Wba'})
SET lf_Wba.tmt_code = '[W]',
    lf_Wba.lcc_tag = 'ba',
    lf_Wba.name = '[Wba] 把字句语序错乱',
    lf_Wba.description = '时间词和否定词错置于"把"字之后，如"*你把作业明天交给我"应为"你明天把作业交给我"',
    lf_Wba.priority_level = 99,
    lf_Wba.updated_at = datetime();


// ============================================================================
// PART 4: InterventionStrategy — 10 种干预策略
// ============================================================================

MERGE (is1:InterventionStrategy {id: 'is_contrastive_drill'})
SET is1.action_type = 'Contrastive_Drill',
    is1.name = '对比听辨训练',
    is1.description = '针对声调混淆，通过最小对立体(minimal pair)听辨与发音对比，结合声学感知单元的实时反馈，强化学习者的声调范畴感知',
    is1.ui_component = 'AudioContrastPlayer',
    is1.difficulty_curve = 'linear',
    is1.updated_at = datetime();

MERGE (is2:InterventionStrategy {id: 'is_etymological_viz'})
SET is2.action_type = 'Etymological_Visualization',
    is2.name = '字源演变可视化与动态笔顺',
    is2.description = '针对汉字部件混淆，通过字源演变动画与拓扑异变向量编码，推送部件分解与动态笔顺书写练习',
    is2.ui_component = 'CharacterDecomposer',
    is2.difficulty_curve = 'stepped',
    is2.updated_at = datetime();

MERGE (is3:InterventionStrategy {id: 'is_syntactic_restructure'})
SET is3.action_type = 'Syntactic_Restructuring',
    is3.name = '句法重构题',
    is3.description = '针对离合词偏误，自动将"离合词+宾语"结构转换为介词前置（如"从大学毕业"）或插入语扩展（如"散了一个小时的步"）',
    is3.ui_component = 'SentenceRestructurer',
    is3.difficulty_curve = 'adaptive',
    is3.updated_at = datetime();

MERGE (is4:InterventionStrategy {id: 'is_cross_ling_compare'})
SET is4.action_type = 'Cross_Linguistic_Comparison',
    is4.name = '跨语言类型学对比提示',
    is4.description = '针对名词复合结构语序偏误，根据学习者L1类型学特征(SOV/SVO)动态展示修饰语-中心语位置对比',
    is4.ui_component = 'TypologyComparator',
    is4.difficulty_curve = 'adaptive',
    is4.updated_at = datetime();

MERGE (is5:InterventionStrategy {id: 'is_collocation_match'})
SET is5.action_type = 'Collocation_Matching',
    is5.name = '量词搭配匹配题',
    is5.description = '针对量词搭配不当，提供名词-量词配对拖拽练习，逐步从通用量词"个"过渡到特定量词',
    is5.ui_component = 'CollocationMatcher',
    is5.difficulty_curve = 'stepped',
    is5.updated_at = datetime();

MERGE (is6:InterventionStrategy {id: 'is_drag_reorder'})
SET is6.action_type = 'Component_Drag_Reorder',
    is6.name = '成分拖拽重组',
    is6.description = '针对把字句语序偏误，设计"成分拖拽重组"题型，强制学习者将否定词与时间词放置于正确的句法槽位',
    is6.ui_component = 'DragReorderExercise',
    is6.difficulty_curve = 'adaptive',
    is6.updated_at = datetime();

MERGE (is7:InterventionStrategy {id: 'is_gap_filling'})
SET is7.action_type = 'Gap_Filling_Drill',
    is7.name = '成分填空训练',
    is7.description = '针对给字句成分缺失，通过标记符号识别遗漏成分，设计针对性填空练习恢复完整句法结构',
    is7.ui_component = 'GapFiller',
    is7.difficulty_curve = 'linear',
    is7.updated_at = datetime();

MERGE (is8:InterventionStrategy {id: 'is_aspect_context'})
SET is8.action_type = 'Aspect_Marker_Context',
    is8.name = '体貌标记语境训练',
    is8.description = '针对助词偏误，在丰富语境中对比"了/着/过"与"的/地/得"的使用条件，强化体貌系统认知',
    is8.ui_component = 'AspectContextBuilder',
    is8.difficulty_curve = 'adaptive',
    is8.updated_at = datetime();

MERGE (is9:InterventionStrategy {id: 'is_register_substitution'})
SET is9.action_type = 'Register_Substitution_Drill',
    is9.name = '语体标记替换训练',
    is9.description = '针对元话语标记偏误，通过口语标记与书面语标记的对比替换（如"还有"→"其次"），强化语体适配性认知',
    is9.ui_component = 'RegisterSwitcher',
    is9.difficulty_curve = 'adaptive',
    is9.updated_at = datetime();

MERGE (is10:InterventionStrategy {id: 'is_connective_induction'})
SET is10.action_type = 'Connective_Induction',
    is10.name = '连词诱导生成',
    is10.description = '针对连词回避策略，通过在下一轮对话中"诱导"学习者使用复杂连词（如"虽然...但是..."），主动打破回避模式',
    is10.ui_component = 'ConnectivePrompter',
    is10.difficulty_curve = 'adaptive',
    is10.updated_at = datetime();


// ============================================================================
// PART 5: ErrorPattern — 10 个核心偏误模式节点
// ============================================================================

// --- 5.1 语音与汉字 ---

MERGE (ep1:ErrorPattern {id: 'phonological_tone_confusion'})
SET ep1.name = '拼音声调混淆与语音偏差',
    ep1.name_en = 'Phonological Tone Confusion',
    ep1.description = '学习者因母语缺乏声调系统导致音高轮廓扭曲与重音错位，属初级阶段严重且高频的错误',
    ep1.l1_impact_factor = 'non_tonal_L1:0.9, tonal_L1:0.3',
    ep1.frequency = 'high',
    ep1.severity = 'serious',
    ep1.hsk_stage = 'HSK1-3',
    ep1.updated_at = datetime();

MERGE (ep2:ErrorPattern {id: 'orthographic_character_structure'})
SET ep2.name = '汉字部件混淆与拓扑结构错误',
    ep2.name_en = 'Orthographic Character Structure Error',
    ep2.description = '增减笔画、部件混淆、结构比例失调及形近字误用，拼音文字背景学习者将汉字视为缺乏逻辑的图形组合',
    ep2.l1_impact_factor = 'alphabetic_L1:0.85, logographic_L1:0.2',
    ep2.frequency = 'high',
    ep2.severity = 'serious',
    ep2.hsk_stage = 'HSK1-4',
    ep2.updated_at = datetime();

// --- 5.2 词汇 ---

MERGE (ep3:ErrorPattern {id: 'lexical_separable_word_misuse'})
SET ep3.name = '离合词使用与结构偏误',
    ep3.name_en = 'Separable Word Misuse',
    ep3.description = '学习者将离合词（如"毕业""散步""帮忙"）视为不可分割的整体，直接在词后附加宾语，如"毕业大学"应为"从大学毕业"',
    ep3.l1_impact_factor = 'SVO_L1:0.7, SOV_L1:0.5',
    ep3.frequency = 'medium',
    ep3.severity = 'moderate',
    ep3.hsk_stage = 'HSK2-5',
    ep3.updated_at = datetime();

MERGE (ep4:ErrorPattern {id: 'lexical_noun_compound_order'})
SET ep4.name = '名词复合结构语序与机制偏差',
    ep4.name_en = 'Noun Compound Word Order Error',
    ep4.description = '修饰语与中心语位置映射错误，高度依赖学习者L1类型学特征（SOV语言vs SVO语言产生不同的负迁移模式）',
    ep4.l1_impact_factor = 'SOV_L1:0.8, SVO_L1:0.4',
    ep4.frequency = 'medium',
    ep4.severity = 'moderate',
    ep4.hsk_stage = 'HSK2-5',
    ep4.updated_at = datetime();

MERGE (ep5:ErrorPattern {id: 'lexical_quantifier_collocation'})
SET ep5.name = '量词与名词搭配不当',
    ep5.name_en = 'Quantifier-Noun Collocation Error',
    ep5.description = '学习者倾向于使用通用量词"个"替代特定形状/类属的量词，或在抽象名词前强行添加量词',
    ep5.l1_impact_factor = 'universal:0.8',
    ep5.frequency = 'high',
    ep5.severity = 'moderate',
    ep5.hsk_stage = 'HSK1-4',
    ep5.updated_at = datetime();

// --- 5.3 句法 ---

MERGE (ep6:ErrorPattern {id: 'grammar_special_construction_ba'})
SET ep6.name = '把字句句法角色与语用约束偏误',
    ep6.name_en = 'Ba-Construction Error',
    ep6.description = '涉及把字句独特的句法角色排列与语义语用约束，核心特点是"谓语动词的非光杆性"。子模式：过度泛化（将无处置义动词塞入把字句）、语序错乱（时间词/否定词错置）',
    ep6.l1_impact_factor = 'non_topic_prominent_L1:0.9, topic_prominent_L1:0.5',
    ep6.frequency = 'high',
    ep6.severity = 'serious',
    ep6.hsk_stage = 'HSK3-6',
    ep6.updated_at = datetime();

MERGE (ep7:ErrorPattern {id: 'grammar_special_construction_gei'})
SET ep7.name = '给字句介动词混淆与成分缺失',
    ep7.name_en = 'Gei-Construction Error',
    ep7.description = '"给"字作为动词（给予）与介词（引进动作对象）的双重属性混淆，常伴随"给"字本身或其后动作对象的遗漏',
    ep7.l1_impact_factor = 'universal:0.7',
    ep7.frequency = 'medium',
    ep7.severity = 'moderate',
    ep7.hsk_stage = 'HSK2-5',
    ep7.updated_at = datetime();

MERGE (ep8:ErrorPattern {id: 'grammar_particle_misuse'})
SET ep8.name = '助词形态规则偏误',
    ep8.name_en = 'Particle Misuse',
    ep8.description = '时态助词（了、着、过）和结构助词（的、地、得）的错用，体貌系统理解碎片化。动词后的"了"与句末"了"混淆，特定补语缺失',
    ep8.l1_impact_factor = 'non_aspect_L1:0.85, aspect_L1:0.4',
    ep8.frequency = 'high',
    ep8.severity = 'serious',
    ep8.hsk_stage = 'HSK1-5',
    ep8.updated_at = datetime();

// --- 5.4 语用与篇章 ---

MERGE (ep9:ErrorPattern {id: 'pragmatic_metadiscourse_imbalance'})
SET ep9.name = '元话语标记功能缺失与语体失当',
    ep9.name_en = 'Metadiscourse Marker Imbalance',
    ep9.description = '引导式元话语"总量不足、分布不均"。过度依赖"过渡标记"和"框架标记"，匮乏"回指标记"和"言据标记"。口语衔接标记与书面语标记混用',
    ep9.l1_impact_factor = 'universal:0.6',
    ep9.frequency = 'medium',
    ep9.severity = 'moderate',
    ep9.hsk_stage = 'HSK4-6',
    ep9.updated_at = datetime();

MERGE (ep10:ErrorPattern {id: 'discourse_connective_misuse'})
SET ep10.name = '逻辑连词偏误与适应性转移',
    ep10.name_en = 'Discourse Connective Misuse',
    ep10.description = '连词意义接近难以区分、缺乏练习、套用错误语法规则、以及因害怕犯错而回避使用复杂连词。四种原因均属语内迁移范畴',
    ep10.l1_impact_factor = 'universal:0.65',
    ep10.frequency = 'medium',
    ep10.severity = 'moderate',
    ep10.hsk_stage = 'HSK3-6',
    ep10.updated_at = datetime();


// ============================================================================
// PART 6: 关系网络 — 建立偏误模式的完整拓扑
// ============================================================================

// --- 6a. ErrorCategory ← ErrorPattern ---

MATCH (ec:ErrorCategory {id: 'ec_phonology'})
MATCH (ep:ErrorPattern) WHERE ep.id IN ['phonological_tone_confusion', 'orthographic_character_structure']
MERGE (ep)-[r:BELONGS_TO]->(ec)
SET r.updated_at = datetime();

MATCH (ec:ErrorCategory {id: 'ec_lexicon'})
MATCH (ep:ErrorPattern) WHERE ep.id IN ['lexical_separable_word_misuse', 'lexical_noun_compound_order', 'lexical_quantifier_collocation']
MERGE (ep)-[r:BELONGS_TO]->(ec)
SET r.updated_at = datetime();

MATCH (ec:ErrorCategory {id: 'ec_syntax'})
MATCH (ep:ErrorPattern) WHERE ep.id IN ['grammar_special_construction_ba', 'grammar_special_construction_gei', 'grammar_particle_misuse']
MERGE (ep)-[r:BELONGS_TO]->(ec)
SET r.updated_at = datetime();

MATCH (ec:ErrorCategory {id: 'ec_pragmatics'})
MATCH (ep:ErrorPattern) WHERE ep.id IN ['pragmatic_metadiscourse_imbalance', 'discourse_connective_misuse']
MERGE (ep)-[r:BELONGS_TO]->(ec)
SET r.updated_at = datetime();

// --- 6b. ErrorPattern → Etiology (偏误成因) ---

// 声调混淆 → 母语负迁移
MATCH (ep:ErrorPattern {id: 'phonological_tone_confusion'})
MATCH (et:Etiology {id: 'et_negative_transfer'})
MERGE (ep)-[r:CAUSED_BY {primary: true}]->(et)
SET r.updated_at = datetime();

// 汉字部件混淆 → 母语负迁移
MATCH (ep:ErrorPattern {id: 'orthographic_character_structure'})
MATCH (et:Etiology {id: 'et_negative_transfer'})
MERGE (ep)-[r:CAUSED_BY {primary: true}]->(et)
SET r.updated_at = datetime();

// 离合词偏误 → 泛化为主 + 负迁移为辅
MATCH (ep:ErrorPattern {id: 'lexical_separable_word_misuse'})
MATCH (et1:Etiology {id: 'et_overgeneralization'})
MATCH (et2:Etiology {id: 'et_negative_transfer'})
MERGE (ep)-[r1:CAUSED_BY {primary: true}]->(et1)
MERGE (ep)-[r2:CAUSED_BY {primary: false}]->(et2)
SET r1.updated_at = datetime(), r2.updated_at = datetime();

// 名词复合语序 → 母语负迁移
MATCH (ep:ErrorPattern {id: 'lexical_noun_compound_order'})
MATCH (et:Etiology {id: 'et_negative_transfer'})
MERGE (ep)-[r:CAUSED_BY {primary: true}]->(et)
SET r.updated_at = datetime();

// 量词搭配 → 泛化（"个"的过度泛化）
MATCH (ep:ErrorPattern {id: 'lexical_quantifier_collocation'})
MATCH (et:Etiology {id: 'et_overgeneralization'})
MERGE (ep)-[r:CAUSED_BY {primary: true}]->(et)
SET r.updated_at = datetime();

// 把字句 → 泛化为主 + 回避为辅
MATCH (ep:ErrorPattern {id: 'grammar_special_construction_ba'})
MATCH (et1:Etiology {id: 'et_overgeneralization'})
MATCH (et2:Etiology {id: 'et_avoidance'})
MERGE (ep)-[r1:CAUSED_BY {primary: true}]->(et1)
MERGE (ep)-[r2:CAUSED_BY {primary: false}]->(et2)
SET r1.updated_at = datetime(), r2.updated_at = datetime();

// 给字句 → 泛化 + 负迁移
MATCH (ep:ErrorPattern {id: 'grammar_special_construction_gei'})
MATCH (et1:Etiology {id: 'et_overgeneralization'})
MATCH (et2:Etiology {id: 'et_negative_transfer'})
MERGE (ep)-[r1:CAUSED_BY {primary: true}]->(et1)
MERGE (ep)-[r2:CAUSED_BY {primary: false}]->(et2)
SET r1.updated_at = datetime(), r2.updated_at = datetime();

// 助词偏误 → 泛化
MATCH (ep:ErrorPattern {id: 'grammar_particle_misuse'})
MATCH (et:Etiology {id: 'et_overgeneralization'})
MERGE (ep)-[r:CAUSED_BY {primary: true}]->(et)
SET r.updated_at = datetime();

// 元话语标记 → 回避为主 + 泛化为辅
MATCH (ep:ErrorPattern {id: 'pragmatic_metadiscourse_imbalance'})
MATCH (et1:Etiology {id: 'et_avoidance'})
MATCH (et2:Etiology {id: 'et_overgeneralization'})
MERGE (ep)-[r1:CAUSED_BY {primary: true}]->(et1)
MERGE (ep)-[r2:CAUSED_BY {primary: false}]->(et2)
SET r1.updated_at = datetime(), r2.updated_at = datetime();

// 连词偏误 → 回避（四种原因均属语内迁移）
MATCH (ep:ErrorPattern {id: 'discourse_connective_misuse'})
MATCH (et:Etiology {id: 'et_avoidance'})
MERGE (ep)-[r:CAUSED_BY {primary: true}]->(et)
SET r.updated_at = datetime();

// --- 6c. ErrorPattern → InterventionStrategy ---

MATCH (ep:ErrorPattern {id: 'phonological_tone_confusion'})
MATCH (is:InterventionStrategy {id: 'is_contrastive_drill'})
MERGE (ep)-[r:REMEDIATED_BY]->(is) SET r.updated_at = datetime();

MATCH (ep:ErrorPattern {id: 'orthographic_character_structure'})
MATCH (is:InterventionStrategy {id: 'is_etymological_viz'})
MERGE (ep)-[r:REMEDIATED_BY]->(is) SET r.updated_at = datetime();

MATCH (ep:ErrorPattern {id: 'lexical_separable_word_misuse'})
MATCH (is:InterventionStrategy {id: 'is_syntactic_restructure'})
MERGE (ep)-[r:REMEDIATED_BY]->(is) SET r.updated_at = datetime();

MATCH (ep:ErrorPattern {id: 'lexical_noun_compound_order'})
MATCH (is:InterventionStrategy {id: 'is_cross_ling_compare'})
MERGE (ep)-[r:REMEDIATED_BY]->(is) SET r.updated_at = datetime();

MATCH (ep:ErrorPattern {id: 'lexical_quantifier_collocation'})
MATCH (is:InterventionStrategy {id: 'is_collocation_match'})
MERGE (ep)-[r:REMEDIATED_BY]->(is) SET r.updated_at = datetime();

MATCH (ep:ErrorPattern {id: 'grammar_special_construction_ba'})
MATCH (is:InterventionStrategy {id: 'is_drag_reorder'})
MERGE (ep)-[r:REMEDIATED_BY]->(is) SET r.updated_at = datetime();

MATCH (ep:ErrorPattern {id: 'grammar_special_construction_gei'})
MATCH (is:InterventionStrategy {id: 'is_gap_filling'})
MERGE (ep)-[r:REMEDIATED_BY]->(is) SET r.updated_at = datetime();

MATCH (ep:ErrorPattern {id: 'grammar_particle_misuse'})
MATCH (is:InterventionStrategy {id: 'is_aspect_context'})
MERGE (ep)-[r:REMEDIATED_BY]->(is) SET r.updated_at = datetime();

MATCH (ep:ErrorPattern {id: 'pragmatic_metadiscourse_imbalance'})
MATCH (is:InterventionStrategy {id: 'is_register_substitution'})
MERGE (ep)-[r:REMEDIATED_BY]->(is) SET r.updated_at = datetime();

MATCH (ep:ErrorPattern {id: 'discourse_connective_misuse'})
MATCH (is:InterventionStrategy {id: 'is_connective_induction'})
MERGE (ep)-[r:REMEDIATED_BY]->(is) SET r.updated_at = datetime();

// --- 6d. ErrorPattern → LinguisticFeature (TMT+LCC 标记) ---

// 声调混淆 → 无特定TMT/LCC标记（属语音层面，非词汇句法标记体系覆盖）

// 汉字部件 → 无特定TMT/LCC标记（属正字法层面）

// 离合词 → [Sv]动作动词选用错误 + [Sform]格式选用错误
MATCH (ep:ErrorPattern {id: 'lexical_separable_word_misuse'})
MATCH (lf1:LinguisticFeature {id: 'lf_Sv'})
MATCH (lf2:LinguisticFeature {id: 'lf_TMT_S'})
MERGE (ep)-[r1:HAS_FEATURE]->(lf1) SET r1.updated_at = datetime();
MERGE (ep)-[r2:HAS_FEATURE]->(lf2) SET r2.updated_at = datetime();

// 名词复合语序 → [Sn]名词选用错误 + [W]错序
MATCH (ep:ErrorPattern {id: 'lexical_noun_compound_order'})
MATCH (lf1:LinguisticFeature {id: 'lf_Sn'})
MATCH (lf2:LinguisticFeature {id: 'lf_TMT_W'})
MERGE (ep)-[r1:HAS_FEATURE]->(lf1) SET r1.updated_at = datetime();
MERGE (ep)-[r2:HAS_FEATURE]->(lf2) SET r2.updated_at = datetime();

// 量词搭配 → [Sn]名词选用错误 + [A]类推泛化
MATCH (ep:ErrorPattern {id: 'lexical_quantifier_collocation'})
MATCH (lf1:LinguisticFeature {id: 'lf_Sn'})
MATCH (lf2:LinguisticFeature {id: 'lf_TMT_A'})
MERGE (ep)-[r1:HAS_FEATURE]->(lf1) SET r1.updated_at = datetime();
MERGE (ep)-[r2:HAS_FEATURE]->(lf2) SET r2.updated_at = datetime();

// 把字句 → [Mba]把字遗漏 + [Wba]把字语序错乱
MATCH (ep:ErrorPattern {id: 'grammar_special_construction_ba'})
MATCH (lf1:LinguisticFeature {id: 'lf_Mba'})
MATCH (lf2:LinguisticFeature {id: 'lf_Wba'})
MATCH (lf3:LinguisticFeature {id: 'lf_SC_ba'})
MATCH (lf4:LinguisticFeature {id: 'lf_TMT_A'})
MERGE (ep)-[r1:HAS_FEATURE]->(lf1) SET r1.updated_at = datetime();
MERGE (ep)-[r2:HAS_FEATURE]->(lf2) SET r2.updated_at = datetime();
MERGE (ep)-[r3:HAS_FEATURE]->(lf3) SET r3.updated_at = datetime();
MERGE (ep)-[r4:HAS_FEATURE]->(lf4) SET r4.updated_at = datetime();

// 给字句 → 特殊句式标记 + [Mp]介词遗漏
MATCH (ep:ErrorPattern {id: 'grammar_special_construction_gei'})
MATCH (lf1:LinguisticFeature {id: 'lf_SC_gei'})
MATCH (lf2:LinguisticFeature {id: 'lf_TMT_M'})
MERGE (ep)-[r1:HAS_FEATURE]->(lf1) SET r1.updated_at = datetime();
MERGE (ep)-[r2:HAS_FEATURE]->(lf2) SET r2.updated_at = datetime();

// 助词偏误 → [Masp]时态遗漏 + [Rasp]时态冗余 + [Rde]的冗余
MATCH (ep:ErrorPattern {id: 'grammar_particle_misuse'})
MATCH (lf1:LinguisticFeature {id: 'lf_Masp'})
MATCH (lf2:LinguisticFeature {id: 'lf_Rasp'})
MATCH (lf3:LinguisticFeature {id: 'lf_Rde'})
MERGE (ep)-[r1:HAS_FEATURE]->(lf1) SET r1.updated_at = datetime();
MERGE (ep)-[r2:HAS_FEATURE]->(lf2) SET r2.updated_at = datetime();
MERGE (ep)-[r3:HAS_FEATURE]->(lf3) SET r3.updated_at = datetime();

// 元话语标记 → [Sconj]连词选用 + 回避
MATCH (ep:ErrorPattern {id: 'pragmatic_metadiscourse_imbalance'})
MATCH (lf1:LinguisticFeature {id: 'lf_TMT_S'})
MATCH (lf2:LinguisticFeature {id: 'lf_TMT_A'})
MERGE (ep)-[r1:HAS_FEATURE]->(lf1) SET r1.updated_at = datetime();
MERGE (ep)-[r2:HAS_FEATURE]->(lf2) SET r2.updated_at = datetime();

// 连词偏误 → [Sconj]连词选用 + [Mconj]连词遗漏 + 回避
MATCH (ep:ErrorPattern {id: 'discourse_connective_misuse'})
MATCH (lf1:LinguisticFeature {id: 'lf_LCC_conj'})
MATCH (lf2:LinguisticFeature {id: 'lf_TMT_S'})
MERGE (ep)-[r1:HAS_FEATURE]->(lf1) SET r1.updated_at = datetime();
MERGE (ep)-[r2:HAS_FEATURE]->(lf2) SET r2.updated_at = datetime();


// ============================================================================
// PART 7: KnowledgePoint → ErrorPattern (FREQUENT_ERROR 映射)
// ============================================================================
// 基于 food + workplace 两个核心领域建立示例映射关系

// 所有 food KPs → 量词搭配偏误 (点餐涉及大量量词)
MATCH (ep:ErrorPattern {id: 'lexical_quantifier_collocation'})
MATCH (kp:KnowledgePoint) WHERE kp.id IN [
  'food_ordering_basic', 'food_treat_pay', 'food_manners_toast',
  'food_manners_seating', 'food_treat_refuse', 'food_manners_chopsticks'
]
MERGE (kp)-[r:FREQUENT_ERROR {relevance: 0.7}]->(ep)
SET r.updated_at = datetime();

// 所有 food KPs → 语用偏误 (餐饮场景高度依赖元话语和语用规则)
MATCH (ep:ErrorPattern {id: 'pragmatic_metadiscourse_imbalance'})
MATCH (kp:KnowledgePoint) WHERE kp.id IN [
  'food_ordering_basic', 'food_treat_pay', 'food_manners_toast',
  'food_manners_seating', 'food_treat_refuse', 'food_manners_chopsticks'
]
MERGE (kp)-[r:FREQUENT_ERROR {relevance: 0.8}]->(ep)
SET r.updated_at = datetime();

// 客气推拉 → 元话语标记 + 连词偏误
MATCH (ep:ErrorPattern {id: 'discourse_connective_misuse'})
MATCH (kp:KnowledgePoint {id: 'food_treat_refuse'})
MERGE (kp)-[r:FREQUENT_ERROR {relevance: 0.75}]->(ep)
SET r.updated_at = datetime();

// 所有 workplace KPs → 语用偏误 (职场场景涉及复杂的人际语用规则)
MATCH (ep:ErrorPattern {id: 'pragmatic_metadiscourse_imbalance'})
MATCH (kp:KnowledgePoint) WHERE kp.id IN [
  'workplace_hierarchy_title', 'workplace_email_pushback',
  'workplace_hierarchy_gift', 'workplace_meeting_speak',
  'workplace_wechat_work', 'workplace_hierarchy_face'
]
MERGE (kp)-[r:FREQUENT_ERROR {relevance: 0.85}]->(ep)
SET r.updated_at = datetime();

// 微信办公 → 语体失当 (口语vs书面语混用)
MATCH (ep:ErrorPattern {id: 'pragmatic_metadiscourse_imbalance'})
MATCH (kp:KnowledgePoint {id: 'workplace_wechat_work'})
MERGE (kp)-[r:FREQUENT_ERROR {relevance: 0.9}]->(ep)
SET r.updated_at = datetime();

// 面子保护/间接反馈 → 元话语标记 + 连词回避
MATCH (ep:ErrorPattern {id: 'discourse_connective_misuse'})
MATCH (kp:KnowledgePoint) WHERE kp.id IN ['workplace_hierarchy_face', 'workplace_email_pushback']
MERGE (kp)-[r:FREQUENT_ERROR {relevance: 0.8}]->(ep)
SET r.updated_at = datetime();

// 会议沉默 → 回避策略 (因害怕犯错选择沉默)
MATCH (ep:ErrorPattern {id: 'discourse_connective_misuse'})
MATCH (kp:KnowledgePoint {id: 'workplace_meeting_speak'})
MERGE (kp)-[r:FREQUENT_ERROR {relevance: 0.7}]->(ep)
SET r.updated_at = datetime();

// 把字句偏误 → 与涉及处置义的知识点相关
MATCH (ep:ErrorPattern {id: 'grammar_special_construction_ba'})
MATCH (kp:KnowledgePoint) WHERE kp.id IN [
  'workplace_email_pushback', 'food_ordering_basic', 'workplace_hierarchy_gift'
]
MERGE (kp)-[r:FREQUENT_ERROR {relevance: 0.6}]->(ep)
SET r.updated_at = datetime();

// 给字句偏误 → 与涉及授受关系的知识点相关
MATCH (ep:ErrorPattern {id: 'grammar_special_construction_gei'})
MATCH (kp:KnowledgePoint) WHERE kp.id IN [
  'workplace_hierarchy_gift', 'food_treat_pay', 'workplace_email_pushback'
]
MERGE (kp)-[r:FREQUENT_ERROR {relevance: 0.6}]->(ep)
SET r.updated_at = datetime();

// 所有 KPs → 通用偏误 (声调、汉字、助词、名词复合)
MATCH (ep:ErrorPattern) WHERE ep.id IN [
  'phonological_tone_confusion', 'orthographic_character_structure',
  'grammar_particle_misuse', 'lexical_noun_compound_order'
]
MATCH (kp:KnowledgePoint)
MERGE (kp)-[r:FREQUENT_ERROR {relevance: 0.5}]->(ep)
SET r.updated_at = datetime();


// ============================================================================
// PART 8: 验证查询
// ============================================================================

// 统计各类型节点数量
// MATCH (ec:ErrorCategory) RETURN 'ErrorCategory' AS label, count(ec) AS cnt
// UNION ALL
// MATCH (ep:ErrorPattern) RETURN 'ErrorPattern', count(ep)
// UNION ALL
// MATCH (lf:LinguisticFeature) RETURN 'LinguisticFeature', count(lf)
// UNION ALL
// MATCH (et:Etiology) RETURN 'Etiology', count(et)
// UNION ALL
// MATCH (is:InterventionStrategy) RETURN 'InterventionStrategy', count(is);

// 按偏误范畴查看分布
// MATCH (ep:ErrorPattern)-[:BELONGS_TO]->(ec:ErrorCategory)
// RETURN ec.name AS category, collect(ep.name) AS patterns, count(ep) AS cnt;

// 查看偏误成因网络
// MATCH (ep:ErrorPattern)-[r:CAUSED_BY]->(et:Etiology)
// RETURN ep.name AS pattern, collect(et.name) AS etiologies;

// 查看知识点→偏误模式映射
// MATCH (kp:KnowledgePoint)-[r:FREQUENT_ERROR]->(ep:ErrorPattern)
// RETURN kp.name AS kp, ep.name AS error_pattern, r.relevance AS relevance
// ORDER BY relevance DESC;
