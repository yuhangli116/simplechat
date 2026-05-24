import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronRight, Search, Settings, Video, X, Layers, Trash2, Users, Gift, MessageSquare, Zap, Sparkles, Receipt } from 'lucide-react';
import Pagination from '@/components/Pagination';

type GuideDetailSection = {
  title: string;
  points: string[];
};

type TextGuide = {
  id: string;
  title: string;
  category: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  overview: string[];
  sections: GuideDetailSection[];
};

type VideoGuide = {
  id: string;
  title: string;
  category: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  overview: string[];
  videoSrc: string;
};

type TextGuideModalProps = {
  isOpen: boolean;
  guide: TextGuide | null;
  onClose: () => void;
};

const TextGuideModal: React.FC<TextGuideModalProps> = ({ isOpen, guide, onClose }) => {
  if (!isOpen || !guide) return null;

  const Icon = guide.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center min-w-0">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mr-3 ${guide.iconBg} shrink-0`}>
              <Icon className={`w-5 h-5 ${guide.iconColor}`} />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold text-gray-900 truncate">{guide.title}</div>
              <div className="text-xs text-gray-500 mt-0.5">{guide.category}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-6">
            <div className="text-base font-semibold text-gray-900">总体介绍</div>
            <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc pl-5">
              {guide.overview.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>

          <div className="mt-8 space-y-8">
            {guide.sections.map((section) => (
              <div key={section.title} className="rounded-2xl border border-gray-100 p-6 bg-white">
                <div className="text-base font-semibold text-gray-900">{section.title}</div>
                <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc pl-5">
                  {section.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

type VideoGuideModalProps = {
  isOpen: boolean;
  guide: VideoGuide | null;
  onClose: () => void;
};

const VideoGuideModal: React.FC<VideoGuideModalProps> = ({ isOpen, guide, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!isOpen || !guide) return null;

  const Icon = guide.icon;
  const renderOverviewItem = (text: string) => {
    const idx = text.search(/[:：]/);
    if (idx <= 0) return text;
    const head = text.slice(0, idx);
    const tail = text.slice(idx + 1);
    const colon = text[idx];
    return (
      <>
        <span className="font-semibold text-gray-900">{head}</span>
        {colon}
        {tail}
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center min-w-0">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mr-3 ${guide.iconBg} shrink-0`}>
              <Icon className={`w-5 h-5 ${guide.iconColor}`} />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold text-gray-900 truncate">{guide.title}</div>
              <div className="text-xs text-gray-500 mt-0.5">{guide.category}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-6">
            <div className="text-base font-semibold text-gray-900">文字说明（先看这里）</div>
            <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc pl-5">
              {guide.overview.map((p) => (
                <li key={p}>{renderOverviewItem(p)}</li>
              ))}
            </ul>
          </div>

          <div className="mt-8 rounded-2xl border border-gray-100 p-6 bg-white">
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold text-gray-900">视频教程</div>
            </div>
            <div className="mt-4">
              <video ref={videoRef} src={guide.videoSrc} className="w-full rounded-xl bg-black" controls playsInline />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const videoGuides: VideoGuide[] = [
  {
    id: 'video-new-user',
    title: '新人入门指南',
    category: '视频教程',
    icon: Video,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    videoSrc: '/video/guanggao.MP4',
    overview: [
      '网站定位：一站式 AI 网文创作平台，涵盖创作工作区、社区模板、福利、提示词库、充值与记录、回收站',
      '我的作品：导图和章节一体化写作，把设定、大纲、正文放在同一部作品里管理',
      '回收站：误删内容先进入回收站可恢复，支持搜索筛选和批量操作，彻底删除不可撤销',
      '创作社区：浏览作品模板和提示词模板，一键点赞收藏预览克隆，快速拿到灵感和框架',
      '领取福利：新手签到和任务领钻石，免费体验 AI 写作，到账情况可在钻石记录核对',
      '提示词库：把常用提示词存起来，一键复制复用，长期积累出自己的高质量模板',
      '钻石充值：购买会员或加油包补充额度，系统优先消耗会员钻石避免到期浪费',
      '钻石记录：查看每次 AI 消费和每笔充值到账，流水清楚，出问题先来这里查',
    ],
  },
];

const textGuides: TextGuide[] = [
  {
    id: 'guide-my-works',
    title: '我的作品（工作区）',
    category: '创作指南',
    icon: Layers,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    overview: [
      '「我的作品」用于管理你的创作项目入口；进入项目后，会来到“工作区”进行大纲/设定/正文等编辑。',
      '工作区通常包含：思维导图（用于结构化梳理）+ 章节/正文编辑器（用于写作与润色）。',
      '你可以在工作区中随时导出备份，避免重要数据丢失。',
    ],
    sections: [
      {
        title: '这页能帮你做什么',
        points: [
          '查看你所有作品，快速找到“正在写/最近写过”的那一本。',
          '一键进入工作区继续写（大纲、设定、正文都在同一个作品里）。',
          '新建作品时建议先用模板起步：先有结构，再慢慢改成你的风格。',
        ],
      },
      {
        title: '打开作品后：工作区界面怎么理解',
        points: [
          '左侧“文件树”就是你的目录：章节、设定卡、思维导图都在这里。',
          '中间是编辑区：你点哪一页，就编辑哪一页（导图页/文本页显示不一样）。',
          '建议先把目录和框架搭好，再按章节顺序慢慢写，会更稳、更不容易写崩。',
        ],
      },
      {
        title: '写作顺序建议：先导图，再正文',
        points: [
          '思维导图适合把“世界观、人物关系、主线支线、伏笔”先梳理清楚。',
          '章节页就是写正文：你可以按“目标 → 冲突 → 转折 → 结尾钩子”去推进。',
          '写到一半发现设定要补、坑要记：先写进设定/导图里，避免后面忘了导致前后矛盾。',
        ],
      },
      {
        title: 'AI 怎么帮你写（更省事）',
        points: [
          '把常用指令存到“提示词库”，以后点一下就能用（扩写、润色、降 AI 味、补设定、写对话等）。',
          '每次 AI 生成会消耗钻石，明细在“钻石记录”里都能查到。',
          '生成前先确认你选的上下文是不是当前章节/设定，避免 AI 参考错内容写跑题。',
        ],
      },
      {
        title: '导出与备份（强烈建议）',
        points: [
          '思维导图支持导出为图片/文本/数据文件，方便发给别人看或做备份。',
          '正文支持导出为 HTML/Markdown，方便复制排版、发公众号/论坛等。',
          '整部作品可打包导出 ZIP：建议在“定大纲、改大版本、完结”这些关键节点备份一次。',
        ],
      },
      {
        title: '误删怎么办（别慌）',
        points: [
          '删掉的作品/页面不会立刻消失，会先进回收站，你可以随时恢复。',
          '回收站里“彻底删除”才是永久删除，删之前务必确认。',
        ],
      },
    ],
  },
  {
    id: 'guide-trash',
    title: '回收站',
    category: '数据保护',
    icon: Trash2,
    iconBg: 'bg-gray-200',
    iconColor: 'text-gray-600',
    overview: [
      '回收站用于集中管理被删除的作品/页面/提示词，提供“恢复”和“彻底删除”两类操作。',
      '回收站支持筛选、搜索、勾选批量处理，避免大量内容误删后难以找回。',
      '回收站内容默认保留 30 天，到期会自动永久删除，请及时处理重要内容。',
    ],
    sections: [
      {
        title: '怎么快速找到你要恢复的内容',
        points: [
          '先用类型筛选：全部 / 我的作品 / 提示词。',
          '再用搜索框搜标题关键词（比如作品名/提示词标题）。',
          '列表默认按删除时间排序：越新删的越靠前。',
        ],
      },
      {
        title: '批量恢复/批量删除（适合清理）',
        points: [
          '勾选多条后，可以一次性恢复或一次性彻底删除。',
          '系统会再次确认，避免你手滑清空。',
          '“清空回收站”会直接永久删除全部内容，通常只在确定不需要任何旧内容时使用。',
        ],
      },
      {
        title: '恢复后会回到哪里',
        points: [
          '提示词：恢复后回到“提示词库”。',
          '作品/章节/设定/导图：恢复后会回到工作区的文件树里。',
          '恢复后如果没立刻看到，建议刷新一下或回到工作区看看文件树是否已出现。',
        ],
      },
      {
        title: '彻底删除与保留期限（一定要看）',
        points: [
          '彻底删除不可撤销：删了就真的没了，无法找回。',
          '回收站默认只保留 30 天，快到期的内容要及时恢复或先导出备份。',
          '长篇作品建议先导出 ZIP 备份，再决定是否彻底删除。',
        ],
      },
    ],
  },
  {
    id: 'guide-community',
    title: '创作社区',
    category: '模板与提示词共享',
    icon: Users,
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    overview: [
      '创作社区用于发现与分享：包含作品模板与提示词模板两大内容类型。',
      '社区内容默认“官方优先”，并结合点赞数、浏览/使用量与创建时间综合排序，优质内容更容易被看到。',
      '你可以点赞收藏、预览、克隆到自己的工作区，也可以发布自己的模板供他人使用。',
    ],
    sections: [
      {
        title: '社区里有什么（先知道入口）',
        points: [
          '作品模板：别人分享的“作品结构/设定/章节框架”。',
          '提示词模板：别人分享的“好用提示词”，你可以导入到自己的提示词库。',
          '收藏列表：你点过赞的内容都会在这里，方便下次再用。',
          '我的模板：你发布过的内容在这里管理（只有你自己能改/删）。',
          '创建模板：把你自己的模板发布出来（作品模板最多 10 个；提示词模板最多 20 个）。',
        ],
      },
      {
        title: '点赞/收藏有什么用',
        points: [
          '点赞会让模板更靠前，也会自动进入你的“收藏列表”。',
          '预览/使用会增加浏览或使用次数（系统会做去重，避免刷量）。',
          '卡片上会显示点赞、浏览等数据，帮你快速判断哪些更受欢迎、更值得参考。',
        ],
      },
      {
        title: '怎么把社区模板用到你的作品里',
        points: [
          '建议先点开预览：看清楚模板结构、适用题材、内容质量再决定要不要用。',
          '克隆就是“复制一份到你自己这里”：克隆后你怎么改都不会影响原作者。',
          '有些模板会统计下载/导出次数，用来衡量模板是否真的好用。',
        ],
      },
      {
        title: '发布模板时要注意什么',
        points: [
          '你只能编辑/删除你自己发布的模板；官方模板不能改。',
          '删除模板一般不可恢复，删除前会二次确认，建议谨慎。',
          '模板标题尽量写清用途，分类选对，内容里写明“适合什么题材/怎么使用”，别人更愿意收藏。',
        ],
      },
    ],
  },
  {
    id: 'guide-welfare',
    title: '领取福利（福利中心）',
    category: '免费钻石获取',
    icon: Gift,
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    overview: [
      '福利中心提供新手签到与任务奖励，帮助你免费获取钻石，用于 AI 生成与创作增强。',
      '签到奖励适用于注册 7 天内的新用户；任务奖励包含一次性任务与每日任务。',
      '完成后钻石会自动到账，可在页面顶部余额处实时查看，并可一键跳转到充值页面。',
    ],
    sections: [
      {
        title: '新手签到怎么拿奖励',
        points: [
          '每天点一次“立即签到”就能领钻石。',
          '已领过的会显示“已完成”，今天能领的会高亮提示。',
          '新手签到只在注册 7 天内有效，建议尽量连续签到把奖励领满。',
        ],
      },
      {
        title: '任务奖励怎么做（点“去完成”）',
        points: [
          '首次 AI 生成：随便完成一次 AI 生成，就能领一次奖励。',
          '首次创建模板：去创作社区创建一个作品模板或提示词模板，就能领一次奖励。',
          '观看激励视频：看够 80% 就能领取当天奖励。',
        ],
      },
      {
        title: '激励视频怎么领（看这段就够了）',
        points: [
          '视频不支持快进（拖动进度条会被系统拦截）。',
          '看够 80% 后，会出现领取按钮，点一下就能领钻石。',
          '如果打不开/没声音，先检查浏览器是否拦截了播放或静音策略，再刷新重试。',
        ],
      },
      {
        title: '常见问题',
        points: [
          '没登录领不了：请先登录再来签到/做任务。',
          '不知道钻石从哪来/花到哪去：去“钻石记录”里看流水，一目了然。',
        ],
      },
    ],
  },
  {
    id: 'guide-prompts',
    title: '提示词库（我的提示词库）',
    category: 'AI 指令管理',
    icon: MessageSquare,
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    overview: [
      '提示词库用于管理你常用的 AI 指令：标题 + 一级标签 + 二级标签 + 内容，结构清晰便于复用。',
      '支持分类切换、预览、复制、编辑、删除（删除后进入回收站可恢复）。',
      '支持从创作社区一键导入喜欢的提示词，让你的“咒语库”越用越强。',
    ],
    sections: [
      {
        title: '提示词怎么写才好用（标题/标签怎么填）',
        points: [
          '标题：写“你要它做什么”，越直白越好（例：降 AI 味、扩写成 2000 字、强化对话）。',
          '一级标签：大分类，用来快速筛选（例：世界观、角色、润色、剧情大纲）。',
          '二级标签：更细的关键词，用空格分隔（例：对话 场景描写 节奏加快）。',
        ],
      },
      {
        title: '新增/修改提示词（一步一步填）',
        points: [
          '点击“新增提示词”，按顺序填写：标题 → 一级标签 → 二级标签 → 提示词正文。',
          '标签可以下拉选，也可以自己手动输入，适合你自己的写作习惯。',
          '修改时直接点“修改”，改完保存即可。',
        ],
      },
      {
        title: '查看/复制/删除（最常用）',
        points: [
          '点击卡片可预览完整内容，方便确认是不是你要的那条提示词。',
          '点“复制”即可一键复制到剪贴板（失败会提示你手动复制）。',
          '删除后会进回收站，可以恢复；系统也会二次确认，避免误删。',
        ],
      },
      {
        title: '怎么在写作时用得更爽',
        points: [
          '把高频需求做成模板：扩写、润色、写对白、补设定、查矛盾，越常用越值得存。',
          '优先用你“验证过效果”的提示词，输出更稳定、少返工。',
          '配合上下文使用：把当前章节/设定带给 AI，输出更贴合、不跑题。',
        ],
      },
    ],
  },
  {
    id: 'guide-membership',
    title: '钻石充值（充值会员）',
    category: '账户与付费',
    icon: Zap,
    iconBg: 'bg-yellow-100',
    iconColor: 'text-yellow-600',
    overview: [
      '充值页面提供两类商品：购买会员（有有效期）与加油包（永久有效）。',
      '购买完成后钻石会实时到账，可用于 AI 生成等消耗场景。',
      '系统扣费规则为：优先消耗会员钻石，其次消耗加油包钻石。',
    ],
    sections: [
      {
        title: '买会员还是买加油包？怎么选',
        points: [
          '会员：有有效期，适合你这段时间写得很勤、会集中用 AI 的情况。',
          '加油包：永久有效，适合写作频率不稳定，或者当作“备用额度”。',
          '简单选法：近期冲刺用会员；长期慢慢写用加油包。',
        ],
      },
      {
        title: '怎么买（当前是模拟支付）',
        points: [
          '选好套餐后点“立即购买”，系统会先创建订单。',
          '会弹出确认框：显示商品、金额、到账钻石；你点确认就会立刻到账。',
          '如果点取消，订单会显示为待支付，你可以以后再处理。',
        ],
      },
      {
        title: '到账、叠加、扣费规则（别踩坑）',
        points: [
          '会员没过期时再买会自动顺延；过期后再买从当前时间重新算。',
          '系统会优先用“会员钻石”，再用“加油包钻石”，避免会员到期浪费。',
          '到账/消耗都能在“钻石记录”里查到，建议遇到疑问先去看流水。',
        ],
      },
      {
        title: '常见问题',
        points: [
          '订单异常或不到账：可以带上“钻石记录/订单信息”联系管理员排查。',
          '不要在多设备同时狂点购买，容易产生多笔待支付订单。',
        ],
      },
    ],
  },
  {
    id: 'guide-records',
    title: '钻石记录',
    category: '对账与明细',
    icon: Receipt,
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    overview: [
      '钻石记录用于查看两类明细：消费记录（AI 调用消耗）与充值记录（到账与订单状态）。',
      '记录支持分页浏览，适合长期对账与排查异常消耗。',
      '该页面需要登录后才能查看，避免账户隐私泄露。',
    ],
    sections: [
      {
        title: '消费记录：看你每次 AI 花了多少',
        points: [
          '这里记录每次 AI 调用：时间、模型、输入/输出 tokens，一次花费清清楚楚。',
          '会显示总消耗，并拆分“会员钻石/加油包钻石”分别用了多少。',
          '如果某次花费特别高，通常是上下文太长或输入太多内容，可以回头优化提示词/上下文。',
        ],
      },
      {
        title: '充值记录：看你买了什么、到账了没',
        points: [
          '这里记录每笔充值/会员/加油包订单：金额、到账钻石、时间、状态。',
          '状态包括：支付成功、待支付、已退款、支付失败等。',
          '如显示成功但到账不对，可以凭这里的记录联系管理员核对。',
        ],
      },
    ],
  },
];

type CardItem = {
  id: string;
  title: string;
  category: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  summary: string;
  kind: 'video' | 'text';
};

const Guide = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'video' | 'text'>('video');
  const [page, setPage] = useState(1);
  const [selectedTextGuide, setSelectedTextGuide] = useState<TextGuide | null>(null);
  const [selectedVideoGuide, setSelectedVideoGuide] = useState<VideoGuide | null>(null);

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchTerm]);

  const cardItems: CardItem[] = useMemo(() => {
    if (activeTab === 'video') {
      return videoGuides.map((g) => ({
        id: g.id,
        title: g.title,
        category: g.category,
        icon: g.icon,
        iconBg: g.iconBg,
        iconColor: g.iconColor,
        summary: '点击查看：文字说明 + 视频（可拖动进度条）',
        kind: 'video' as const,
      }));
    }

    const q = searchTerm.trim().toLowerCase();
    return textGuides
      .filter((g) => (q ? g.title.toLowerCase().includes(q) : true))
      .map((g) => ({
        id: g.id,
        title: g.title,
        category: g.category,
        icon: g.icon,
        iconBg: g.iconBg,
        iconColor: g.iconColor,
        summary: g.overview[0] || '',
        kind: 'text' as const,
      }));
  }, [activeTab, searchTerm]);

  const PAGE_SIZE = 8;
  const totalPages = Math.max(1, Math.ceil(cardItems.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pagedItems = cardItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openItem = (item: CardItem) => {
    if (item.kind === 'video') {
      const g = videoGuides.find((x) => x.id === item.id) || null;
      setSelectedVideoGuide(g);
      return;
    }
    const g = textGuides.find((x) => x.id === item.id) || null;
    setSelectedTextGuide(g);
  };

  return (
    <div className="h-full min-h-0 bg-gray-50 flex flex-col overflow-hidden">
      <div className="bg-white border-b border-gray-200 px-8 py-8 shrink-0">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">教程专区</h1>
        <div className="max-w-2xl relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={activeTab === 'text' ? '搜索图文指南...' : '视频教程无需搜索'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={activeTab === 'video'}
            className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      <div className="px-8 py-6 flex space-x-4 shrink-0">
        <button
          onClick={() => setActiveTab('video')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center ${
            activeTab === 'video' ? 'bg-black text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <Video className="w-4 h-4 mr-2" />
          视频教程
        </button>
        <button
          onClick={() => setActiveTab('text')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center ${
            activeTab === 'text' ? 'bg-black text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <BookOpen className="w-4 h-4 mr-2" />
          图文指南
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-8 pt-0">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {cardItems.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {pagedItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.id} onClick={() => openItem(item)} className="p-6 hover:bg-gray-50 transition-colors flex items-start group cursor-pointer">
                    <div className={`w-20 h-20 rounded-2xl flex-shrink-0 mr-6 flex items-center justify-center ${item.iconBg}`}>
                      <Icon className={`w-10 h-10 ${item.iconColor} group-hover:scale-110 transition-transform duration-300`} />
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <div className="flex items-center mb-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded mr-3 ${
                            item.kind === 'video' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-green-50 text-green-700 border border-green-100'
                          }`}
                        >
                          {item.category}
                        </span>
                        <h3 className="text-xl font-bold text-gray-900 truncate group-hover:text-blue-600 transition-colors">{item.title}</h3>
                      </div>
                      <p className="text-gray-500 text-sm mb-4 line-clamp-2 pr-12">{item.summary}</p>
                      <div className="flex items-center text-sm font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-[-10px] group-hover:translate-x-0 duration-300">
                        打开查看 <ChevronRight className="w-4 h-4 ml-1" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-20 text-center text-gray-500 flex flex-col items-center">
              <Search className="w-12 h-12 mb-4 text-gray-300" />
              <p>没有找到相关内容</p>
            </div>
          )}
        </div>

        {cardItems.length > 0 && totalPages > 1 && (
          <div className="pt-4">
            <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
          </div>
        )}
      </div>

      <TextGuideModal isOpen={!!selectedTextGuide} guide={selectedTextGuide} onClose={() => setSelectedTextGuide(null)} />
      <VideoGuideModal isOpen={!!selectedVideoGuide} guide={selectedVideoGuide} onClose={() => setSelectedVideoGuide(null)} />
    </div>
  );
};

export default Guide;
