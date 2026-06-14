import React, { useState } from 'react';
import { MODEL_PRICING } from '@/services/ai';
import { syncModelPricingFromDb, type ModelKey } from '@/services/billing';
import { X, Send, ChevronDown, Check, Sparkles } from 'lucide-react';
import PromptPickerDialog from '@/components/PromptPickerDialog';

interface Skill {
  id: string;
  title: string;
  description: string;
  category: string;
  prompt_text: string;
  author_name: string;
  is_official: boolean;
  uses: number;
  likes: number;
  tags: string[];
  cover_color: string;
  created_at?: string | null;
}

const skillCategories = [
  { id: 'all', label: '全部' },
  { id: 'collected', label: '已收藏' },
  { id: 'my_prompts', label: '指令工坊' },
  { id: 'ai_role', label: 'AI角色扮演' },
  { id: 'book_positioning', label: '开书与定位' },
  { id: 'worldbuilding', label: '世界观与设定' },
  { id: 'character', label: '角色系统' },
  { id: 'plot_outline', label: '剧情结构与大纲' },
  { id: 'chapter_scene', label: '单章/段落写作' },
  { id: 'polish_rewrite', label: '润色与改写' },
  { id: 'consistency_proof', label: '一致性与校对' },
  { id: 'ideas_material', label: '素材与灵感' },
  { id: 'other', label: '其他/自定义' },
];

const normalizeSkillCategory = (category: any): string => {
  const c = String(category || '').trim();
  if (!c) return 'other';
  if (c === 'creation') return 'ai_role';
  if (c === 'optimization') return 'polish_rewrite';
  if (c === 'specialized') return 'plot_outline';
  if (skillCategories.some((it) => it.id === c)) return c;
  return 'other';
};

