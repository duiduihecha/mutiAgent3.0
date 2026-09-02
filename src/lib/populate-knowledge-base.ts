/**
 * 知识库填充脚本
 * 根据《国际中文教育用中国文化和国情教学参考框架》填充知识点
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

// 初级（小学）文化知识点
const PRIMARY_CULTURAL_KNOWLEDGE = [
  // ===== 社会生活 =====
  {
    hsk_level: 1,
    layer: 1 as const,
    category: 'social_life',
    subcategory: 'diet',
    topic: '日常饮食',
    objectives: '识别中国人日常饮食的主要食物和口味偏好',
    language_bindings: ['米饭', '面条', '饺子', '炒菜', '一日三餐'],
    cultural_points: ['主食', '炒菜', '饺子', '面条', '包子', '豆浆'],
    examples: ['我早上吃包子，喝豆浆。', '中午吃米饭和炒菜。', '晚上喜欢吃面条。']
  },
  {
    hsk_level: 1,
    layer: 1 as const,
    category: 'social_life',
    subcategory: 'diet',
    topic: '筷子与合餐',
    objectives: '了解中国人使用筷子的方法和合餐的习惯',
    language_bindings: ['筷子', '合餐', '一起吃饭'],
    cultural_points: ['筷子', '合餐', '北京烤鸭', '火锅', '色香味'],
    examples: ['中国人用筷子吃饭。', '我们一起吃火锅吧。']
  },
  {
    hsk_level: 2,
    layer: 1 as const,
    category: 'social_life',
    subcategory: 'housing',
    topic: '住房类型',
    objectives: '识别中国人典型的住房类型和地区分布',
    language_bindings: ['平房', '楼房', '小区', '村庄'],
    cultural_points: ['平房', '楼房', '别墅', '院子', '小区', '村庄'],
    examples: ['城市里有很多楼房。', '农村有很多平房。']
  },
  {
    hsk_level: 1,
    layer: 1 as const,
    category: 'social_life',
    subcategory: 'housing',
    topic: '室内布局',
    objectives: '了解中国人住房环境和室内布局的特点',
    language_bindings: ['卧室', '客厅', '厨房', '卫生间'],
    cultural_points: ['卧室', '客厅', '中式家具', '午睡'],
    examples: ['我家有三间卧室。', '客厅里有一台电视。']
  },
  {
    hsk_level: 2,
    layer: 1 as const,
    category: 'social_life',
    subcategory: 'clothing',
    topic: '日常衣着',
    objectives: '识别中式服装在颜色和款式等方面的特点',
    language_bindings: ['工作服', '休闲服', '运动服', '校服'],
    cultural_points: ['工作服', '休闲服', '运动服', '中式服装', '校服'],
    examples: ['中国人上班穿工作服。', '学生上学穿校服。']
  },
  {
    hsk_level: 1,
    layer: 1 as const,
    category: 'social_life',
    subcategory: 'transportation',
    topic: '交通工具',
    objectives: '识别中国人日常出行的主要交通工具',
    language_bindings: ['自行车', '公交车', '地铁', '出租车'],
    cultural_points: ['自行车', '公交车', '地铁', '私家车', '出租车', '校车'],
    examples: ['我每天坐公交车上学。', '地铁很快。']
  },
  {
    hsk_level: 2,
    layer: 1 as const,
    category: 'social_life',
    subcategory: 'transportation',
    topic: '交通规则',
    objectives: '了解中国基本的交通标志和交通规则',
    language_bindings: ['红绿灯', '斑马线', '靠右行驶', '礼让行人'],
    cultural_points: ['红绿灯', '靠右行驶', '斑马线', '礼让行人'],
    examples: ['红灯停，绿灯行。', '行人要走斑马线。']
  },
  {
    hsk_level: 2,
    layer: 1 as const,
    category: 'social_life',
    subcategory: 'family',
    topic: '家庭结构',
    objectives: '了解中国家庭的人口数量和家庭成员之间的称谓',
    language_bindings: ['爸爸', '妈妈', '爷爷', '奶奶', '哥哥', '姐姐'],
    cultural_points: ['家庭人口', '亲属称谓', '家庭角色', '家长'],
    examples: ['我家有四口人。', '这是我爸爸。']
  },
  {
    hsk_level: 2,
    layer: 1 as const,
    category: 'social_life',
    subcategory: 'family',
    topic: '家庭观念',
    objectives: '理解中国家庭尊老爱幼的特点和观念',
    language_bindings: ['尊老爱幼', '家风', '孝顺'],
    cultural_points: ['家风', '尊老爱幼', '家务分工'],
    examples: ['中国人重视尊老爱幼。', '我们要孝顺父母。']
  },
  {
    hsk_level: 2,
    layer: 1 as const,
    category: 'social_life',
    subcategory: 'festivals',
    topic: '春节习俗',
    objectives: '了解中国春节的主要习俗和文化含义',
    language_bindings: ['春节', '年夜饭', '放鞭炮', '压岁钱', '拜年'],
    cultural_points: ['春节', '年夜饭', '放鞭炮', '压岁钱'],
    examples: ['春节是中国最重要的节日。', '春节要吃年夜饭。', '小朋友会收到压岁钱。']
  },
  {
    hsk_level: 2,
    layer: 1 as const,
    category: 'social_life',
    subcategory: 'festivals',
    topic: '生日庆祝',
    objectives: '了解中国人庆祝生日的习俗和文化含义',
    language_bindings: ['过生日', '生日蛋糕', '周岁礼'],
    cultural_points: ['过生日', '周岁礼', '周岁和虚岁', '属相'],
    examples: ['我每年过生日都吃蛋糕。', '他属龙。']
  },
  {
    hsk_level: 2,
    layer: 1 as const,
    category: 'social_life',
    subcategory: 'festivals',
    topic: '十二生肖',
    objectives: '了解十二生肖',
    language_bindings: ['属相', '生肖', '龙', '蛇', '马'],
    cultural_points: ['属相', '十二生肖', '龙', '鼠', '牛', '虎', '兔', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'],
    examples: ['我是属兔的。', '龙是中国的象征。']
  },
  {
    hsk_level: 2,
    layer: 1 as const,
    category: 'social_life',
    subcategory: 'leisure',
    topic: '儿童游戏',
    objectives: '了解中国儿童主要休闲娱乐活动',
    language_bindings: ['游乐园', '放风筝', '拼图', '游戏'],
    cultural_points: ['游乐园', '益智游戏', '动画片', '放风筝', '功夫'],
    examples: ['我喜欢放风筝。', '周末去游乐园玩。']
  },
  {
    hsk_level: 3,
    layer: 1 as const,
    category: 'social_life',
    subcategory: 'language_communication',
    topic: '礼貌用语',
    objectives: '了解中国人称呼的礼貌用语和使用场合',
    language_bindings: ['先生', '老师', '叔叔', '阿姨', '请问', '谢谢'],
    cultural_points: ['先生', '老师', '叔叔', '阿姨', '爷爷', '奶奶'],
    examples: ['请问，您叫什么名字？', '谢谢老师。']
  },
  {
    hsk_level: 2,
    layer: 1 as const,
    category: 'social_life',
    subcategory: 'nonverbal_communication',
    topic: '体态语',
    objectives: '了解中国人常用体态语的特点和得体行为',
    language_bindings: ['鞠躬', '握手', '微笑', '敬礼'],
    cultural_points: ['鞠躬', '握手', '敬礼', '拱手礼', '微笑', '数字的手势'],
    examples: ['见面时握手表示友好。', '中国人常用微笑表示友好。']
  },
  {
    hsk_level: 3,
    layer: 1 as const,
    category: 'social_life',
    subcategory: 'social_interaction',
    topic: '见面礼节',
    objectives: '了解中国人见面的礼节和得体行为',
    language_bindings: ['见面', '问候', '自我介绍', '排队'],
    cultural_points: ['见面礼节', '问候礼仪', '排队'],
    examples: ['中国人见面常用“你好”。', '要排队等候。']
  },
  {
    hsk_level: 3,
    layer: 1 as const,
    category: 'social_life',
    subcategory: 'language_and_culture',
    topic: '数字文化',
    objectives: '理解中文吉祥数字词的象征含义',
    language_bindings: ['八', '六', '四', '双数'],
    cultural_points: ['双数词', '四', '六', '八等数字词'],
    examples: ['中国人觉得八是吉祥的数字。', '四听起来像死，所以不太受欢迎。']
  },
  {
    hsk_level: 3,
    layer: 1 as const,
    category: 'social_life',
    subcategory: 'language_and_culture',
    topic: '颜色文化',
    objectives: '理解中文红色等颜色词的象征含义',
    language_bindings: ['红色', '黄色', '白色', '黑色'],
    cultural_points: ['红色', '黄色'],
    examples: ['红色在中国代表喜庆。', '黄色是皇家颜色。']
  },
  {
    hsk_level: 3,
    layer: 1 as const,
    category: 'social_life',
    subcategory: 'language_and_culture',
    topic: '动植物象征',
    objectives: '理解中文动植物词特别是"龙"的象征含义',
    language_bindings: ['龙', '狗', '熊猫', '梅兰竹菊'],
    cultural_points: ['龙', '狗', '牛', '乌龟', '蝙蝠', '梅兰竹菊'],
    examples: ['龙是中国的象征。', '熊猫是中国的国宝。']
  },
  
  // ===== 传统文化 =====
  {
    hsk_level: 2,
    layer: 1 as const,
    category: 'traditional_culture',
    subcategory: 'cultural_heritage',
    topic: '长城',
    objectives: '了解长城的位置和特点，理解长城的价值',
    language_bindings: ['长城', '山海关', '八达岭', '万里长城'],
    cultural_points: ['长城', '山海关', '八达岭'],
    examples: ['长城很长，有一万多里。', '山海关是长城的起点。']
  },
  {
    hsk_level: 2,
    layer: 1 as const,
    category: 'traditional_culture',
    subcategory: 'cultural_heritage',
    topic: '故宫',
    objectives: '了解故宫的位置和特点，理解故宫的价值',
    language_bindings: ['故宫', '天安门', '北京', '古代'],
    cultural_points: ['北京故宫', '天安门'],
    examples: ['故宫是古代皇帝住的地方。', '天安门在北京。']
  },
  {
    hsk_level: 3,
    layer: 1 as const,
    category: 'traditional_culture',
    subcategory: 'cultural_heritage',
    topic: '布达拉宫',
    objectives: '了解布达拉宫的位置和特点及相关历史故事',
    language_bindings: ['布达拉宫', '西藏', '文成公主'],
    cultural_points: ['布达拉宫', '文成公主'],
    examples: ['布达拉宫在西藏。', '文成公主去过西藏。']
  },
  {
    hsk_level: 3,
    layer: 1 as const,
    category: 'traditional_culture',
    subcategory: 'literature',
    topic: '神话传说',
    objectives: '了解中国著名的神话传说故事，理解其文化含义',
    language_bindings: ['女娲补天', '盘古开天地', '大禹治水'],
    cultural_points: ['女娲补天', '盘古开天地', '仓颉造字', '大禹治水'],
    examples: ['女娲是中国神话中的人物。', '盘古开天地是神话故事。']
  },
  {
    hsk_level: 3,
    layer: 1 as const,
    category: 'traditional_culture',
    subcategory: 'literature',
    topic: '成语寓言',
    objectives: '了解中国著名的成语寓言故事，理解其文化含义',
    language_bindings: ['愚公移山', '守株待兔', '画蛇添足'],
    cultural_points: ['愚公移山', '守株待兔'],
    examples: ['愚公移山告诉我们要有毅力。', '守株待兔是说不要侥幸。']
  },
  {
    hsk_level: 3,
    layer: 1 as const,
    category: 'traditional_culture',
    subcategory: 'literature',
    topic: '民间传说',
    objectives: '了解中国著名的民间传说故事，理解其文化含义',
    language_bindings: ['牛郎织女', '花木兰', '孟姜女'],
    cultural_points: ['牛郎织女', '木兰从军'],
    examples: ['牛郎织女是爱情故事。', '花木兰代父从军。']
  },
  {
    hsk_level: 2,
    layer: 1 as const,
    category: 'traditional_culture',
    subcategory: 'arts',
    topic: '剪纸年画',
    objectives: '了解中国剪纸和年画的艺术特点和与春节习俗的联系',
    language_bindings: ['剪纸', '窗花', '年画', '春节'],
    cultural_points: ['剪纸', '窗花', '年画', '杨柳青年画'],
    examples: ['春节时贴窗花。', '年画是过年时贴的画。']
  },
  {
    hsk_level: 3,
    layer: 1 as const,
    category: 'traditional_culture',
    subcategory: 'arts',
    topic: '皮影戏',
    objectives: '了解并欣赏中国皮影戏的道具和表演艺术的特点',
    language_bindings: ['皮影', '皮影戏', '表演', '道具'],
    cultural_points: ['皮影道具', '皮影表演'],
    examples: ['皮影戏是中国传统的表演艺术。', '用皮影表演故事。']
  },
  {
    hsk_level: 2,
    layer: 1 as const,
    category: 'traditional_culture',
    subcategory: 'arts',
    topic: '民歌',
    objectives: '了解并学唱中国著名的儿歌和民歌',
    language_bindings: ['茉莉花', '找朋友', '丢手绢'],
    cultural_points: ['《茉莉花》', '《找朋友》', '《丢手绢》'],
    examples: ['《茉莉花》是很著名的中国民歌。', '我们唱《找朋友》。']
  },
  {
    hsk_level: 3,
    layer: 1 as const,
    category: 'traditional_culture',
    subcategory: 'inventions',
    topic: '二十四节气',
    objectives: '了解中国农历和二十四节气的时间和特点',
    language_bindings: ['农历', '节气', '春天', '夏天'],
    cultural_points: ['农历', '二十四节气', '节气民俗'],
    examples: ['中国有二十四个节气。', '清明是春天的节气。']
  },
  {
    hsk_level: 3,
    layer: 1 as const,
    category: 'traditional_culture',
    subcategory: 'inventions',
    topic: '珠算',
    objectives: '了解珠算的特点和使用算盘的方法',
    language_bindings: ['算盘', '珠算', '计算'],
    cultural_points: ['珠算', '算盘', '乘法口诀'],
    examples: ['算盘是中国的发明。', '以前用算盘计算。']
  },
  
  // ===== 当代中国 =====
  {
    hsk_level: 2,
    layer: 1 as const,
    category: 'contemporary_china',
    subcategory: 'geography',
    topic: '国家概况',
    objectives: '了解中国的地理位置和国家概况',
    language_bindings: ['中国', '北京', '人口', '民族'],
    cultural_points: ['国旗', '国歌', '首都', '人口', '民族', '人民币'],
    examples: ['中国的首都是北京。', '中国有五十六个民族。']
  },
  {
    hsk_level: 2,
    layer: 1 as const,
    category: 'contemporary_china',
    subcategory: 'geography',
    topic: '名山大川',
    objectives: '了解中国主要名山大川的名字和地理位置',
    language_bindings: ['长江', '黄河', '喜马拉雅山', '泰山'],
    cultural_points: ['长江', '黄河', '喜马拉雅山'],
    examples: ['长江是中国最长的河。', '黄河是中国的母亲河。']
  },
  {
    hsk_level: 2,
    layer: 1 as const,
    category: 'contemporary_china',
    subcategory: 'geography',
    topic: '珍稀动物',
    objectives: '了解中国珍稀动物的栖息地和特点',
    language_bindings: ['大熊猫', '藏羚羊', '金丝猴', '动物'],
    cultural_points: ['大熊猫', '藏羚羊', '金丝猴'],
    examples: ['大熊猫是中国的国宝。', '大熊猫住在四川。']
  },
  {
    hsk_level: 2,
    layer: 1 as const,
    category: 'contemporary_china',
    subcategory: 'education',
    topic: '校园生活',
    objectives: '了解中国中小学的学校作息时间和主要校园活动',
    language_bindings: ['升国旗', '课间操', '早自习', '班会'],
    cultural_points: ['作息时间', '升国旗', '课间操', '早、晚自习', '班会'],
    examples: ['每天早上要升国旗。', '课间有十分钟休息。']
  },
  {
    hsk_level: 2,
    layer: 1 as const,
    category: 'contemporary_china',
    subcategory: 'education',
    topic: '学习活动',
    objectives: '了解中国中小学生课堂学习和课外活动的内容和特点',
    language_bindings: ['作业', '兴趣小组', '课外活动'],
    cultural_points: ['作业', '兴趣小组'],
    examples: ['中国学生放学后要做作业。', '可以参加各种兴趣小组。']
  },
  {
    hsk_level: 3,
    layer: 1 as const,
    category: 'contemporary_china',
    subcategory: 'education',
    topic: '学生守则',
    objectives: '理解中国中小学的学生守则和好学生的标准',
    language_bindings: ['学生守则', '三好学生', '纪律'],
    cultural_points: ['学生守则', '三好学生'],
    examples: ['三好学生是品学兼优的学生。', '要遵守学生守则。']
  },
  {
    hsk_level: 1,
    layer: 1 as const,
    category: 'contemporary_china',
    subcategory: 'language_writing',
    topic: '汉语拼音',
    objectives: '了解汉语和汉语拼音的基本特点',
    language_bindings: ['汉语拼音', '声母', '韵母', '声调'],
    cultural_points: ['汉语', '汉语拼音'],
    examples: ['汉语拼音帮助我们学习汉字。', '中文有声调。']
  },
  {
    hsk_level: 2,
    layer: 1 as const,
    category: 'contemporary_china',
    subcategory: 'language_writing',
    topic: '汉字特点',
    objectives: '了解汉字结构的基本特点和书写规则',
    language_bindings: ['汉字', '笔画', '笔顺', '象形字'],
    cultural_points: ['汉字', '汉字笔画', '笔顺', '象形字'],
    examples: ['汉字是方块字。', '汉字有笔画顺序。']
  }
];

// 中级（中学）文化知识点
const INTERMEDIATE_CULTURAL_KNOWLEDGE = [
  {
    hsk_level: 4,
    layer: 2 as const,
    category: 'social_life',
    subcategory: 'diet',
    topic: '地方菜系',
    objectives: '了解中国地方菜系的特点和分布，理解中国饮食的多样性',
    language_bindings: ['川菜', '粤菜', '鲁菜', '淮扬菜', '四大菜系', '八大菜系'],
    cultural_points: ['四大菜系', '八大菜系', '地方小吃'],
    examples: ['川菜以辣著称。', '粤菜比较清淡。']
  },
  {
    hsk_level: 4,
    layer: 2 as const,
    category: 'social_life',
    subcategory: 'diet',
    topic: '餐桌礼仪',
    objectives: '了解中国人的餐桌礼仪和表达的文化含义',
    language_bindings: ['公筷', '点菜', '敬茶', '入座', '碰杯'],
    cultural_points: ['公筷', '点菜顺序', '入座顺序', '敬茶'],
    examples: ['中国人用公筷更卫生。', '敬茶表示尊重。']
  },
  {
    hsk_level: 5,
    layer: 2 as const,
    category: 'social_life',
    subcategory: 'diet',
    topic: '饮食变化',
    objectives: '理解中国人饮食方式的变化及影响因素',
    language_bindings: ['外卖', '快餐', '网购', '美食App'],
    cultural_points: ['快餐', '外卖', '美食榜单', '学校营养餐'],
    examples: ['现在很多人点外卖。', '移动支付改变了购物方式。']
  },
  {
    hsk_level: 4,
    layer: 2 as const,
    category: 'social_life',
    subcategory: 'housing',
    topic: '民居特点',
    objectives: '了解中国各地民居的特点和分布',
    language_bindings: ['四合院', '窑洞', '土楼', '吊脚楼'],
    cultural_points: ['四合院', '北方窑洞', '福建土楼', '皖南民居', '竹楼', '碉楼', '蒙古包'],
    examples: ['四合院是北京的特色建筑。', '窑洞是黄土高原的民居。']
  },
  {
    hsk_level: 5,
    layer: 2 as const,
    category: 'social_life',
    subcategory: 'housing',
    topic: '四合院文化',
    objectives: '理解四合院的建筑特点和 文化内涵',
    language_bindings: ['四合院', '院子', '影壁', '风水'],
    cultural_points: ['北京四合院'],
    examples: ['四合院体现中国传统文化。', '四合院有四面的房子。']
  },
  {
    hsk_level: 4,
    layer: 2 as const,
    category: 'social_life',
    subcategory: 'clothing',
    topic: '服饰多样性',
    objectives: '了解中国人在工作、休闲、节日等场合的衣着特点',
    language_bindings: ['正装', '职业装', '节日服装', '流行服装'],
    cultural_points: ['正装', '职业装', '节日服装', '流行服装'],
    examples: ['正式场合要穿正装。', '春节人们喜欢穿红色衣服。']
  },
  {
    hsk_level: 5,
    layer: 2 as const,
    category: 'social_life',
    subcategory: 'clothing',
    topic: '传统服饰',
    objectives: '了解中国传统服饰在颜色和款式方面的主要特点',
    language_bindings: ['汉服', '唐装', '旗袍', '中山装'],
    cultural_points: ['汉服', '唐装', '旗袍', '中山装'],
    examples: ['旗袍体现中国女性的优雅。', '中山装曾是很流行的服装。']
  },
  {
    hsk_level: 5,
    layer: 2 as const,
    category: 'social_life',
    subcategory: 'clothing',
    topic: '少数民族服饰',
    objectives: '了解中国少数民族服饰的特点和多样性',
    language_bindings: ['苗族', '藏族', '蜡染', '刺绣'],
    cultural_points: ['蜡染', '刺绣', '苗族头饰'],
    examples: ['苗族服饰有很多银饰。', '少数民族服装很有特色。']
  },
  {
    hsk_level: 4,
    layer: 2 as const,
    category: 'social_life',
    subcategory: 'transportation',
    topic: '公共交通',
    objectives: '了解中国人使用公共交通工具的基本情况',
    language_bindings: ['地铁', '高铁', '公交车', '网约车'],
    cultural_points: ['轨道交通', '高铁', '共享单车', '网约车'],
    examples: ['高铁又快又舒服。', '共享单车很方便。']
  },
  {
    hsk_level: 5,
    layer: 2 as const,
    category: 'social_life',
    subcategory: 'transportation',
    topic: '交通发展',
    objectives: '理解高铁和共享单车的特点和对中国人出行的意义',
    language_bindings: ['高铁', '共享单车', '新能源车', '绿色出行'],
    cultural_points: ['高铁', '共享单车', '交通拥堵', '早、晚高峰'],
    examples: ['高铁让出行更便捷。', '共享单车有助于环保。']
  },
  {
    hsk_level: 4,
    layer: 2 as const,
    category: 'social_life',
    subcategory: 'family',
    topic: '家庭结构',
    objectives: '了解中国的基本家庭结构，理解中国家庭结构模式的多样性',
    language_bindings: ['三代同堂', '单亲家庭', '丁克家庭', '四二一家庭'],
    cultural_points: ['三代同堂', '单亲家庭', '四二一家庭', '丁克家庭'],
    examples: ['以前中国家庭多为三代同堂。', '现在家庭模式更加多样化了。']
  },
  {
    hsk_level: 5,
    layer: 2 as const,
    category: 'social_life',
    subcategory: 'family',
    topic: '家庭教育',
    objectives: '理解中国家庭教育的特点和父母对孩子的期待',
    language_bindings: ['望子成龙', '严父慈母', '家长期望', '学区房'],
    cultural_points: ['严父慈母', '望子成龙'],
    examples: ['父母希望孩子有出息。', '中国人重视教育。']
  },
  {
    hsk_level: 4,
    layer: 2 as const,
    category: 'social_life',
    subcategory: 'festivals',
    topic: '传统节日',
    objectives: '了解中国清明节、端午节、中秋节的习俗和文化含义',
    language_bindings: ['清明节', '端午节', '中秋节', '粽子', '月饼'],
    cultural_points: ['清明节', '扫墓', '端午节', '粽子', '划龙舟', '中秋节', '月饼', '赏月'],
    examples: ['清明节是祭祖的日子。', '端午节吃粽子纪念屈原。']
  },
  {
    hsk_level: 5,
    layer: 2 as const,
    category: 'social_life',
    subcategory: 'festivals',
    topic: '国庆节',
    objectives: '了解中国人庆祝国庆节的主要活动和文化含义',
    language_bindings: ['国庆节', '黄金周', '阅兵', '假期'],
    cultural_points: ['国庆节', '黄金周'],
    examples: ['十月一日是国庆节。', '国庆节放七天假。']
  },
  {
    hsk_level: 5,
    layer: 2 as const,
    category: 'social_life',
    subcategory: 'festivals',
    topic: '少数民族节日',
    objectives: '了解中国少数民族节日的习俗和文化含义',
    language_bindings: ['那达慕', '泼水节', '火把节', '少数民族'],
    cultural_points: ['那达慕', '泼水节', '火把节'],
    examples: ['泼水节是傣族最重要的节日。', '那达慕是蒙古族的传统节日。']
  },
  {
    hsk_level: 4,
    layer: 2 as const,
    category: 'social_life',
    subcategory: 'leisure',
    topic: '休闲方式',
    objectives: '了解中国人休闲娱乐活动的特点',
    language_bindings: ['聚餐', '上网', 'KTV', '旅游'],
    cultural_points: ['聚餐', '上网', 'KTV'],
    examples: ['周末和朋友聚餐是常见的社交方式。', 'KTV是很受欢迎的娱乐活动。']
  },
  {
    hsk_level: 5,
    layer: 2 as const,
    category: 'social_life',
    subcategory: 'leisure',
    topic: '体育活动',
    objectives: '了解中国体育活动如武术、中国象棋、围棋、乒乓球等的特点和文化含义',
    language_bindings: ['武术', '太极拳', '乒乓球', '象棋', '围棋'],
    cultural_points: ['武术', '中国象棋', '围棋', '乒乓球'],
    examples: ['太极拳是中国的传统运动。', '乒乓球是中国的国球。']
  },
  {
    hsk_level: 5,
    layer: 2 as const,
    category: 'social_life',
    subcategory: 'consumption',
    topic: '购物方式',
    objectives: '了解中国人购物的主要方式和特点',
    language_bindings: ['网购', '超市', '集市', '夜市', '直播带货'],
    cultural_points: ['超市', '网购', '直播', '农贸市场和集市', '夜市'],
    examples: ['网购在中国非常流行。', '夜市有很多小吃。']
  },
  {
    hsk_level: 5,
    layer: 2 as const,
    category: 'social_life',
    subcategory: 'consumption',
    topic: '支付方式',
    objectives: '了解中国人购物习惯的特点和支付方式',
    language_bindings: ['移动支付', '支付宝', '微信支付', '现金', '刷卡'],
    cultural_points: ['打折', '讨价还价', '现金', '移动支付', '支付宝'],
    examples: ['中国人出门不用带现金。', '扫码支付很方便。']
  },
  {
    hsk_level: 4,
    layer: 2 as const,
    category: 'social_life',
    subcategory: 'language_communication',
    topic: '礼貌用语',
    objectives: '了解中文的礼貌用语',
    language_bindings: ['您', '请', '劳驾', '贵姓', '打扰'],
    cultural_points: ['您', '请', '劳驾', '贵姓', '谦称和尊称'],
    examples: ['请教您一个问题。', '请问贵姓？']
  },
  {
    hsk_level: 5,
    layer: 2 as const,
    category: 'social_life',
    subcategory: 'language_communication',
    topic: '寒暄与道歉',
    objectives: '了解中文互相介绍和寒暄的方式，了解中文表示道歉的方式',
    language_bindings: ['寒暄', '介绍', '道歉', '不好意思', '抱歉'],
    cultural_points: ['介绍', '寒暄', '道歉'],
    examples: ['中国人见面喜欢聊天气。', '道歉时要态度诚恳。']
  }
];

// 高级（大学）文化知识点
const ADVANCED_CULTURAL_KNOWLEDGE = [
  {
    hsk_level: 6,
    layer: 3 as const,
    category: 'social_life',
    subcategory: 'diet',
    topic: '茶文化',
    objectives: '了解中国人在饮茶种类和饮茶习俗方面的特点和多样性',
    language_bindings: ['绿茶', '红茶', '乌龙茶', '普洱', '茶道', '茶具', '茶馆'],
    cultural_points: ['绿茶', '红茶', '乌龙茶', '茶具', '茶馆', '饮茶习俗', '早茶', '茶道'],
    examples: ['中国有悠久的茶文化。', '广东人喜欢喝早茶。']
  },
  {
    hsk_level: 6,
    layer: 3 as const,
    category: 'social_life',
    subcategory: 'diet',
    topic: '酒文化',
    objectives: '了解中国人在饮酒种类和饮酒习俗方面的特点和多样性',
    language_bindings: ['白酒', '茅台', '黄酒', '敬酒', '劝酒'],
    cultural_points: ['茅台酒', '敬酒', '劝酒'],
    examples: ['白酒是中国传统的酒。', '中国人喝酒有敬酒的文化。']
  },
  {
    hsk_level: 7,
    layer: 3 as const,
    category: 'social_life',
    subcategory: 'diet',
    topic: '健康观念',
    objectives: '理解中国人饮食和健康观念及其变化',
    language_bindings: ['药膳', '食疗', '素食', '健康饮食', '养生'],
    cultural_points: ['药膳', '食疗', '素食', '节食', '健康饮食观念'],
    examples: ['中医讲究药食同源。', '现代人更注重健康饮食。']
  },
  {
    hsk_level: 6,
    layer: 3 as const,
    category: 'social_life',
    subcategory: 'housing',
    topic: '居住方式',
    objectives: '了解中国人居住方式的主要特点和多样性',
    language_bindings: ['租房', '买房', '保障性住房', '商品房', '产权'],
    cultural_points: ['租房', '购房', '保障性住房', '商品房', '房屋使用权和产权'],
    examples: ['年轻人租房比较普遍。', '买房是很多人的梦想。']
  },
  {
    hsk_level: 7,
    layer: 3 as const,
    category: 'social_life',
    subcategory: 'housing',
    topic: '居住观念',
    objectives: '理解中国人居住观念及其变化',
    language_bindings: ['婚房', '学区房', '房产', '居住观念'],
    cultural_points: ['婚房', '住房观念'],
    examples: ['结婚需要买房的观念在改变。', '人们对居住环境要求更高了。']
  },
  {
    hsk_level: 6,
    layer: 3 as const,
    category: 'social_life',
    subcategory: 'family',
    topic: '恋爱婚姻',
    objectives: '理解中国人恋爱方式的特点和择偶的标准',
    language_bindings: ['相亲', '网恋', '择偶标准', '结婚', '彩礼', '嫁妆'],
    cultural_points: ['相亲', '网恋', '择偶标准', '结婚', '彩礼', '嫁妆'],
    examples: ['相亲是传统的找对象方式。', '现代人通过网络认识的越来越多。']
  },
  {
    hsk_level: 7,
    layer: 3 as const,
    category: 'social_life',
    subcategory: 'family',
    topic: '婚恋观念变化',
    objectives: '理解中国人婚恋观念和家庭观念及其变化',
    language_bindings: ['离婚', '丁克', '剩女', '啃老族'],
    cultural_points: ['离婚', '赡养方式', '孝顺'],
    examples: ['现代人对婚姻的态度更开放。', '独居老人需要更多关注。']
  },
  {
    hsk_level: 6,
    layer: 3 as const,
    category: 'social_life',
    subcategory: 'festivals',
    topic: '人生庆典',
    objectives: '理解中国人人生庆典方面的习俗和文化内涵',
    language_bindings: ['满月', '周岁', '成人礼', '寿宴', '丧礼'],
    cultural_points: ['满月', '周岁', '成人礼', '寿宴'],
    examples: ['中国人很重视做寿。', '成人礼标志着长大成人。']
  },
  {
    hsk_level: 7,
    layer: 3 as const,
    category: 'social_life',
    subcategory: 'festivals',
    topic: '节日观念变化',
    objectives: '理解外国节日对中国人节庆行为和观念的影响',
    language_bindings: ['圣诞节', '情人节', '万圣节', '洋节'],
    cultural_points: ['圣诞节', '情人节'],
    examples: ['圣诞节在中国也很流行。', '情人节送玫瑰表达爱意。']
  }
];

// 合并所有知识点
const ALL_KNOWLEDGE_POINTS = [
  ...PRIMARY_CULTURAL_KNOWLEDGE,
  ...INTERMEDIATE_CULTURAL_KNOWLEDGE,
  ...ADVANCED_CULTURAL_KNOWLEDGE
];

export async function populateKnowledgeBase() {
  const client = getSupabaseClient();
  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[]
  };

  console.log(`开始填充知识点，共 ${ALL_KNOWLEDGE_POINTS.length} 条...`);

  for (const point of ALL_KNOWLEDGE_POINTS) {
    try {
      // 构建多语言内容JSON
      const content_json = {
        zh: {
          topic: point.topic,
          objectives: point.objectives,
          cultural_points: point.cultural_points,
          examples: point.examples
        },
        // 预设的语言绑定点
        language_bindings: point.language_bindings,
        // 分类信息
        category: point.category,
        subcategory: point.subcategory
      };

      // 创建知识点
      const { error } = await client
        .from('cultural_knowledge_points')
        .insert({
          hsk_level: point.hsk_level,
          layer: point.layer,
          language_binding_points: point.language_bindings,
          content_json: content_json as Record<string, unknown>
        })
        .select()
        .single();

      if (error) {
        results.failed++;
        results.errors.push(`Failed to insert ${point.topic}: ${error.message}`);
      } else {
        results.success++;
        console.log(`✓ Created: ${point.topic} (HSK ${point.hsk_level})`);
      }
    } catch (err) {
      results.failed++;
      results.errors.push(`Error processing ${point.topic}: ${err}`);
    }
  }

  console.log(`\n完成！成功: ${results.success}, 失败: ${results.failed}`);
  if (results.errors.length > 0) {
    console.log('错误列表:', results.errors);
  }

  return results;
}

// 如果直接运行此脚本
if (typeof require !== 'undefined' && require.main === module) {
  (async () => {
    try {
      await populateKnowledgeBase();
      process.exit(0);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  })();
}

// 导出函数和常量
export { ALL_KNOWLEDGE_POINTS };