const officialSkills: Skill[] = [
  {
    id: 'skill-1',
    title: '网文小说作家',
    description: '经验丰富的网文创作助手，擅长开篇抓人、节奏紧凑',
    category: 'ai_role',
    prompt_text: `你是一位经验丰富的网文小说作家，擅长创作引人入胜的故事。请遵循以下原则进行创作：

【核心原则】
1. **开篇抓人**：第一章就要展现主角特点、抛出核心冲突、展示世界观
2. **节奏紧凑**：每章都要有小高潮，3-5章一个中高潮，10-15章一个大高潮
3. **人物鲜明**：主角有明确目标和成长弧光，配角各有特色，反派有自己的逻辑
4. **设定清晰**：力量体系、世界观设定要清晰且自洽
5. **情感真挚**：人物情感要真实可信，能引起读者共鸣

【当前任务】
请根据用户提供的内容，继续创作或优化。请确保：
1. 保持故事连贯性
2. 人物性格一致
3. 情节推进合理
4. 语言风格统一

请开始创作：`,
    author_name: '官方',
    is_official: true,
    uses: 0,
    likes: 0,
    tags: ['网文', '小说', '创作'],
    cover_color: 'bg-gradient-to-br from-purple-400 to-indigo-500'
  },
  {
    id: 'skill-2',
    title: '短篇故事创作',
    description: '精通三幕式结构的短篇故事创作专家',
    category: 'ai_role',
    prompt_text: `你是一位擅长短篇故事创作的作家，精通三幕式结构。请按照以下框架创作：

【三幕式结构】
▌第一幕（开端）- 占 25%
- 主角出场，展示其日常状态
- 引入核心设定和世界观
- 发生"激励事件"，打破平静
- 主角做出关键决定，踏上旅程

▌第二幕（发展）- 占 50%
- 主角面对一系列挑战和障碍
- 盟友和敌人相继登场
- 主角不断学习和成长
-  midpoint（中点）：剧情发生重大转折
- 局势逐渐恶化，主角陷入低谷
- "一切都失去了"的时刻

▌第三幕（结局）- 占 25%
- 主角振作起来，发起最后冲刺
- 高潮对决，解决核心冲突
- 展示主角的成长和变化
- 收尾，给故事一个有意味的结局

请根据用户需求，创作一个完整的短篇故事：`,
    author_name: '官方',
    is_official: true,
    uses: 0,
    likes: 0,
    tags: ['短篇', '故事', '三幕式'],
    cover_color: 'bg-gradient-to-br from-pink-400 to-rose-500'
  },
  {
    id: 'skill-3',
    title: '剧本创作',
    description: '专业编剧，按标准剧本格式创作',
    category: 'ai_role',
    prompt_text: `你是一位专业的编剧，擅长创作影视剧本。请按照标准剧本格式创作：

【剧本格式】
[场景标题] INT./EXT. 地点 - 时间

[动作描述] 描写场景、人物动作、环境氛围

[人物名]
对话内容

【剧本结构】
▌第一幕 - 第1-30页
- 开场画面（展示主角和世界）
- 主题呈现（通过对话或事件暗示主题）
- 铺垫（介绍主要人物关系和设定）
- 催化事件（打破平衡的事件）
- 争论（主角内心挣扎或与他人争论）
- 第二幕衔接（主角做出决定，故事进入第二幕）

请根据用户需求，创作剧本内容：`,
    author_name: '官方',
    is_official: true,
    uses: 0,
    likes: 0,
    tags: ['剧本', '编剧', '影视'],
    cover_color: 'bg-gradient-to-br from-amber-400 to-orange-500'
  },
  {
    id: 'skill-4',
    title: '正文情节优化',
    description: '资深文学编辑，从节奏、悬念、冲突等维度优化',
    category: 'polish_rewrite',
    prompt_text: `你是一位资深的文学编辑，擅长优化故事情节。请从以下维度对用户提供的内容进行优化：

【优化维度】
1. **节奏调整**：检查情节节奏是否紧凑，删除冗余描写
2. **悬念加强**：在章节结尾增加悬念，适当埋下伏笔
3. **冲突升级**：让冲突更激烈，让主角面临更艰难的选择
4. **情感深化**：增强人物情感表达，让情感变化更有层次
5. **细节丰富**：增强画面感，丰富感官描写

【优化原则】
- 保持原作的核心情节和人物设定
- 优化后的内容要比原作更精彩
- 尊重原作者的风格

请先指出可优化的地方，然后提供优化后的版本：`,
    author_name: '官方',
    is_official: true,
    uses: 0,
    likes: 0,
    tags: ['优化', '情节', '编辑'],
    cover_color: 'bg-gradient-to-br from-teal-400 to-cyan-500'
  },
  {
    id: 'skill-5',
    title: '对话润色',
    description: '对话大师，让每个人物的对话都独具特色',
    category: 'polish_rewrite',
    prompt_text: `你是一位对话大师，擅长让每个人物的对话都独具特色。请按照以下原则优化对话：

【对话原则】
1. **符合人设**：人物的教育背景、性格、身份决定说话方式
2. **推动剧情**：对话要传达信息或推动情节
3. **潜台词**：通过语气、动作、上下文暗示真实想法
4. **个性化特征**：给人物一个口头禅或特定的用词习惯
5. **符合情境**：紧张时说话简短，放松时可以闲聊

请优化以下对话，让它更精彩：`,
    author_name: '官方',
    is_official: true,
    uses: 0,
    likes: 0,
    tags: ['对话', '润色', '人物'],
    cover_color: 'bg-gradient-to-br from-violet-400 to-purple-500'
  },
  {
    id: 'skill-6',
    title: '环境描写优化',
    description: '写景大师，用五感写作法优化环境描写',
    category: 'chapter_scene',
    prompt_text: `你是一位写景大师，擅长用文字画出画面。请用"五感写作法"优化环境描写：

【五感写作法】
1. **视觉**：颜色、形状、光影、动态，用具体比喻
2. **听觉**：环境音、人声、特殊音效，用拟声词
3. **触觉**：温度、质感、风力
4. **嗅觉**：气味能唤起记忆和情感
5. **味觉**：空气中的味道

【写景原则】
- 景为情服务，写景是为了烘托情绪
- 选择有代表性的细节，不要面面俱到
- 动静结合，让场景活起来

请优化以下环境描写：`,
    author_name: '官方',
    is_official: true,
    uses: 0,
    likes: 0,
    tags: ['环境', '描写', '五感'],
    cover_color: 'bg-gradient-to-br from-emerald-400 to-green-500'
  },
  {
    id: 'skill-16',
    title: '正文描写增强',
    description: '把情节写得更有画面、更有节奏、更能推进冲突',
    category: 'chapter_scene',
    prompt_text: `你是一位网文正文写作教练。请把我提供的正文段落进行“可读性增强”：更清晰、更有画面、更有节奏、更能推进情节。

【要求】
1) 保留原剧情信息与关键事实，不改设定
2) 补足动作链与因果，让读者看清楚“发生了什么”
3) 强化冲突与目标（人物在争什么、想要什么）
4) 对话要有目的（推进情节/暴露信息/塑造人物）

【输出】
- 问题清单（3-8条）
- 优化后的正文
- 可选增强点（更强的结尾悬念 1-3条）

请优化以下正文：`,
    author_name: '官方',
    is_official: true,
    uses: 0,
    likes: 0,
    tags: ['正文', '情节', '节奏'],
    cover_color: 'bg-gradient-to-br from-teal-400 to-cyan-500'
  },
  {
    id: 'skill-7',
    title: '人物刻画深化',
    description: '人物塑造专家，让角色立体鲜活',
    category: 'character',
    prompt_text: `你是一位人物塑造专家，擅长让角色立体鲜活。请从以下维度深化人物：

【人物维度】
1. **外在形象**：外貌描写、标志性特征、着装风格
2. **内在性格**：核心性格、性格的矛盾性、成长变化
3. **背景故事**：过去经历、心结和创伤、人生目标
4. **人物关系**：与主角的关系、与其他角色的互动
5. **人物弧光**：开始时、经历事件后、结束时

【人物塑造技巧】
- 展示而非告知
- 给人物缺点
- 给人物秘密
- 给人物反差

请深化以下人物，让他/她更立体：`,
    author_name: '官方',
    is_official: true,
    uses: 0,
    likes: 0,
    tags: ['人物', '刻画', '角色'],
    cover_color: 'bg-gradient-to-br from-blue-400 to-indigo-500'
  },
  {
    id: 'skill-8',
    title: '大纲创作',
    description: '大纲策划专家，构建完整的故事框架',
    category: 'plot_outline',
    prompt_text: `你是一位大纲策划专家，擅长构建完整的故事框架。请按照以下结构创作大纲：

【大纲结构】
▌核心设定：作品类型、时代背景、世界观核心设定、核心主题
▌人物设定：主角、主要配角、反派、人物关系图
▌故事主线：核心冲突、故事起点、故事终点、核心悬念
▌分卷/分篇大纲：建议3-5卷
▌章节细纲：可选，建议前10-20章

【大纲创作要点】
- 开头要吸引人
- 中间要有起伏
- 结尾要有余味
- 伏笔要早埋
- 节奏要有张有弛

请根据用户的想法，创作一份完整的大纲：`,
    author_name: '官方',
    is_official: true,
    uses: 0,
    likes: 0,
    tags: ['大纲', '策划', '框架'],
    cover_color: 'bg-gradient-to-br from-red-400 to-rose-500'
  },
  {
    id: 'skill-9',
    title: '角色设计',
    description: '角色设计师，创造令人难忘的角色',
    category: 'character',
    prompt_text: `你是一位角色设计师，擅长创造令人难忘的角色。请按照以下模板设计角色：

【主角设计模板】
▌基本信息：姓名、年龄、性别、职业
▌外在形象：外貌描写、身高/体型、标志性特征、着装风格
▌性格特点：核心性格、优点、缺点、口头禅
▌背景故事：童年/成长经历、重要人生事件、心结
▌人物目标：短期目标、长期目标、内心渴望
▌人物弧光：开始时、经历事件、结束时
▌人物关系：与主要配角的关系、与反派的关系

请设计角色：`,
    author_name: '官方',
    is_official: true,
    uses: 0,
    likes: 0,
    tags: ['角色', '设计', '主角'],
    cover_color: 'bg-gradient-to-br from-yellow-400 to-amber-500'
  },
  {
    id: 'skill-10',
    title: '世界观构建',
    description: '世界观构建大师，创造自洽且吸引人的设定',
    category: 'worldbuilding',
    prompt_text: `你是一位世界观构建大师，擅长创造自洽且吸引人的设定。请从以下维度构建世界观：

【世界观维度】
▌地理环境：大陆/国家划分、重要地理特征、气候特点、特殊地点
▌历史背景：世界起源、重要历史事件、王朝更替、传说神话
▌种族与生物：智慧种族、种族特点、普通生物、特殊生物
▌社会结构：政治制度、社会阶层、重要组织、法律规则
▌力量体系（如适用）：力量等级、修炼方式、特殊能力、限制代价
▌经济系统：货币、主要产业、贸易、物价水平
▌文化与习俗：宗教信仰、节日庆典、礼仪风俗、艺术娱乐
▌日常生活：衣食住行、通讯方式、交通方式、教育

请构建世界观：`,
    author_name: '官方',
    is_official: true,
    uses: 0,
    likes: 0,
    tags: ['世界观', '设定', '构建'],
    cover_color: 'bg-gradient-to-br from-sky-400 to-blue-500'
  },
  {
    id: 'skill-11',
    title: '冲突设计',
    description: '冲突设计专家，创造让读者揪心的冲突',
    category: 'plot_outline',
    prompt_text: `你是一位冲突设计专家，擅长创造让读者揪心的冲突。请按照以下类型设计冲突：

【冲突类型】
1. **内心冲突**：道德抉择、自我怀疑、情感挣扎
2. **人际冲突**：理念不合、利益冲突、情感纠葛
3. **社会冲突**：对抗体制、被误解排斥、维护正义
4. **自然冲突**：生存挑战、自然灾害、野外求生
5. **超自然冲突**：对抗怪物、解开诅咒、宿命对抗

【冲突升级节奏】
小冲突（每章）→ 中冲突（3-5章）→ 大冲突（10-15章）→ 最终冲突（结局）

【冲突设计要点】
- 冲突要有 stakes（利害关系）
- 冲突要两难（选A也痛苦，选B也痛苦）
- 冲突要升级（越来越严重）
- 冲突要解决但付出代价

请为故事设计冲突：`,
    author_name: '官方',
    is_official: true,
    uses: 0,
    likes: 0,
    tags: ['冲突', '设计', '情节'],
    cover_color: 'bg-gradient-to-br from-fuchsia-400 to-pink-500'
  },
  {
    id: 'skill-12',
    title: '开书定位助手',
    description: '快速确定题材、卖点与开篇策略',
    category: 'book_positioning',
    prompt_text: `你是一位网文编辑与策划。请根据用户提供的信息，输出：一句话定位、3个卖点、黄金三章目标、开篇冲突方案与10个书名方向。`,
    author_name: '官方',
    is_official: true,
    uses: 0,
    likes: 0,
    tags: ['开书', '定位', '黄金三章'],
    cover_color: 'bg-gradient-to-br from-purple-400 to-indigo-500'
  },
  {
    id: 'skill-13',
    title: '一致性校对助手',
    description: '检查时间线、设定与人物行为矛盾',
    category: 'consistency_proof',
    prompt_text: `你是一位严谨的小说校对编辑。请输出：问题清单（含引用证据）+ 修正建议；能直接修复的给出修订段落。`,
    author_name: '官方',
    is_official: true,
    uses: 0,
    likes: 0,
    tags: ['校对', '一致性', '时间线'],
    cover_color: 'bg-gradient-to-br from-emerald-400 to-green-500'
  },
  {
    id: 'skill-14',
    title: '灵感素材生成器',
    description: '生成情节、反转、人物冲突与命名',
    category: 'ideas_material',
    prompt_text: `你是一位网文灵感策划。请按题材与关键词输出：20个情节点子、10个反转点、10组人物冲突、30个命名。`,
    author_name: '官方',
    is_official: true,
    uses: 0,
    likes: 0,
    tags: ['灵感', '素材', '命名'],
    cover_color: 'bg-gradient-to-br from-amber-400 to-orange-500'
  },
  {
    id: 'skill-15',
    title: '自定义提示词模板',
    description: '承载你自定义的提示词结构与写作规则',
    category: 'other',
    prompt_text: `请写下：角色、目标、约束、输出格式、示例（可选）。`,
    author_name: '官方',
    is_official: true,
    uses: 0,
    likes: 0,
    tags: ['自定义', '模板'],
    cover_color: 'bg-gradient-to-br from-sky-400 to-blue-500'
  }
];

interface AIGenerationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (model: ModelKey, prompt: string) => void;
  nodeLabel: string;
  nodeId: string;
  balance: number;
  position?: { x: number, y: number };
  embedded?: boolean;
  contexts?: Array<{ content: string, sourceName: string }>;
  onAddContext?: () => void;
  onRemoveContext?: (index: number) => void;
  isGenerating?: boolean;
  loadingText?: string;
  lastUsage?: {
    input_tokens: number;
    output_tokens: number;
    total_cost: number;
  } | null;
}

const AIGenerationDialog: React.FC<AIGenerationDialogProps> = ({ 
  isOpen, 
  onClose, 
  onSubmit, 
  nodeLabel,
  nodeId,
  balance,
  position,
  embedded = false,
  contexts = [],
  onAddContext,
  onRemoveContext,
  isGenerating = false,
  loadingText = '正在生成...',
  lastUsage = null
}) => {
  const [selectedModel, setSelectedModel] = useState<ModelKey>('deepseek-v4-flash');
  const [prompt, setPrompt] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showPromptPicker, setShowPromptPicker] = useState(false);
  const [, setPricingRefreshTick] = useState(0);
  
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const promptTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleModelSelect = (modelKey: ModelKey) => {
    setSelectedModel(modelKey);
    setShowModelDropdown(false);
  };

  React.useEffect(() => {
    if (!isOpen) return;
    setPrompt('');
    syncModelPricingFromDb()
      .then(() => setPricingRefreshTick((value) => value + 1))
      .catch((error) => console.warn('[AIGenerationDialog] sync pricing failed', error));
  }, [isOpen, nodeId]);

  if (!isOpen) return null;

  // Embedded mode can still use custom placement; popup mode uses centered overlay.
  const style: React.CSSProperties | undefined = embedded
    ? position
      ? { position: 'absolute', left: position.x, top: position.y }
      : undefined
    : undefined;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || isGenerating) return;
    onSubmit(selectedModel, prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const insertPromptContent = (text: string) => {
    const el = promptTextareaRef.current;
    const start = el?.selectionStart ?? undefined;
    const end = el?.selectionEnd ?? undefined;
    setPrompt((prev) => {
      const current = String(prev ?? '');
      if (start === undefined || end === undefined) {
        return current ? `${current}\n${text}` : text;
      }
      const safeStart = Math.min(Math.max(0, start), current.length);
      const safeEnd = Math.min(Math.max(0, end), current.length);
      const insertingAtEnd = safeStart === safeEnd && safeStart === current.length;
      const prefix = insertingAtEnd && current && !current.endsWith('\n') ? '\n' : '';
      const inserted = `${prefix}${text}`;
      return current.slice(0, safeStart) + inserted + current.slice(safeEnd);
    });

    if (el) {
      requestAnimationFrame(() => {
        const current = el.value;
        const baseStart = start ?? current.length;
        const insertingAtEnd = baseStart === current.length;
        const prefix = insertingAtEnd && current && !current.endsWith('\n') ? '\n' : '';
        const pos = Math.min(current.length, baseStart + prefix.length + text.length);
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    }
  };

  const dialogContent = (
    <div
      style={style}
      className={`${embedded ? 'w-[600px] max-w-[66vw]' : 'w-[700px] max-w-[90vw]'} bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-visible animate-in fade-in zoom-in duration-200`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center space-x-2">
          <div className="flex items-center text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg px-2 py-1 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-green-500 mr-1.5 animate-pulse"></span>
            AI生成模式
          </div>

          <div className="flex items-center text-xs text-gray-500 bg-purple-50 text-purple-700 border border-purple-100 px-2 py-1 rounded-lg">
            <span className="mr-1">💎</span>
            <span>{balance?.toLocaleString() || 0}</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Context Area */}
      {onAddContext && (
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-500">上下文参考:</span>
            <button
              onClick={onAddContext}
              className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
            >
              添加
            </button>
          </div>

          {contexts.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 max-h-[60px] overflow-y-auto custom-scrollbar">
              {contexts.map((ctx, idx) => (
                <span key={idx} className="flex items-center bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 max-w-full">
                  <span className="truncate max-w-[150px]" title={ctx.sourceName}>{ctx.sourceName}</span>
                  {onRemoveContext && (
                    <button
                      onClick={() => onRemoveContext(idx)}
                      className="ml-1 hover:bg-blue-200 rounded-full w-3 h-3 flex items-center justify-center"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-gray-400 italic">无 (仅使用当前节点)</div>
          )}
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 bg-white">
        <div className="mb-3 text-xs text-gray-500 font-medium flex items-center justify-between">
          <div className="flex items-center relative" ref={dropdownRef}>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-600 mr-2"></span>
            <span className="text-gray-900 font-bold max-w-[260px] truncate mr-4">正在编辑节点：{nodeLabel || nodeId}</span>

            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              className="flex items-center gap-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 transition-colors"
            >
              <span>{MODEL_PRICING[selectedModel as keyof typeof MODEL_PRICING]?.name}</span>
              <span className="text-gray-400 ml-1">
                (输入 {MODEL_PRICING[selectedModel as keyof typeof MODEL_PRICING]?.inputMultiplier}x)
              </span>
              <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showModelDropdown && (
              <div className="absolute top-full right-0 mt-1 w-80 max-h-80 overflow-y-auto bg-white rounded-lg shadow-xl border border-gray-100 z-[1200] animate-in fade-in zoom-in-95 duration-100 custom-scrollbar">
                {Object.entries(MODEL_PRICING).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => handleModelSelect(key as ModelKey)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${
                      selectedModel === key ? 'bg-purple-50/50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${selectedModel === key ? 'text-purple-700' : 'text-gray-800'}`}>
                          {config.name}
                        </span>
                        {config.tags?.map(tag => (
                          <span key={tag} className="px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[10px]">
                            {tag}
                          </span>
                        ))}
                      </div>
                      {selectedModel === key && <Check className="w-4 h-4 text-purple-600" />}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="flex items-center gap-1 text-gray-500">
                        <span>输入:</span>
                        <span className="font-mono font-medium text-gray-700">{config.inputMultiplier}x</span>
                      </div>
                      <div className="flex items-center gap-1 text-gray-500">
                        <span>输出:</span>
                        <span className="font-mono font-medium text-gray-700">{config.outputMultiplier}x</span>
                      </div>
                      {(config.reasoningMultiplier || 0) > 0 && (
                        <div className="flex items-center gap-1 text-gray-500">
                          <span>思考:</span>
                          <span className="font-mono font-medium text-indigo-600">{config.reasoningMultiplier}x</span>
                        </div>
                      )}
                      {(config.cacheMultiplier || 0) > 0 && (
                        <div className="flex items-center gap-1 text-gray-500">
                          <span>缓存:</span>
                          <span className="font-mono font-medium text-green-600">{config.cacheMultiplier}x</span>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowPromptPicker(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors text-xs font-medium bg-white border-purple-200 hover:bg-purple-50 text-purple-700"
            title="从指令工坊选择并插入"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>选择提示词</span>
          </button>
        </div>

        <div className="relative">
          <textarea
            ref={promptTextareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isGenerating}
            className={`w-full ${embedded ? 'h-24' : 'h-36'} p-3 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 resize-none outline-none transition-all placeholder-gray-400 bg-gray-50/30 disabled:opacity-50`}
            placeholder="描述你希望AI如何改写当前节点，并生成结构化子节点..."
            autoFocus
          />
          <button
            onClick={handleSubmit}
            disabled={!prompt.trim() || isGenerating}
            className="absolute bottom-3 right-3 px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg shadow-lg hover:shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
          >
            {isGenerating ? (
              <div className="flex items-center text-xs whitespace-nowrap">
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5"></div>
                {loadingText}
              </div>
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-gray-400">按 Enter 发送，Shift + Enter 换行</span>
          {lastUsage && (
            <span className="text-purple-600/80 bg-purple-50 px-2 py-0.5 rounded border border-purple-100/50">
              💎 -{lastUsage.total_cost} (In: {lastUsage.input_tokens}, Out: {lastUsage.output_tokens})
            </span>
          )}
        </div>

        <PromptPickerDialog
          isOpen={showPromptPicker}
          onClose={() => setShowPromptPicker(false)}
          onPick={(content) => {
            insertPromptContent(content);
            setShowPromptPicker(false);
          }}
          pageSize={6}
          mode="modal"
          variant="compact"
          overlayClassName="bg-black/25 backdrop-blur-[1px]"
        />

      </div>
    </div>
  );

  if (embedded) {
    return dialogContent;
  }

  return (
    <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/25 backdrop-blur-[1px] p-4" onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()}>{dialogContent}</div>
    </div>
  );
};

export default AIGenerationDialog;
