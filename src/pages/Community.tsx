import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, Eye, CheckCircle, Sparkles, BookOpen, Star, User, X, Folder, FileText, ChevronRight, ChevronDown, PlusCircle, Plus, Trash2, Pencil } from 'lucide-react';
import { useFileStore, FileNode } from '@/store/useFileStore';
import { useAuthStore } from '@/store/useAuthStore';
import { usePromptStore } from '@/store/usePromptStore';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/lib/supabase';
import { loadWorkspaceTree, persistWorkTree } from '@/lib/workspacePersistence';
import { Database } from '@/types/supabase';
import Pagination from '@/components/Pagination';

type Template = Database['public']['Tables']['community_templates']['Row'];

interface Skill {
  id: string;
  title: string;
  description: string;
  category: string;
  prompt_text: string;
  author_name: string;
  is_official: boolean;
  is_public?: boolean;
  creator_id?: string | null;
  created_at?: string | null;
  uses: number;
  likes: number;
  tags: string[];
  cover_color: string;
}

type OutlineTreeNode = {
  id: string;
  name: string;
  children: OutlineTreeNode[];
};

const Community = () => {
  const [mainTab, setMainTab] = useState<'templates' | 'skills' | 'mine' | 'favorites'>('templates');
  const [templateTab, setTemplateTab] = useState('webnovel');
  const [skillTab, setSkillTab] = useState('ai_role');
  const { addNode, setFiles } = useFileStore();
  const { prompts, addPrompt, updatePrompt } = usePromptStore();
  const { user, profile } = useAuthStore();
  const navigate = useNavigate();
  const [resources, setResources] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [collectedSkills, setCollectedSkills] = useState<string[]>([]);
  const [userSkills, setUserSkills] = useState<Skill[]>([]);
  const [likedTemplateIds, setLikedTemplateIds] = useState<string[]>([]);
  const [likedSkillIds, setLikedSkillIds] = useState<string[]>([]);
  const [likedOfficialSkillIds, setLikedOfficialSkillIds] = useState<string[]>(() => {
    try {
      const saved = window.localStorage.getItem('likedOfficialSkills');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [officialSkillMetrics, setOfficialSkillMetrics] = useState<Record<string, { likes: number; uses: number }>>(() => {
    try {
      const saved = window.localStorage.getItem('officialSkillMetrics');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [collectedTemplateIds, setCollectedTemplateIds] = useState<string[]>([]);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [previewStructure, setPreviewStructure] = useState<any>(null);
  const [selectedPreviewNodeId, setSelectedPreviewNodeId] = useState<string | null>(null);
  const [expandedPreviewFolders, setExpandedPreviewFolders] = useState<Record<string, boolean>>({});
  const [previewSkill, setPreviewSkill] = useState<Skill | null>(null);
  const [pageByView, setPageByView] = useState<Record<string, number>>({});
  const [mineTab, setMineTab] = useState<'templates' | 'skills'>('templates');
  const [favoritesTab, setFavoritesTab] = useState<'templates' | 'skills'>('templates');
  const [isCreating, setIsCreating] = useState(false);
  const [createTab, setCreateTab] = useState<'template' | 'skill'>('template');
  const [collapsedOutlineNodeIds, setCollapsedOutlineNodeIds] = useState<Record<string, boolean>>({});
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [newTemplateIsPublic, setNewTemplateIsPublic] = useState(true);
  const [newSkillIsPublic, setNewSkillIsPublic] = useState(true);
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');
  const [newTemplateCategory, setNewTemplateCategory] = useState('网文小说');
  const [newTemplateMindMapCount, setNewTemplateMindMapCount] = useState(1);
  const [newTemplateChapterCount, setNewTemplateChapterCount] = useState(10);
  const [newTemplateMindMaps, setNewTemplateMindMaps] = useState<
    Array<{ name: string; outlineText: string; outlineMode: 'visual' | 'text'; outlineTree: OutlineTreeNode[] }>
  >([{ name: '思维导图1', outlineText: '', outlineMode: 'visual', outlineTree: [] }]);
  const [newSkillTitle, setNewSkillTitle] = useState('');
  const [newSkillDescription, setNewSkillDescription] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState<string>('ai_role');
  const [newSkillPromptText, setNewSkillPromptText] = useState('');

  const coverColors = useMemo(
    () => [
      'bg-gradient-to-br from-purple-400 to-indigo-500',
      'bg-gradient-to-br from-orange-400 to-red-500',
      'bg-gradient-to-br from-sky-400 to-blue-500',
      'bg-gradient-to-br from-emerald-400 to-green-500',
      'bg-gradient-to-br from-pink-400 to-rose-500',
      'bg-gradient-to-br from-amber-400 to-orange-500',
      'bg-gradient-to-br from-teal-400 to-cyan-500',
    ],
    []
  );

  const userWorkTemplateCount = useMemo(() => {
    if (!user?.id) return 0;
    return resources.filter((t) => !t.is_official && !String(t.id).startsWith('mock-') && t.creator_id === user.id).length;
  }, [resources, user?.id]);

  const userSkillTemplateCount = useMemo(() => {
    if (!user?.id) return 0;
    return userSkills.filter((s) => !s.is_official && s.creator_id === user.id).length;
  }, [userSkills, user?.id]);

  const subTabsRef = useRef<HTMLDivElement>(null);

  const resetCreateState = () => {
    setCreateTab('template');
    setEditingTemplateId(null);
    setEditingSkillId(null);
    setNewTemplateIsPublic(true);
    setNewSkillIsPublic(true);
    setNewTemplateTitle('');
    setNewTemplateDescription('');
    setNewTemplateCategory('网文小说');
    setNewTemplateMindMapCount(1);
    setNewTemplateChapterCount(10);
    setNewTemplateMindMaps([{ name: '思维导图1', outlineText: '', outlineMode: 'visual', outlineTree: [] }]);
    setNewSkillTitle('');
    setNewSkillDescription('');
    setNewSkillCategory('ai_role');
    setNewSkillPromptText('');
    setCollapsedOutlineNodeIds({});
  };

  const mainCategories = [
    { id: 'templates', label: '作品模板', icon: <BookOpen className="w-4 h-4 mr-1" /> },
    { id: 'skills', label: '提示词库', icon: <Sparkles className="w-4 h-4 mr-1" /> },
    { id: 'mine', label: '我的模板', icon: <User className="w-4 h-4 mr-1" /> },
    { id: 'favorites', label: '收藏列表', icon: <Star className="w-4 h-4 mr-1" /> },
  ];

  const createCategories = [
    { id: 'template', label: '作品模板' },
    { id: 'skill', label: '提示词模板' },
  ];

  const templateCategories = [
    { id: 'webnovel', label: '网文小说' },
    { id: 'short', label: '短故事' },
    { id: 'script', label: '剧本类' },
  ];

  const skillCategories = [
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
    if (c === 'specialized') return 'other';
    if (skillCategories.some((it) => it.id === c)) return c;
    return 'other';
  };

  const favoritesCategories = [
    { id: 'templates', label: '作品模板' },
    { id: 'skills', label: '提示词模板' },
  ];

  const mineCategories = [
    { id: 'templates', label: '作品模板' },
    { id: 'skills', label: '提示词模板' },
  ];

  useEffect(() => {
    const fetchTemplates = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('community_templates')
          .select('*')
          .order('is_official', { ascending: false })
          .order('likes', { ascending: false })
          .order('created_at', { ascending: false });
        
        if (error) {
          console.error('Error fetching templates:', error);
        } else {
          setResources(data || []);
        }
      } catch (err) {
        console.error('Unexpected error:', err);
      } finally {
        setLoading(false);
      }
    };

    const loadCollectedSkills = () => {
      const saved = localStorage.getItem('collectedSkills');
      if (saved) {
        setCollectedSkills(JSON.parse(saved));
      }
    };

    const persistLikedOfficialSkills = () => {
      try {
        window.localStorage.setItem('likedOfficialSkills', JSON.stringify(likedOfficialSkillIds));
      } catch {
        return;
      }
    };

    fetchTemplates();
    loadCollectedSkills();
    persistLikedOfficialSkills();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('likedOfficialSkills', JSON.stringify(likedOfficialSkillIds));
    } catch {
      return;
    }
  }, [likedOfficialSkillIds]);

  useEffect(() => {
    try {
      window.localStorage.setItem('officialSkillMetrics', JSON.stringify(officialSkillMetrics));
    } catch {
      return;
    }
  }, [officialSkillMetrics]);

  useEffect(() => {
    if (likedOfficialSkillIds.length === 0) return;
    setOfficialSkillMetrics((prev) => {
      let changed = false;
      const next = { ...prev };
      likedOfficialSkillIds.forEach((id) => {
        const current = next[id];
        if (!current) {
          next[id] = { likes: 1, uses: 0 };
          changed = true;
          return;
        }
        if ((current.likes ?? 0) <= 0) {
          next[id] = { ...current, likes: 1 };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [likedOfficialSkillIds]);

  useEffect(() => {
    if (!user?.id) {
      setLikedSkillIds([]);
      return;
    }
    const run = async () => {
      const { data, error } = await supabase
        .from('skill_template_likes')
        .select('skill_template_id')
        .eq('user_id', user.id);
      if (error) return;
      setLikedSkillIds((data || []).map((r: any) => r.skill_template_id));
    };
    run();
  }, [user?.id]);

  useEffect(() => {
    if (!subTabsRef.current) return;
    subTabsRef.current.scrollLeft = 0;
  }, [isCreating, mainTab]);

  useEffect(() => {
    const fetchUserSkills = async () => {
      if (!user?.id) {
        setUserSkills([]);
        return;
      }
      const { data, error } = await supabase
        .from('community_skill_templates')
        .select('*')
        .order('is_official', { ascending: false })
        .order('likes', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Error fetching skill templates:', error);
        return;
      }
      const mapped: Skill[] = (data || []).map((s: any) => ({
        id: s.id,
        title: s.title,
        description: s.description || '暂无描述',
        category: normalizeSkillCategory(s.category),
        prompt_text: s.prompt_text,
        author_name: s.author_name || '用户',
        is_official: !!s.is_official,
        is_public: s.is_public ?? true,
        creator_id: s.creator_id || null,
        created_at: s.created_at || null,
        uses: s.uses ?? 0,
        likes: s.likes ?? 0,
        tags: Array.isArray(s.tags) ? s.tags : [],
        cover_color: s.cover_color || 'bg-gradient-to-br from-purple-400 to-indigo-500',
      }));
      setUserSkills(mapped);
    };

    fetchUserSkills();
  }, [user?.id]);

  useEffect(() => {
    const target = Math.max(1, Math.min(20, Math.floor(Number(newTemplateMindMapCount) || 1)));
    if (target !== newTemplateMindMapCount) {
      setNewTemplateMindMapCount(target);
      return;
    }

    setNewTemplateMindMaps((prev) => {
      const next = [...prev];
      if (next.length < target) {
        for (let i = next.length; i < target; i += 1) {
          next.push({ name: `思维导图${i + 1}`, outlineText: '', outlineMode: 'visual', outlineTree: [] });
        }
      } else if (next.length > target) {
        next.length = target;
      }
      return next;
    });
  }, [newTemplateMindMapCount]);

  useEffect(() => {
    const loadTemplateInteractions = async () => {
      if (!user?.id) {
        setLikedTemplateIds([]);
        setCollectedTemplateIds([]);
        return;
      }

      const [{ data: likesData }, { data: collectedData }] = await Promise.all([
        supabase
          .from('template_likes')
          .select('template_id')
          .eq('user_id', user.id)
          .then((res: any) => (res.error ? { data: [] } : res)),
        supabase
          .from('user_templates')
          .select('template_id')
          .eq('user_id', user.id)
          .then((res: any) => (res.error ? { data: [] } : res))
      ]);

      setLikedTemplateIds((likesData || []).map((r: any) => r.template_id));
      setCollectedTemplateIds((collectedData || []).map((r: any) => r.template_id));
    };

    loadTemplateInteractions();
  }, [user?.id]);

  const getNormalizedTemplateStructure = (template: Template) => {
    let structure: any = template.content;
    if (typeof structure === 'string') {
      try {
        structure = JSON.parse(structure);
      } catch {
        return null;
      }
    }

    const createBasicMindMapContent = (rootLabel: string, childrenLabels: string[]) => {
      const rootId = 'root';
      const childIds = ['c1', 'c2', 'c3'];
      const positions = [
        { x: 200, y: -120 },
        { x: 200, y: 0 },
        { x: 200, y: 120 },
      ];

      const nodes = [
        {
          id: rootId,
          type: 'mindMap',
          data: { label: rootLabel, isRoot: true },
          position: { x: 0, y: 0 },
        },
        ...childrenLabels.slice(0, 3).map((label, idx) => ({
          id: childIds[idx],
          type: 'mindMap',
          data: { label },
          position: positions[idx],
        })),
      ];

      const edges = childrenLabels.slice(0, 3).map((_, idx) => ({
        id: `e-root-${childIds[idx]}`,
        source: rootId,
        target: childIds[idx],
        type: 'straight',
      }));

      return { nodes, edges };
    };

    if (template.title.includes('小说通用模板') && (!structure?.children || structure.children.length === 0)) {
      structure = {
        ...(structure || {}),
        type: 'folder',
        name: structure?.name || '小说通用模板',
        children: [
          {
            name: '作品相关',
            type: 'folder',
            children: [
              {
                name: '作品大纲',
                type: 'mindmap',
                mindMapType: 'outline',
                savedMindMap: createBasicMindMapContent('作品大纲', ['开头', '发展', '高潮']),
              },
              {
                name: '世界设定',
                type: 'mindmap',
                mindMapType: 'world',
                savedMindMap: createBasicMindMapContent('世界设定', ['地理', '历史', '势力']),
              },
              {
                name: '角色塑造',
                type: 'mindmap',
                mindMapType: 'character',
                savedMindMap: createBasicMindMapContent('角色塑造', ['主角', '配角', '反派']),
              },
              {
                name: '事件细纲',
                type: 'mindmap',
                mindMapType: 'event',
                savedMindMap: createBasicMindMapContent('事件细纲', ['起因', '经过', '结果']),
              },
            ],
          },
          {
            name: '正文情节',
            type: 'folder',
            children: Array.from({ length: 10 }, (_, i) => ({
              name: `第${i + 1}章`,
              type: 'file',
            })),
          },
        ],
      };
    }

    const addPreviewIds = (node: any): any => {
      const pid = node.__pid || uuidv4();
      return {
        ...node,
        __pid: pid,
        children: Array.isArray(node.children) ? node.children.map(addPreviewIds) : undefined,
      };
    };

    return structure ? addPreviewIds(structure) : null;
  };

  const toggleCollectSkill = (skillId: string) => {
    let newCollected;
    if (collectedSkills.includes(skillId)) {
      newCollected = collectedSkills.filter(id => id !== skillId);
    } else {
      newCollected = [...collectedSkills, skillId];
    }
    setCollectedSkills(newCollected);
    localStorage.setItem('collectedSkills', JSON.stringify(newCollected));
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

【创作规范】
- 每章字数控制在 2000-3000 字
- 段落不宜过长，多分段便于阅读
- 对话要符合人物性格
- 适当留白，给读者想象空间
- 结尾要有悬念，吸引读者继续阅读

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

【短篇要点】
- 聚焦一个核心冲突，不要支线过多
- 人物少而精，每个人物都要有其作用
- 开头和结尾要呼应
- 追求情感冲击力或思想深度

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

[动作描述] 继续描写

【剧本结构】
▌第一幕 - 第1-30页
- 开场画面（展示主角和世界）
- 主题呈现（通过对话或事件暗示主题）
- 铺垫（介绍主要人物关系和设定）
- 催化事件（打破平衡的事件）
- 争论（主角内心挣扎或与他人争论）
- 第二幕衔接（主角做出决定，故事进入第二幕）

▌第二幕前半 - 第30-60页
- B故事开启（通常是感情线或副线）
- 游戏时间（主角尝试适应新环境）
- 中点（重大转折，剧情变得严重）
- 坏蛋逼近（压力逐渐增大）
- 一无所有（主角跌入谷底）

▌第二幕后半 - 第60-90页
- 灵魂黑夜（主角最绝望的时刻）
- 第三幕衔接（主角找到希望或新方法）

▌第三幕 - 第90-120页
- 结局（解决问题，展示变化）
- 终场画面（与开场呼应）

【对话要点】
- 每个人物说话方式不同
- 对话要推动剧情或展现人物
- 潜台词比直白表达更有力量
- 避免 exposition dump（不要用对话直白解释设定）

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
1. **节奏调整**
   - 检查情节节奏是否紧凑
   - 删除冗余描写，加快节奏
   - 在关键处适当放慢，营造张力

2. **悬念加强**
   - 在章节结尾增加悬念
   - 适当埋下伏笔
   - 制造信息差，让读者好奇

3. **冲突升级**
   - 让冲突更激烈
   - 增加 stakes（利害关系）
   - 让主角面临更艰难的选择

4. **情感深化**
   - 增强人物情感表达
   - 让情感变化更有层次
   - 增加情感共鸣点

5. **细节丰富**
   - 增强画面感
   - 丰富感官描写（视、听、触、嗅、味）
   - 让场景更生动

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
1. **符合人设**
   - 人物的教育背景、性格、身份决定说话方式
   - 文化程度高的人用词更文雅
   - 性格急躁的人说话更直接
   - 古代人和现代人说话方式不同

2. **推动剧情**
   - 对话要传达信息或推动情节
   - 避免无意义的闲聊
   - 每句对话都要有其目的

3. **潜台词**
   - 人物说的 ≠ 人物想的
   - 通过语气、动作、上下文暗示真实想法
   - 让对话更有嚼头

4. **个性化特征**
   - 给人物一个口头禅
   - 特定的用词习惯
   - 独特的语速和节奏

5. **符合情境**
   - 紧张时说话简短
   - 放松时可以闲聊
   - 情绪激动时可能语无伦次

【常见问题修正】
- ❌ "你是谁？" → ⚪ "敢问阁下尊姓大名？"（古人）
- ❌ "我很生气" → ⚪ 动作描写 + 简短有力的话
- ❌ 大段独白 → ⚪ 拆分成对话和动作

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
1. **视觉（最重要）**
   - 颜色、形状、光影、动态
   - 用具体比喻，不要笼统
   - ❌"很美" → ⚪"月光像碎银般洒在湖面上"

2. **听觉**
   - 环境音、人声、特殊音效
   - 用拟声词增加真实感
   - 寂静也是一种声音

3. **触觉**
   - 温度、质感、风力
   - 皮肤的触感能增强代入感

4. **嗅觉**
   - 气味能唤起记忆和情感
   - 不同场景有不同的气味

5. **味觉（较少用但有效）**
   - 空气中的味道
   - 人物尝到的东西

【写景原则】
- 景为情服务，写景是为了烘托情绪
- 不要为写景而写景
- 选择有代表性的细节，不要面面俱到
- 动静结合，让场景活起来

【示例对比】
❌ 原版："夜晚的森林很可怕"
✅ 优化版："月光透过树冠，在地上投下斑驳的影子。风吹过树叶，发出沙沙的声响，像是有人在窃窃私语。空气中弥漫着潮湿的泥土味，偶尔传来远处猫头鹰的叫声，让他不禁打了个寒颤。"

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
      description: '把情节写得更有画面、更有节奏、更有冲突推进',
      category: 'chapter_scene',
      prompt_text: `你是一位网文正文写作教练。请把我提供的正文段落进行“可读性增强”，目标是：更清晰、更有画面、更有节奏、更能推进情节。

【硬性要求】
1) 保留原剧情信息与关键事实，不要改动设定
2) 增强动作链与因果，让读者看得懂“发生了什么”
3) 强化冲突与目标：人物在争什么、想要什么
4) 对话要有目的（推进情节/暴露信息/塑造人物）
5) 适当加入细节，但避免无意义堆砌

【输出格式】
- 先给出“问题清单”（3-8条）
- 再给出“优化后的正文”（保持原叙述视角与人称）
- 最后给出“可选增强点”（可替换的金句/更强的结尾悬念 1-3条）

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
1. **外在形象**
   - 外貌描写（不要千人一面）
   - 标志性特征（伤疤、饰品、习惯性动作）
   - 着装风格

2. **内在性格**
   - 核心性格特点
   - 性格的矛盾性（看似粗鲁实则细腻）
   - 性格的成长变化

3. **背景故事**
   - 过去经历如何塑造了现在的他
   - 心结和创伤
   - 人生目标和动机

4. **人物关系**
   - 与主角的关系
   - 与其他角色的互动
   - 关系的变化发展

5. **人物弧光**
   - 开始时是什么样
   - 经历了什么改变
   - 最后变成什么样

【人物塑造技巧】
- **展示而非告知**：通过行动、对话展现性格，不要直接说"他很勇敢"
- **给人物缺点**：完美的人物不真实，有缺点才可爱
- **给人物秘密**：每个人都有不想让人知道的事
- **给人物反差**：外表和内心的反差，人前和人后的反差

【示例】
❌ 扁平："小明是个勇敢的人"
✅ 立体："小明看起来瘦瘦小小的，说话也细声细气。但上次遇到坏人时，他第一个冲了上去，把大家护在身后——虽然事后他腿抖了半小时。"

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
▌核心设定
- 作品类型（玄幻/都市/言情/悬疑等）
- 时代背景
- 世界观核心设定
- 核心主题

▌人物设定
- 主角（姓名、性格、目标、成长弧光）
- 主要配角（3-5个）
- 反派（动机、特点、与主角的冲突）
- 人物关系图

▌故事主线
- 核心冲突（主角想要什么 vs 什么阻碍他）
- 故事起点
- 故事终点
- 核心悬念

▌分卷/分篇大纲（建议3-5卷）
第一卷：
- 卷目标
- 主要事件
- 高潮点
- 结尾悬念

第二卷：
...

▌章节细纲（可选，建议前10-20章）
第1章：
- 章节目标
- 主要情节
- 结尾悬念

第2章：
...

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
▌基本信息
- 姓名：
- 年龄：
- 性别：
- 职业/身份：

▌外在形象
- 外貌描写：
- 身高/体型：
- 标志性特征：
- 着装风格：

▌性格特点
- 核心性格：
- 优点：
- 缺点：
- 口头禅/习惯动作：

▌背景故事
- 童年/成长经历：
- 重要人生事件：
- 心结/创伤：

▌人物目标
- 短期目标：
- 长期目标：
- 内心深层渴望：

▌人物弧光
- 开始时：
- 经历事件：
- 结束时：

▌人物关系
- 与主要配角的关系：
- 与反派的关系：

【配角设计要点】
- 每个配角都要有存在的意义
- 配角要能反衬或帮助主角
- 配角也可以有自己的小故事
- 不要让配角抢了主角的戏

【反派设计要点】
- 反派也要有自己的动机和逻辑
- 不要把反派写得太愚蠢
- 反派可以有魅力（迷人的反派）
- 反派和主角可以有相似之处

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
▌地理环境
- 大陆/国家划分
- 重要地理特征（山脉、河流、海洋）
- 气候特点
- 特殊地点（秘境、险地、圣地）

▌历史背景
- 世界起源
- 重要历史事件
- 王朝/时代更替
- 传说与神话

▌种族与生物
- 智慧种族（人类、精灵、兽人等）
- 种族特点、文化、分布
- 普通生物
- 特殊/神话生物

▌社会结构
- 政治制度
- 社会阶层
- 重要组织/势力
- 法律与规则

▌力量体系（如适用）
- 力量等级划分
- 修炼/升级方式
- 特殊能力
- 限制与代价

▌经济系统
- 货币
- 主要产业
- 贸易
- 物价水平

▌文化与习俗
- 宗教信仰
- 节日庆典
- 礼仪风俗
- 艺术与娱乐

▌日常生活
- 衣食住行
- 通讯方式
- 交通方式
- 教育

【世界观构建原则】
- 自洽性：设定之间不能矛盾
- 实用性：设定要为故事服务
- 熟悉感：让读者能快速理解
- 新奇感：要有独特的创意
- 留白：不要把一切都讲死，留想象空间

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
1. **内心冲突**（人物 vs 自己）
   - 道德抉择
   - 自我怀疑
   - 情感挣扎
   - 过去的阴影

2. **人际冲突**（人物 vs 人物）
   - 理念不合
   - 利益冲突
   - 情感纠葛
   - 仇恨与复仇

3. **社会冲突**（人物 vs 群体）
   - 对抗体制
   - 被误解/排斥
   - 维护正义
   - 改变现状

4. **自然冲突**（人物 vs 自然）
   - 生存挑战
   - 自然灾害
   - 险恶环境
   - 野外求生

5. **超自然冲突**（人物 vs 超自然力量）
   - 对抗怪物
   - 解开诅咒
   - 宿命对抗
   - 神秘力量

【冲突升级节奏】
- 小冲突（每章）→ 中冲突（3-5章）→ 大冲突（10-15章）→ 最终冲突（结局）

【冲突设计要点】
- 冲突要有 stakes（利害关系）
- 冲突要两难（选A也痛苦，选B也痛苦）
- 冲突要升级（越来越严重）
- 冲突要解决但付出代价
- 冲突要推动人物成长

【经典冲突模式】
- 想要 vs 应该
- 责任 vs 情感
- 生存 vs 道德
- 个人 vs 集体
- 真相 vs 安宁

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
      description: '帮助你快速确定题材、卖点与开篇策略',
      category: 'book_positioning',
      prompt_text: `你是一位网文编辑与策划。请根据用户提供的信息，帮我完成开书定位与开篇方案：

【输入信息】
- 题材/类型：
- 目标读者：
- 核心卖点（金手指/噱头）：
- 主角人设关键词：
- 世界观一句话：

【请输出】
1. 一句话定位（读者为什么要看）
2. 3 个核心卖点（可量化/可落地）
3. 黄金三章的章节目标（每章 3-5 个要点）
4. 开篇冲突设计（主角目标 vs 阻碍）
5. 10 个可用书名方向（含风格说明）

现在开始：`,
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
      description: '检查时间线、设定、人物行为与信息矛盾',
      category: 'consistency_proof',
      prompt_text: `你是一位严谨的小说校对编辑。请对我提供的内容做一致性检查：

【检查维度】
1. 时间线是否矛盾（事件先后、日期、昼夜）
2. 世界观/力量体系设定是否自洽
3. 角色行为是否符合人设与动机
4. 信息重复/自相矛盾之处
5. 伏笔是否被遗忘或提前泄露

【输出格式】
- 问题清单（按严重程度排序）
- 每条问题给出：证据引用（原文片段）+ 修正建议
- 若可直接修复：给出一版“修订后的段落”

请开始：`,
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
      description: '快速产出可用的情节点子、冲突与命名',
      category: 'ideas_material',
      prompt_text: `你是一位网文灵感策划。请根据我的题材与关键词，生成可直接使用的素材：

【输入】
- 题材/类型：
- 关键词（3-10 个）：
- 想要的氛围（热血/轻松/黑暗/甜宠等）：

【输出】
1. 20 个高概念情节点子（每个 1-2 句，包含冲突点）
2. 10 个反转点（可插入章节结尾）
3. 10 组人物关系冲突（谁想要什么、为什么冲突）
4. 30 个命名（人名/地名/组织名各 10）

开始生成：`,
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
      description: '用于承载你自定义的提示词类别与写作规则',
      category: 'other',
      prompt_text: `请根据你的写作目标，把“你希望 AI 如何写”的规则写在这里。

【建议结构】
1) 角色：AI 扮演什么身份
2) 目标：这次输出要解决什么问题
3) 约束：字数、结构、禁忌、风格
4) 输出格式：标题/分段/要点/表格等
5) 示例：给 1 个你喜欢的示例风格（可选）

开始：`,
      author_name: '官方',
      is_official: true,
      uses: 0,
      likes: 0,
      tags: ['自定义', '模板'],
      cover_color: 'bg-gradient-to-br from-sky-400 to-blue-500'
    }
  ];

  // Mock Data fallback if DB is empty (optional, but good for demo if DB is empty)
  const mockResources: Template[] = [
    {
      id: 'mock-1',
      title: '小说通用模板 (10章节版)',
      author_name: '僵尸道士',
      category: '网文小说',
      content: {
        type: 'folder',
        name: '小说通用模板',
        children: [
           { 
             id: 'meta-temp-1', 
             name: '作品相关', 
             type: 'folder', 
             children: [
               { id: 'mm-outline-temp-1', name: '作品大纲', type: 'mindmap', mindMapType: 'outline', savedMindMap: { nodes: [{ id: 'root', type: 'mindMap', data: { label: '作品大纲', isRoot: true }, position: { x: 0, y: 0 } }, { id: 'c1', type: 'mindMap', data: { label: '开头' }, position: { x: 200, y: -120 } }, { id: 'c2', type: 'mindMap', data: { label: '发展' }, position: { x: 200, y: 0 } }, { id: 'c3', type: 'mindMap', data: { label: '高潮' }, position: { x: 200, y: 120 } }], edges: [{ id: 'e-root-c1', source: 'root', target: 'c1', type: 'straight' }, { id: 'e-root-c2', source: 'root', target: 'c2', type: 'straight' }, { id: 'e-root-c3', source: 'root', target: 'c3', type: 'straight' }] } },
               { id: 'mm-world-temp-1', name: '世界设定', type: 'mindmap', mindMapType: 'world', savedMindMap: { nodes: [{ id: 'root', type: 'mindMap', data: { label: '世界设定', isRoot: true }, position: { x: 0, y: 0 } }, { id: 'c1', type: 'mindMap', data: { label: '地理' }, position: { x: 200, y: -120 } }, { id: 'c2', type: 'mindMap', data: { label: '历史' }, position: { x: 200, y: 0 } }, { id: 'c3', type: 'mindMap', data: { label: '势力' }, position: { x: 200, y: 120 } }], edges: [{ id: 'e-root-c1', source: 'root', target: 'c1', type: 'straight' }, { id: 'e-root-c2', source: 'root', target: 'c2', type: 'straight' }, { id: 'e-root-c3', source: 'root', target: 'c3', type: 'straight' }] } },
               { id: 'mm-char-temp-1', name: '角色塑造', type: 'mindmap', mindMapType: 'character', savedMindMap: { nodes: [{ id: 'root', type: 'mindMap', data: { label: '角色塑造', isRoot: true }, position: { x: 0, y: 0 } }, { id: 'c1', type: 'mindMap', data: { label: '主角' }, position: { x: 200, y: -120 } }, { id: 'c2', type: 'mindMap', data: { label: '配角' }, position: { x: 200, y: 0 } }, { id: 'c3', type: 'mindMap', data: { label: '反派' }, position: { x: 200, y: 120 } }], edges: [{ id: 'e-root-c1', source: 'root', target: 'c1', type: 'straight' }, { id: 'e-root-c2', source: 'root', target: 'c2', type: 'straight' }, { id: 'e-root-c3', source: 'root', target: 'c3', type: 'straight' }] } },
               { id: 'mm-event-temp-1', name: '事件细纲', type: 'mindmap', mindMapType: 'event', savedMindMap: { nodes: [{ id: 'root', type: 'mindMap', data: { label: '事件细纲', isRoot: true }, position: { x: 0, y: 0 } }, { id: 'c1', type: 'mindMap', data: { label: '起因' }, position: { x: 200, y: -120 } }, { id: 'c2', type: 'mindMap', data: { label: '经过' }, position: { x: 200, y: 0 } }, { id: 'c3', type: 'mindMap', data: { label: '结果' }, position: { x: 200, y: 120 } }], edges: [{ id: 'e-root-c1', source: 'root', target: 'c1', type: 'straight' }, { id: 'e-root-c2', source: 'root', target: 'c2', type: 'straight' }, { id: 'e-root-c3', source: 'root', target: 'c3', type: 'straight' }] } },
             ] 
           },
           {
             id: 'chapters-temp-1',
             name: '正文情节',
             type: 'folder',
             children: Array.from({ length: 10 }, (_, i) => ({
               id: `ch-${i + 1}-temp-1`,
               name: `第${i + 1}章`,
               type: 'file'
             }))
           }
        ]
      },
      likes: 0,
      views: 0,
      downloads: 0,
      description: '适用于长篇网文创作的基础模板',
      cover_color: 'bg-gradient-to-br from-orange-400 to-red-500',
      creator_id: null,
      is_public: true,
      is_official: true,
      tags: [],
      created_at: new Date().toISOString()
    },
  ];

  const displayResources = resources.length > 0 ? resources : mockResources;

  const allSkills = useMemo(() => [...officialSkills, ...userSkills], [userSkills]);

  const filteredSkills = allSkills.filter((skill) => {
    return skill.category === skillTab;
  });

  const PAGE_SIZE = 6;

  const currentViewKey = useMemo(() => {
    if (isCreating) return 'create';
    if (mainTab === 'templates') return `templates:${templateTab}`;
    if (mainTab === 'skills') return `skills:${skillTab}`;
    if (mainTab === 'mine') return `mine:${mineTab}`;
    return `favorites:${favoritesTab}`;
  }, [favoritesTab, isCreating, mainTab, mineTab, skillTab, templateTab]);

  useEffect(() => {
    setPageByView((prev) => (prev[currentViewKey] ? prev : { ...prev, [currentViewKey]: 1 }));
  }, [currentViewKey]);

  const currentPage = pageByView[currentViewKey] || 1;

  const setCurrentPage = (page: number) => {
    setPageByView((prev) => ({ ...prev, [currentViewKey]: page }));
  };

  const getPaged = <T,>(items: T[]) => {
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, currentPage), totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return { items: items.slice(start, start + PAGE_SIZE), totalPages, page: safePage };
  };

  const sortByOfficialAndLikes = <
    T extends { is_official?: boolean | null; likes?: number | null; created_at?: string | null; title?: string | null }
  >(
    list: T[]
  ) => {
    const next = [...list];
    next.sort((a, b) => {
      const ao = a.is_official ? 1 : 0;
      const bo = b.is_official ? 1 : 0;
      if (ao !== bo) return bo - ao;
      const al = Number(a.likes ?? 0);
      const bl = Number(b.likes ?? 0);
      if (al !== bl) return bl - al;
      const av = Number((a as any).views ?? (a as any).uses ?? 0);
      const bv = Number((b as any).views ?? (b as any).uses ?? 0);
      if (av !== bv) return bv - av;
      const at = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (at !== bt) return bt - at;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
    return next;
  };

  const filteredTemplates = displayResources.filter((t) => {
    if (templateTab === 'webnovel') return true;
    if (templateTab === 'short') return true;
    if (templateTab === 'script') return true;
    return true;
  });

  const publicTemplates = sortByOfficialAndLikes(filteredTemplates.filter((t) => t.is_official || t.is_public !== false));

  const mineTemplates = user?.id
    ? sortByOfficialAndLikes(resources.filter((t) => !t.is_official && !String(t.id).startsWith('mock-') && t.creator_id === user.id))
    : [];

  const publicSkills = sortByOfficialAndLikes(filteredSkills.filter((s) => s.is_official || s.is_public !== false));

  const mineSkills = user?.id ? sortByOfficialAndLikes(userSkills.filter((s) => !s.is_official && s.creator_id === user.id)) : [];

  const ensureLogin = () => {
    if (user?.id) return true;
    if (confirm('需要登录后才能使用该功能，是否前往登录？')) {
      navigate('/login');
    }
    return false;
  };

  const startCreate = () => {
    resetCreateState();
    setIsCreating(true);
  };

  const exitCreate = () => {
    setIsCreating(false);
    resetCreateState();
  };

  const parseDirectoryText = (text: string) => {
    const lines = text
      .split('\n')
      .map((l) => l.replace(/\r/g, ''))
      .filter((l) => l.trim().length > 0);

    const roots: any[] = [];
    const stack: Array<{ level: number; node: any }> = [];

    lines.forEach((raw) => {
      const leading = raw.match(/^\s*/)?.[0] || '';
      const indent = leading.replace(/\t/g, '  ').length;
      const level = Math.floor(indent / 2);
      const cleaned = raw
        .trim()
        .replace(/^[-*+]\s+/, '')
        .replace(/^\d+\.\s+/, '');
      if (!cleaned) return;

      const node = { name: cleaned, children: [] as any[] };

      while (stack.length && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      const parent = stack.length ? stack[stack.length - 1].node : null;
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
      stack.push({ level, node });
    });

    return roots;
  };

  const hydrateOutlineTree = (nodes: Array<{ name: string; children?: any[] }>): OutlineTreeNode[] => {
    return nodes.map((n) => ({
      id: uuidv4(),
      name: n.name,
      children: hydrateOutlineTree(Array.isArray(n.children) ? (n.children as any) : []),
    }));
  };

  const outlineTreeToDirectoryText = (nodes: OutlineTreeNode[], depth = 0): string => {
    const lines: string[] = [];
    nodes.forEach((n) => {
      const name = (n.name || '').trim();
      if (!name) return;
      lines.push(`${'  '.repeat(depth)}${name}`);
      const childText = outlineTreeToDirectoryText(n.children || [], depth + 1);
      if (childText) lines.push(childText);
    });
    return lines.join('\n');
  };

  const createOutlineNode = (): OutlineTreeNode => ({
    id: uuidv4(),
    name: '',
    children: [],
  });

  const updateOutlineNodeName = (nodes: OutlineTreeNode[], id: string, name: string): OutlineTreeNode[] => {
    return nodes.map((n) => {
      if (n.id === id) return { ...n, name };
      if (!n.children?.length) return n;
      return { ...n, children: updateOutlineNodeName(n.children, id, name) };
    });
  };

  const removeOutlineNode = (nodes: OutlineTreeNode[], id: string): OutlineTreeNode[] => {
    const next: OutlineTreeNode[] = [];
    nodes.forEach((n) => {
      if (n.id === id) return;
      const children = n.children?.length ? removeOutlineNode(n.children, id) : n.children;
      next.push(children === n.children ? n : { ...n, children: children || [] });
    });
    return next;
  };

  const addOutlineChild = (nodes: OutlineTreeNode[], id: string): OutlineTreeNode[] => {
    return nodes.map((n) => {
      if (n.id === id) return { ...n, children: [...(n.children || []), createOutlineNode()] };
      if (!n.children?.length) return n;
      return { ...n, children: addOutlineChild(n.children, id) };
    });
  };

  const addOutlineSiblingAfter = (nodes: OutlineTreeNode[], id: string): OutlineTreeNode[] => {
    const walk = (list: OutlineTreeNode[]): { nodes: OutlineTreeNode[]; done: boolean } => {
      const out: OutlineTreeNode[] = [];
      let done = false;
      list.forEach((n) => {
        if (done) {
          out.push(n);
          return;
        }
        if (n.id === id) {
          out.push(n);
          out.push(createOutlineNode());
          done = true;
          return;
        }
        if (n.children?.length) {
          const res = walk(n.children);
          out.push(res.nodes === n.children ? n : { ...n, children: res.nodes });
          done = res.done;
          return;
        }
        out.push(n);
      });
      return { nodes: out, done };
    };

    return walk(nodes).nodes;
  };

  const buildSavedMindMap = (rootLabel: string, directoryText: string) => {
    const tree = parseDirectoryText(directoryText);
    const nodes: any[] = [];
    const edges: any[] = [];

    const rootId = 'root';
    nodes.push({
      id: rootId,
      type: 'mindMap',
      data: { label: rootLabel, isRoot: true },
      position: { x: 0, y: 0 },
    });

    let nextId = 1;
    const nextYByDepth = new Map<number, number>();

    const getY = (depth: number) => {
      const current = nextYByDepth.get(depth) ?? -180;
      const next = current + 120;
      nextYByDepth.set(depth, next);
      return next;
    };

    const walk = (items: any[], depth: number, parentId: string) => {
      items.forEach((item) => {
        const id = `n${nextId++}`;
        nodes.push({
          id,
          type: 'mindMap',
          data: { label: item.name },
          position: { x: depth * 240, y: getY(depth) },
        });
        edges.push({
          id: `e-${parentId}-${id}`,
          source: parentId,
          target: id,
          type: 'straight',
        });
        if (Array.isArray(item.children) && item.children.length > 0) {
          walk(item.children, depth + 1, id);
        }
      });
    };

    walk(tree, 1, rootId);
    return { nodes, edges };
  };

  const getDotColorClass = (depth: number) => {
    if (depth === 0) return 'bg-purple-500';
    if (depth === 1) return 'bg-indigo-500';
    if (depth === 2) return 'bg-emerald-500';
    if (depth === 3) return 'bg-amber-500';
    if (depth === 4) return 'bg-rose-500';
    return 'bg-gray-400';
  };

  const savedMindMapToOutlineTree = (savedMindMap: any): OutlineTreeNode[] => {
    const nodes = Array.isArray(savedMindMap?.nodes) ? savedMindMap.nodes : [];
    const edges = Array.isArray(savedMindMap?.edges) ? savedMindMap.edges : [];
    if (!nodes.length) return [];

    const nodeById = new Map<string, any>();
    nodes.forEach((n: any) => nodeById.set(String(n.id), n));

    const childrenByParent = new Map<string, string[]>();
    edges.forEach((e: any) => {
      const source = String(e.source);
      const target = String(e.target);
      const list = childrenByParent.get(source) || [];
      list.push(target);
      childrenByParent.set(source, list);
    });

    const rootNode = nodes.find((n: any) => n?.data?.isRoot) || nodes.find((n: any) => String(n.id) === 'root') || nodes[0];
    const rootId = String(rootNode.id);

    const buildNode = (id: string): OutlineTreeNode => {
      const n = nodeById.get(id);
      const label = String(n?.data?.label ?? n?.label ?? '');
      const childIds = childrenByParent.get(id) || [];
      childIds.sort((a, b) => {
        const ay = Number(nodeById.get(a)?.position?.y ?? 0);
        const by = Number(nodeById.get(b)?.position?.y ?? 0);
        return ay - by;
      });
      return {
        id: uuidv4(),
        name: label,
        children: childIds.map(buildNode),
      };
    };

    const rootChildIds = childrenByParent.get(rootId) || [];
    rootChildIds.sort((a, b) => {
      const ay = Number(nodeById.get(a)?.position?.y ?? 0);
      const by = Number(nodeById.get(b)?.position?.y ?? 0);
      return ay - by;
    });
    return rootChildIds.map(buildNode);
  };

  const startEditWorkTemplate = (template: Template, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ensureLogin()) return;
    if (template.is_official || String(template.id).startsWith('mock-') || template.creator_id !== user!.id) {
      alert('只能编辑你自己创建的模板');
      return;
    }

    const normalized = getNormalizedTemplateStructure(template);
    const findFolder = (node: any, name: string): any => {
      if (!node) return null;
      if (node.type === 'folder' && node.name === name) return node;
      const children = Array.isArray(node.children) ? node.children : [];
      for (const c of children) {
        const v = findFolder(c, name);
        if (v) return v;
      }
      return null;
    };

    const workFolder = findFolder(normalized, '作品相关');
    const chaptersFolder = findFolder(normalized, '正文情节');
    const mindMaps = (Array.isArray(workFolder?.children) ? workFolder.children : []).filter((c: any) => c?.type === 'mindmap');
    const chapters = (Array.isArray(chaptersFolder?.children) ? chaptersFolder.children : []).filter((c: any) => c?.type === 'file');

    const nextMindMaps = mindMaps.map((m: any, idx: number) => {
      const tree = savedMindMapToOutlineTree(m?.savedMindMap);
      const outlineText = outlineTreeToDirectoryText(tree);
      return {
        name: (m?.name || '').trim() || `思维导图${idx + 1}`,
        outlineText,
        outlineMode: 'visual' as const,
        outlineTree: tree,
      };
    });

    setIsCreating(true);
    setCreateTab('template');
    setEditingTemplateId(template.id);
    setEditingSkillId(null);
    setNewTemplateTitle(template.title || '');
    setNewTemplateDescription(template.description || '');
    setNewTemplateCategory((template.category || '网文小说') as any);
    setNewTemplateIsPublic(template.is_public !== false);
    setNewTemplateMindMapCount(Math.max(1, nextMindMaps.length || 1));
    setNewTemplateChapterCount(chapters.length);
    setNewTemplateMindMaps(nextMindMaps.length ? nextMindMaps : [{ name: '思维导图1', outlineText: '', outlineMode: 'visual', outlineTree: [] }]);
    setCollapsedOutlineNodeIds({});
  };

  const startEditSkillTemplate = (skill: Skill, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ensureLogin()) return;
    if (skill.is_official || skill.creator_id !== user!.id) {
      alert('只能编辑你自己创建的提示词模板');
      return;
    }

    setIsCreating(true);
    setCreateTab('skill');
    setEditingTemplateId(null);
    setEditingSkillId(skill.id);
    setNewSkillTitle(skill.title || '');
    setNewSkillDescription(skill.description || '');
    setNewSkillCategory(normalizeSkillCategory(skill.category) || 'other');
    setNewSkillPromptText(skill.prompt_text || '');
    setNewSkillIsPublic(skill.is_public !== false);
  };

  const buildNewTemplateStructure = () => {
    return {
      type: 'folder',
      name: newTemplateTitle.trim(),
      children: [
        {
          name: '作品相关',
          type: 'folder',
          children: newTemplateMindMaps.map((m) => ({
            name: (m.name || '').trim() || '思维导图',
            type: 'mindmap',
            savedMindMap: buildSavedMindMap(
              (m.name || '').trim() || '思维导图',
              (m.outlineMode === 'text' ? m.outlineText : outlineTreeToDirectoryText(m.outlineTree || [])) || m.outlineText || ''
            ),
          })),
        },
        {
          name: '正文情节',
          type: 'folder',
          children: Array.from({ length: Math.max(0, Math.floor(Number(newTemplateChapterCount) || 0)) }, (_, i) => ({
            name: `第${i + 1}章`,
            type: 'file',
          })),
        },
      ],
    };
  };

  const handleCreateWorkTemplate = async () => {
    if (!ensureLogin()) return;

    const title = newTemplateTitle.trim();
    if (!title) {
      alert('请填写模板名称');
      return;
    }

    const description = newTemplateDescription.trim();
    const category = (newTemplateCategory || '').trim() || '网文小说';
    const content = buildNewTemplateStructure();
    const author = profile?.username || user?.email?.split('@')[0] || '用户';

    if (editingTemplateId) {
      const target = resources.find((t) => t.id === editingTemplateId);
      if (!target || target.creator_id !== user!.id || target.is_official) {
        alert('只能编辑你自己创建的模板');
        return;
      }

      const { data, error } = await supabase
        .from('community_templates')
        .update({
          title,
          description: description || null,
          category,
          content: content as any,
          is_public: newTemplateIsPublic,
        } as any)
        .eq('id', editingTemplateId)
        .eq('creator_id', user!.id)
        .select('*')
        .single();

      if (error || !data) {
        alert('更新失败，请稍后重试');
        return;
      }

      setResources((prev) => prev.map((t) => (t.id === (data as any).id ? (data as any) : t)));
      if (previewTemplate?.id === (data as any).id) {
        closeTemplatePreview();
      }
      setMainTab('mine');
      setMineTab('templates');
      exitCreate();
      alert('模板已更新');
      return;
    }

    if (userWorkTemplateCount >= 10) {
      alert('你创建的作品模板已达到上限（10个），无法继续创建');
      return;
    }

    const coverColor = coverColors[Math.floor(Math.random() * coverColors.length)] || null;

    const { data, error } = await supabase
      .from('community_templates')
      .insert({
        title,
        description: description || null,
        author_name: author,
        category,
        content: content as any,
        creator_id: user!.id,
        is_public: newTemplateIsPublic,
        cover_color: coverColor,
        likes: 0,
        views: 0,
        downloads: 0,
        is_official: false,
        tags: [],
      } as any)
      .select('*')
      .single();

    if (error || !data) {
      if ((error as any)?.message?.includes('template limit reached')) {
        alert('你创建的作品模板已达到上限（10个），无法继续创建');
        return;
      }
      alert('创建失败，请稍后重试');
      return;
    }

    setResources((prev) => [data as any, ...prev]);
    setMainTab('mine');
    setMineTab('templates');
    exitCreate();
    alert('模板已创建');
  };

  const handleCreateSkillTemplate = async () => {
    if (!ensureLogin()) return;

    const title = newSkillTitle.trim();
    if (!title) {
      alert('请填写提示词名称');
      return;
    }
    const promptText = newSkillPromptText.trim();
    if (!promptText) {
      alert('请填写提示词内容');
      return;
    }

    const author = profile?.username || user?.email?.split('@')[0] || '用户';
    if (editingSkillId) {
      const target = userSkills.find((s) => s.id === editingSkillId);
      if (!target || target.creator_id !== user!.id || target.is_official) {
        alert('只能编辑你自己创建的提示词模板');
        return;
      }

      const { data, error } = await supabase
        .from('community_skill_templates')
        .update({
          title,
          description: newSkillDescription.trim() || null,
          category: newSkillCategory,
          prompt_text: promptText,
          is_public: newSkillIsPublic,
        } as any)
        .eq('id', editingSkillId)
        .eq('creator_id', user!.id)
        .select('*')
        .single();

      if (error || !data) {
        alert('更新失败，请稍后重试');
        return;
      }

      const skill: Skill = {
        id: (data as any).id,
        title: (data as any).title,
        description: (data as any).description || '暂无描述',
        category: (data as any).category,
        prompt_text: (data as any).prompt_text,
        author_name: (data as any).author_name || '用户',
        is_official: !!(data as any).is_official,
        is_public: (data as any).is_public ?? true,
        creator_id: (data as any).creator_id || null,
        uses: (data as any).uses || 0,
        likes: (data as any).likes || 0,
        tags: Array.isArray((data as any).tags) ? (data as any).tags : [],
        cover_color: (data as any).cover_color || 'bg-gradient-to-br from-purple-400 to-indigo-500',
      };

      setUserSkills((prev) => prev.map((s) => (s.id === skill.id ? skill : s)));
      setMainTab('mine');
      setMineTab('skills');
      exitCreate();
      alert('提示词模板已更新');
      return;
    }

    if (userSkillTemplateCount >= 20) {
      alert('你创建的提示词模板已达到上限（20个），无法继续创建');
      return;
    }

    const coverColor = coverColors[Math.floor(Math.random() * coverColors.length)] || null;

    const { data, error } = await supabase
      .from('community_skill_templates')
      .insert({
        title,
        description: newSkillDescription.trim() || null,
        category: newSkillCategory,
        prompt_text: promptText,
        author_name: author,
        creator_id: user!.id,
        is_public: newSkillIsPublic,
        cover_color: coverColor,
        likes: 0,
        uses: 0,
        is_official: false,
        tags: [],
      } as any)
      .select('*')
      .single();

    if (error || !data) {
      if ((error as any)?.message?.includes('skill template limit reached')) {
        alert('你创建的提示词模板已达到上限（20个），无法继续创建');
        return;
      }
      alert('创建失败，请稍后重试');
      return;
    }

    const skill: Skill = {
      id: (data as any).id,
      title: (data as any).title,
      description: (data as any).description || '暂无描述',
      category: (data as any).category,
      prompt_text: (data as any).prompt_text,
      author_name: (data as any).author_name || '用户',
      is_official: !!(data as any).is_official,
      is_public: (data as any).is_public ?? true,
      creator_id: (data as any).creator_id || null,
      uses: (data as any).uses || 0,
      likes: (data as any).likes || 0,
      tags: Array.isArray((data as any).tags) ? (data as any).tags : [],
      cover_color: (data as any).cover_color || 'bg-gradient-to-br from-purple-400 to-indigo-500',
    };

    setUserSkills((prev) => [skill, ...prev]);
    setMainTab('mine');
    setMineTab('skills');
    exitCreate();
    alert('提示词已创建');
  };

  const handleDeleteTemplate = async (template: Template, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ensureLogin()) return;
    if (template.is_official || String(template.id).startsWith('mock-')) return;
    if (template.creator_id !== user!.id) {
      alert('只能删除你自己创建的模板');
      return;
    }
    if (!confirm(`确定要删除模板 "${template.title}" 吗？\n删除后不可恢复。`)) return;

    const { error } = await supabase.from('community_templates').delete().eq('id', template.id).eq('creator_id', user!.id);
    if (error) {
      alert('删除失败，请稍后重试');
      return;
    }

    setResources((prev) => prev.filter((t) => t.id !== template.id));
    setLikedTemplateIds((prev) => prev.filter((id) => id !== template.id));
    setCollectedTemplateIds((prev) => prev.filter((id) => id !== template.id));
    if (previewTemplate?.id === template.id) {
      closeTemplatePreview();
    }
    alert('模板已删除');
  };

  const handleDeleteSkillTemplate = async (skill: Skill, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ensureLogin()) return;
    if (skill.is_official) return;
    if (skill.creator_id !== user!.id) {
      alert('只能删除你自己创建的提示词模板');
      return;
    }
    if (!confirm(`确定要删除提示词模板 "${skill.title}" 吗？\n删除后不可恢复。`)) return;

    const { error } = await supabase.from('community_skill_templates').delete().eq('id', skill.id).eq('creator_id', user!.id);
    if (error) {
      alert('删除失败，请稍后重试');
      return;
    }

    setUserSkills((prev) => prev.filter((s) => s.id !== skill.id));
    if (collectedSkills.includes(skill.id)) {
      const next = collectedSkills.filter((id) => id !== skill.id);
      setCollectedSkills(next);
      localStorage.setItem('collectedSkills', JSON.stringify(next));
    }
    alert('提示词模板已删除');
  };

  const handleToggleTemplateLike = async (template: Template, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ensureLogin()) return;
    if (String(template.id).startsWith('mock-')) return;

    const isLiked = likedTemplateIds.includes(template.id);
    if (isLiked) {
      const { error } = await supabase
        .from('template_likes')
        .delete()
        .eq('template_id', template.id)
        .eq('user_id', user!.id);
      if (error) return;

      setLikedTemplateIds((prev) => prev.filter((id) => id !== template.id));
      setResources((prev) => prev.map((t) => (t.id === template.id ? { ...t, likes: Math.max((t.likes || 0) - 1, 0) } : t)));

      const { data: latest, error: latestError } = await supabase
        .from('community_templates')
        .select('likes')
        .eq('id', template.id)
        .single();
      if (!latestError) {
        const likes = Number((latest as any)?.likes ?? 0);
        setResources((prev) => prev.map((t) => (t.id === template.id ? { ...t, likes } : t)));
      }
    } else {
      const { error } = await supabase.from('template_likes').insert({
        template_id: template.id,
        user_id: user!.id,
      } as any);
      if (error) return;

      setLikedTemplateIds((prev) => [...prev, template.id]);
      setResources((prev) => prev.map((t) => (t.id === template.id ? { ...t, likes: (t.likes || 0) + 1 } : t)));

      const { data: latest, error: latestError } = await supabase
        .from('community_templates')
        .select('likes')
        .eq('id', template.id)
        .single();
      if (!latestError) {
        const likes = Number((latest as any)?.likes ?? 0);
        setResources((prev) => prev.map((t) => (t.id === template.id ? { ...t, likes } : t)));
      }
    }
  };

  const handleToggleTemplateCollect = async (template: Template, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ensureLogin()) return;
    if (String(template.id).startsWith('mock-')) return;

    const isCollected = collectedTemplateIds.includes(template.id);
    if (isCollected) {
      const { error } = await supabase
        .from('user_templates')
        .delete()
        .eq('template_id', template.id)
        .eq('user_id', user!.id);
      if (error) return;

      setCollectedTemplateIds((prev) => prev.filter((id) => id !== template.id));
    } else {
      const { error } = await supabase.from('user_templates').insert({
        template_id: template.id,
        user_id: user!.id,
      } as any);
      if (error) return;

      setCollectedTemplateIds((prev) => [...prev, template.id]);
    }
  };

  const mindMapPresetNodes: Record<string, any> = {
    outline: [
      { name: '开头', children: [{ name: '主角出场' }, { name: '世界观展示' }, { name: '核心冲突铺垫' }] },
      { name: '发展', children: [{ name: '第一个转折点' }, { name: '主角成长' }, { name: '关系线发展' }, { name: '高潮铺垫' }] },
      { name: '高潮', children: [{ name: '最终冲突' }, { name: '真相揭晓' }, { name: '情感爆发' }] },
      { name: '结局', children: [{ name: '问题解决' }, { name: '人物归宿' }, { name: '伏笔回收' }] },
    ],
    world: [
      { name: '地理', children: [{ name: '大陆/国家' }, { name: '重要城市' }, { name: '特殊地点' }] },
      { name: '历史', children: [{ name: '重大事件' }, { name: '王朝更替' }, { name: '传说神话' }] },
      { name: '种族', children: [{ name: '人类' }, { name: '异族' }, { name: '特殊生物' }] },
      { name: '势力', children: [{ name: '官方组织' }, { name: '江湖门派' }, { name: '地下势力' }] },
      { name: '设定', children: [{ name: '力量体系' }, { name: '货币系统' }, { name: '社会制度' }] },
    ],
    character: [
      { name: '主角', children: [{ name: '基本信息' }, { name: '外貌描写' }, { name: '性格特点' }, { name: '背景故事' }, { name: '成长弧光' }, { name: '人物关系' }] },
      { name: '主要配角', children: [{ name: '配角A' }, { name: '配角B' }] },
      { name: '反派', children: [{ name: '反派A' }] },
    ],
    event: [
      { name: '主线事件', children: [{ name: '起因' }, { name: '经过' }, { name: '结果' }] },
      { name: '关键转折', children: [{ name: '转折点1' }, { name: '转折点2' }] },
      { name: '伏笔与回收', children: [{ name: '伏笔A' }, { name: '回收A' }] },
    ],
  };

  const isDbTemplate = (template: Template) => !String(template.id).startsWith('mock-');

  const incrementTemplateViews = async (template: Template) => {
    if (!isDbTemplate(template)) return;
    const { error } = await supabase.rpc('increment_template_views', { template_id: template.id } as any);
    if (error) return;
  };

  const openTemplatePreview = (template: Template) => {
    const normalized = getNormalizedTemplateStructure(template);
    const nextViews = (template.views ?? 0) + 1;
    setPreviewTemplate({ ...template, views: nextViews });
    setPreviewStructure(normalized);

    if (isDbTemplate(template)) {
      setResources((prev) => prev.map((t) => (t.id === template.id ? { ...t, views: (t.views ?? 0) + 1 } : t)));
      void incrementTemplateViews(template);
    }

    const folderInit: Record<string, boolean> = {};
    const firstSelectable: string | null = (() => {
      const walk = (n: any): string | null => {
        if (!n) return null;
        if (n.type === 'folder') {
          folderInit[n.__pid] = true;
          for (const c of n.children || []) {
            const v = walk(c);
            if (v) return v;
          }
          return null;
        }
        return n.__pid || null;
      };
      return walk(normalized);
    })();

    setExpandedPreviewFolders(folderInit);
    setSelectedPreviewNodeId(firstSelectable);
  };

  const closeTemplatePreview = () => {
    setPreviewTemplate(null);
    setPreviewStructure(null);
    setSelectedPreviewNodeId(null);
    setExpandedPreviewFolders({});
  };

  const favoriteTemplates = sortByOfficialAndLikes(
    displayResources.filter((t) => collectedTemplateIds.includes(t.id) && !String(t.id).startsWith('mock-'))
  );

  const favoriteSkills = sortByOfficialAndLikes(allSkills.filter((s) => collectedSkills.includes(s.id)));

  const isDbSkillTemplate = (skill: Skill) => !String(skill.id).startsWith('skill-');

  const getSkillMetrics = (skill: Skill) => {
    if (!isDbSkillTemplate(skill)) {
      const stored = officialSkillMetrics[skill.id];
      return {
        likes: stored?.likes ?? (skill.likes ?? 0),
        uses: stored?.uses ?? (skill.uses ?? 0),
      };
    }
    return { likes: skill.likes ?? 0, uses: skill.uses ?? 0 };
  };

  const isSkillLikedByMe = (skill: Skill) => {
    if (isDbSkillTemplate(skill)) return likedSkillIds.includes(skill.id);
    return likedOfficialSkillIds.includes(skill.id);
  };

  const incrementSkillUses = async (skill: Skill) => {
    if (!isDbSkillTemplate(skill)) {
      setOfficialSkillMetrics((prev) => {
        const current = prev[skill.id];
        const likes = current?.likes ?? (skill.likes ?? 0);
        const uses = current?.uses ?? (skill.uses ?? 0);
        return { ...prev, [skill.id]: { likes, uses: uses + 1 } };
      });
      return;
    }
    const { error } = await supabase.rpc('increment_skill_template_uses', { skill_template_id: skill.id } as any);
    if (error) return;
    setUserSkills((prev) => prev.map((s) => (s.id === skill.id ? { ...s, uses: (s.uses ?? 0) + 1 } : s)));
  };

  const handleToggleSkillLike = async (skill: Skill, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!isDbSkillTemplate(skill)) {
      const isLiked = likedOfficialSkillIds.includes(skill.id);
      setLikedOfficialSkillIds((prev) => (isLiked ? prev.filter((id) => id !== skill.id) : [...prev, skill.id]));
      setOfficialSkillMetrics((prev) => {
        const current = prev[skill.id];
        const baseLikes = current?.likes ?? (skill.likes ?? 0);
        const baseUses = current?.uses ?? (skill.uses ?? 0);
        return {
          ...prev,
          [skill.id]: {
            likes: Math.max(baseLikes + (isLiked ? -1 : 1), 0),
            uses: baseUses,
          },
        };
      });
      setPreviewSkill((prev) =>
        prev && prev.id === skill.id ? { ...prev, likes: Math.max((prev.likes ?? 0) + (isLiked ? -1 : 1), 0) } : prev
      );
      return;
    }

    if (!ensureLogin()) return;
    const isLiked = likedSkillIds.includes(skill.id);
    if (isLiked) {
      const { error } = await supabase
        .from('skill_template_likes')
        .delete()
        .eq('skill_template_id', skill.id)
        .eq('user_id', user!.id);
      if (error) return;
      setLikedSkillIds((prev) => prev.filter((id) => id !== skill.id));
      setUserSkills((prev) => prev.map((s) => (s.id === skill.id ? { ...s, likes: Math.max((s.likes ?? 0) - 1, 0) } : s)));
      setPreviewSkill((prev) => (prev && prev.id === skill.id ? { ...prev, likes: Math.max((prev.likes ?? 0) - 1, 0) } : prev));

      const { data: latest, error: latestError } = await supabase
        .from('community_skill_templates')
        .select('likes')
        .eq('id', skill.id)
        .single();
      if (!latestError) {
        const likes = Number((latest as any)?.likes ?? 0);
        setUserSkills((prev) => prev.map((s) => (s.id === skill.id ? { ...s, likes } : s)));
        setPreviewSkill((prev) => (prev && prev.id === skill.id ? { ...prev, likes } : prev));
      }
      return;
    }

    const { error } = await supabase.from('skill_template_likes').insert({
      skill_template_id: skill.id,
      user_id: user!.id,
    } as any);
    if (error) return;
    setLikedSkillIds((prev) => [...prev, skill.id]);
    setUserSkills((prev) => prev.map((s) => (s.id === skill.id ? { ...s, likes: (s.likes ?? 0) + 1 } : s)));
    setPreviewSkill((prev) => (prev && prev.id === skill.id ? { ...prev, likes: (prev.likes ?? 0) + 1 } : prev));

    const { data: latest, error: latestError } = await supabase
      .from('community_skill_templates')
      .select('likes')
      .eq('id', skill.id)
      .single();
    if (!latestError) {
      const likes = Number((latest as any)?.likes ?? 0);
      setUserSkills((prev) => prev.map((s) => (s.id === skill.id ? { ...s, likes } : s)));
      setPreviewSkill((prev) => (prev && prev.id === skill.id ? { ...prev, likes } : prev));
    }
  };

  const handleCopySkillPrompt = async (skill: Skill) => {
    try {
      await navigator.clipboard.writeText(skill.prompt_text);
      alert('提示词已复制');
    } catch {
      alert('复制失败，请手动复制');
    }
  };

  const handleImportSkillToPrompts = (skill: Skill, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const categoryLabel = skillCategories.find((c) => c.id === skill.category)?.label || '其他/自定义';
    const id = `community-skill-${skill.id}`;
    const existing = prompts.find((p) => p.id === id);
    const payload = {
      id,
      title: skill.title || '',
      index: categoryLabel,
      tags: [],
      content: skill.prompt_text || '',
    };
    if (existing) {
      if (existing.content !== payload.content || existing.index !== payload.index) {
        if (!confirm('该提示词已导入过，是否覆盖更新？')) return;
      }
      updatePrompt(id, payload);
      alert('已更新到你的提示词库');
      return;
    }
    addPrompt(payload);
    alert('已导入到你的提示词库');
  };

  const openSkillPreview = (skill: Skill) => {
    const base = getSkillMetrics(skill);
    setPreviewSkill({ ...skill, likes: base.likes, uses: base.uses + 1 });
    void incrementSkillUses(skill);
  };

  const closeSkillPreview = () => {
    setPreviewSkill(null);
  };

  const handleUseTemplate = async (template: Template) => {
    // Dev Mode: Allow template use without login
    // if (!user) {
    //     if(confirm('请先登录')) navigate('/login');
    //     return;
    // }

    if (confirm(`确定要使用模板 "${template.title}" 吗？\n这将复制模板文件到你的工作区。`)) {
        // We will assign a single workId for the top level work created from this template
        const workId = uuidv4();
        
        // Deep copy the structure and assign new IDs and paths
        const copyStructure = (node: any, currentWorkId: string | null = null): FileNode => {
            const newId = uuidv4();
            // If we are at the very top level and it's a folder, this is the root of the new work
            const isWorkRoot = !currentWorkId && node.type === 'folder';
            const assignedWorkId = isWorkRoot ? workId : currentWorkId;
            
            let path = node.path;
            
            if (assignedWorkId) {
                if (node.type === 'mindmap' && node.mindMapType) {
                    // Map mindMapType to the correct route path
                    const routeMap: Record<string, string> = {
                        'outline': 'outline',
                        'world': 'world',
                        'character': 'characters',
                        'event': 'events'
                    };
                    const routeName = routeMap[node.mindMapType] || `mindmap/${newId}`;
                    path = `/workspace/p/${assignedWorkId}/${routeName}`;
                } else if (node.type === 'file') {
                    path = `/workspace/p/${assignedWorkId}/story/${newId}`;
                }
            }

            // Special handling for meta and chapters folders to maintain ID conventions used by FileTree
            let finalId = newId;
            if (isWorkRoot) {
                finalId = workId;
            } else if (node.name === '作品相关' && assignedWorkId) {
                finalId = `meta-${assignedWorkId}`;
            } else if (node.name === '正文情节' && assignedWorkId) {
                finalId = `chapters-${assignedWorkId}`;
            } else if (node.type === 'mindmap' && node.mindMapType && assignedWorkId) {
                finalId = `mm-${node.mindMapType}-${assignedWorkId}`;
            }

            return {
                ...node,
                id: finalId,
                path: path,
                children: node.children ? node.children.map((child: any) => copyStructure(child, assignedWorkId)) : undefined
            };
        };
        
        const normalized = getNormalizedTemplateStructure(template);
        if (!normalized) return;

        const stripPreviewIds = (node: any): any => {
          const { __pid, ...rest } = node;
          return {
            ...rest,
            children: Array.isArray(node.children) ? node.children.map(stripPreviewIds) : undefined,
          };
        };

        const structure = stripPreviewIds(normalized);

        if (structure) {
            const newNode = copyStructure(structure);
            // Append random suffix to the work name
            if (newNode.type === 'folder') {
                newNode.name = `${newNode.name}${Math.floor(Math.random() * 1000)}`;
            }
            addNode(newNode);

            const persistMindMapSeedsToLocal = (node: any) => {
              if (!node) return;
              if (node.type === 'mindmap' && node.savedMindMap) {
                try {
                  const key = node.mindMapType ? `mindmap-${workId}-${node.mindMapType}` : `mindmap-${node.id}`;
                  window.localStorage.setItem(key, JSON.stringify(node.savedMindMap));
                } catch {
                  return;
                }
              }
              if (Array.isArray(node.children)) {
                node.children.forEach(persistMindMapSeedsToLocal);
              }
            };

            persistMindMapSeedsToLocal(newNode as any);
            if (user && newNode.type === 'folder') {
                await persistWorkTree(user.id, newNode as any);
                const nextFiles = await loadWorkspaceTree(user.id);
                setFiles(nextFiles as FileNode[]);
            }
            alert('模板已应用到工作区！');
            
            // Update download count in DB
            if (template.id && typeof template.id === 'string' && !template.id.startsWith('mock-')) {
              const { error } = await supabase.rpc('increment_downloads', { template_id: template.id } as any);
              if (!error) {
                setResources((prev) =>
                  prev.map((t) => (t.id === template.id ? { ...t, downloads: (t.downloads || 0) + 1 } : t))
                );
              }
            }
        }
    }
  };

  const findPreviewNode = (node: any, pid: string | null): any | null => {
    if (!node || !pid) return null;
    if (node.__pid === pid) return node;
    for (const c of node.children || []) {
      const found = findPreviewNode(c, pid);
      if (found) return found;
    }
    return null;
  };

  const renderPreviewNodes = (nodes: any[], depth = 0): React.ReactNode => {
    return nodes.map((n, idx) => (
      <div key={`${depth}-${idx}-${n.name}`} className="py-1">
        <div className="flex items-center text-sm text-gray-700" style={{ paddingLeft: depth * 16 }}>
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mr-2" />
          <span className="truncate">{n.name}</span>
        </div>
        {Array.isArray(n.children) && n.children.length > 0 && renderPreviewNodes(n.children, depth + 1)}
      </div>
    ));
  };

  const buildPreviewTreeFromSavedMindMap = (savedMindMap: any): any[] => {
    const nodes = Array.isArray(savedMindMap?.nodes) ? savedMindMap.nodes : [];
    const edges = Array.isArray(savedMindMap?.edges) ? savedMindMap.edges : [];
    if (nodes.length === 0) return [];

    const labelById = new Map<string, string>();
    nodes.forEach((n: any) => {
      const label = n?.data?.label;
      if (typeof n?.id === 'string' && typeof label === 'string') {
        labelById.set(n.id, label);
      }
    });

    const childrenById = new Map<string, string[]>();
    edges.forEach((e: any) => {
      if (typeof e?.source !== 'string' || typeof e?.target !== 'string') return;
      const list = childrenById.get(e.source) || [];
      list.push(e.target);
      childrenById.set(e.source, list);
    });

    const rootNode = nodes.find((n: any) => n?.data?.isRoot) || nodes.find((n: any) => n?.id === 'root') || nodes[0];
    const rootId = rootNode?.id;
    if (typeof rootId !== 'string') return [];

    const build = (id: string): any => {
      const name = labelById.get(id) || id;
      const children = (childrenById.get(id) || []).map(build);
      return { name, children };
    };

    return [build(rootId)];
  };

  const renderPreviewFileTree = (node: any, depth = 0): React.ReactNode => {
    if (!node) return null;
    const isFolder = node.type === 'folder';
    const isExpanded = !!expandedPreviewFolders[node.__pid];
    const isSelected = selectedPreviewNodeId === node.__pid;

    return (
      <div key={node.__pid}>
        <button
          onClick={() => {
            if (isFolder) {
              setExpandedPreviewFolders((prev) => ({ ...prev, [node.__pid]: !isExpanded }));
              return;
            }
            setSelectedPreviewNodeId(node.__pid);
          }}
          className={`w-full text-left flex items-center py-1.5 px-2 rounded-md transition-colors ${
            isSelected ? 'bg-purple-50 text-purple-700' : 'hover:bg-gray-100 text-gray-700'
          }`}
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          {isFolder ? (
            <span className="w-4 h-4 mr-1 text-gray-400 flex items-center justify-center">
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </span>
          ) : (
            <span className="w-4 h-4 mr-1" />
          )}

          {isFolder ? <Folder className="w-4 h-4 mr-2 text-amber-500" /> : <FileText className="w-4 h-4 mr-2 text-gray-400" />}
          <span className="truncate text-sm">{node.name}</span>
        </button>

        {isFolder && isExpanded && Array.isArray(node.children) && (
          <div className="mt-1">
            {node.children.map((c: any) => renderPreviewFileTree(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full min-h-0 bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-6 shrink-0">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">创作社区</h1>
        <p className="text-gray-500 text-sm">发现优质创作模板和提示词，激发你的写作灵感</p>
      </div>

      {/* Main Tabs */}
      <div className="px-8 pt-6 pb-2 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-end justify-between gap-6">
          <div className="flex space-x-8 overflow-x-auto">
            {mainCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setIsCreating(false);
                  setMainTab(cat.id as any);
                }}
                className={`pb-4 text-sm font-medium transition-colors relative whitespace-nowrap flex items-center ${
                  mainTab === cat.id && !isCreating ? 'text-purple-600' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {cat.icon}
                {cat.label}
                {mainTab === cat.id && !isCreating && (
                  <div className="absolute bottom-0 left-0 w-full h-0.5 bg-purple-600 rounded-t-full" />
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-col items-end">
            <button
              onClick={startCreate}
              className={`mb-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap inline-flex items-center gap-2 ${
                isCreating
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              创建模板
            </button>
            <div className="text-[11px] leading-4 text-gray-400 whitespace-nowrap">
              {user?.id ? `作品模板 ${userWorkTemplateCount}/10 · 提示词 ${userSkillTemplateCount}/20` : '登录后可创建（作品10/提示词20上限）'}
            </div>
          </div>
        </div>
      </div>

      {/* Sub Tabs */}
      <div
        ref={subTabsRef}
        className="px-8 py-3 flex items-center gap-6 border-b border-gray-100 bg-gray-50/50 overflow-x-auto min-h-[48px] shrink-0"
      >
        {(isCreating
          ? createCategories
          : mainTab === 'templates'
            ? templateCategories
            : mainTab === 'skills'
              ? skillCategories
              : mainTab === 'mine'
                ? mineCategories
                : favoritesCategories
        ).map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              if (isCreating) {
                setCreateTab(cat.id as 'template' | 'skill');
                return;
              }
              if (mainTab === 'templates') setTemplateTab(cat.id);
              else if (mainTab === 'skills') setSkillTab(cat.id);
              else if (mainTab === 'mine') setMineTab(cat.id as 'templates' | 'skills');
              else setFavoritesTab(cat.id as 'templates' | 'skills');
            }}
            className={`py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              (isCreating ? createTab : mainTab === 'templates' ? templateTab : mainTab === 'skills' ? skillTab : mainTab === 'mine' ? mineTab : favoritesTab) === cat.id 
                ? 'text-purple-600 border-b-2 border-purple-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
      {/* Content */}
      {isCreating ? (
        <div className="p-8">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-gray-900">
              {createTab === 'template'
                ? editingTemplateId
                  ? '编辑作品模板'
                  : '创建作品模板'
                : editingSkillId
                  ? '编辑提示词模板'
                  : '创建提示词模板'}
            </div>
            <button onClick={exitCreate} className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors">
              返回列表
            </button>
          </div>

          {createTab === 'template' ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1">模板名称</div>
                  <input
                    value={newTemplateTitle}
                    onChange={(e) => setNewTemplateTitle(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                    placeholder="例如：网文小说通用模板"
                  />
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1">分类</div>
                  <select
                    value={newTemplateCategory}
                    onChange={(e) => setNewTemplateCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none bg-white"
                  >
                    <option value="网文小说">网文小说</option>
                    <option value="短故事">短故事</option>
                    <option value="剧本类">剧本类</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2">
                <div>
                  <div className="text-xs font-medium text-gray-700">公开到社区</div>
                  <div className="text-[11px] text-gray-500">关闭后仅你自己可见与可用</div>
                </div>
                <input
                  type="checkbox"
                  checked={newTemplateIsPublic}
                  onChange={(e) => setNewTemplateIsPublic(e.target.checked)}
                  className="h-4 w-4 accent-purple-600"
                />
              </div>

              <div>
                <div className="text-xs font-medium text-gray-600 mb-1">模板说明</div>
                <textarea
                  value={newTemplateDescription}
                  onChange={(e) => setNewTemplateDescription(e.target.value)}
                  className="w-full h-20 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none resize-none"
                  placeholder="描述这个模板适用的创作场景与结构特点"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1">思维导图页面数量</div>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={newTemplateMindMapCount}
                    onChange={(e) => setNewTemplateMindMapCount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                  />
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1">正文章节数量</div>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={newTemplateChapterCount}
                    onChange={(e) => setNewTemplateChapterCount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-4">
                {newTemplateMindMaps.map((m, idx) => (
                  <div key={idx} className="rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50/60 border-b border-gray-100 flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-900">思维导图页面 {idx + 1}</div>
                    </div>
                    <div className="p-4 space-y-3">
                      <div>
                        <div className="text-xs font-medium text-gray-600 mb-1">页面名称</div>
                        <input
                          value={m.name}
                          onChange={(e) => {
                            const v = e.target.value;
                            setNewTemplateMindMaps((prev) => prev.map((p, i) => (i === idx ? { ...p, name: v } : p)));
                          }}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                          placeholder="例如：作品大纲"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs font-medium text-gray-600">节点创建</div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setNewTemplateMindMaps((prev) =>
                                  prev.map((p, i) => {
                                    if (i !== idx) return p;
                                    const tree = p.outlineTree?.length ? p.outlineTree : hydrateOutlineTree(parseDirectoryText(p.outlineText || ''));
                                    const text = outlineTreeToDirectoryText(tree);
                                    return { ...p, outlineMode: 'visual', outlineTree: tree, outlineText: text || p.outlineText };
                                  })
                                );
                              }}
                              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                                m.outlineMode === 'visual' ? 'bg-purple-100 text-purple-700' : 'text-gray-600 hover:bg-gray-100'
                              }`}
                              type="button"
                            >
                              可视化
                            </button>
                            <button
                              onClick={() => {
                                setNewTemplateMindMaps((prev) =>
                                  prev.map((p, i) => {
                                    if (i !== idx) return p;
                                    const text = outlineTreeToDirectoryText(p.outlineTree || []) || p.outlineText;
                                    return { ...p, outlineMode: 'text', outlineText: text };
                                  })
                                );
                              }}
                              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                                m.outlineMode === 'text' ? 'bg-purple-100 text-purple-700' : 'text-gray-600 hover:bg-gray-100'
                              }`}
                              type="button"
                            >
                              目录文本
                            </button>
                          </div>
                        </div>

                        {m.outlineMode === 'visual' ? (
                          <div className="border border-gray-200 rounded-lg p-3 bg-white">
                            <div className="text-xs text-gray-500 mb-2">
                              根节点：{(m.name || '').trim() || '思维导图'}
                            </div>

                            <div className="space-y-2">
                              {(m.outlineTree || []).map((node) => {
                                const renderNode = (n: any, depth: number): React.ReactNode => {
                                  const isCollapsed = !!collapsedOutlineNodeIds[n.id];
                                  const hasChildren = Array.isArray(n.children) && n.children.length > 0;

                                  const IconActionButton = ({
                                    label,
                                    onClick,
                                    children,
                                    className,
                                  }: {
                                    label: string;
                                    onClick: () => void;
                                    children: React.ReactNode;
                                    className: string;
                                  }) => {
                                    return (
                                      <div className="relative group">
                                        <button onClick={onClick} className={className} type="button" aria-label={label}>
                                          {children}
                                        </button>
                                        <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded bg-gray-900 text-white text-[10px] whitespace-nowrap shadow">
                                          {label}
                                        </div>
                                      </div>
                                    );
                                  };

                                  return (
                                    <div key={n.id}>
                                      <div className="flex items-center gap-2" style={{ paddingLeft: depth * 16 }}>
                                        <button
                                          onClick={() => setCollapsedOutlineNodeIds((prev) => ({ ...prev, [n.id]: !prev[n.id] }))}
                                          className={`w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 transition-colors ${
                                            hasChildren ? 'text-gray-500 hover:text-gray-700' : 'text-transparent cursor-default hover:bg-transparent'
                                          }`}
                                          type="button"
                                          aria-label={isCollapsed ? '展开' : '折叠'}
                                        >
                                          {hasChildren ? (isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />) : <span />}
                                        </button>
                                        <span className={`w-1.5 h-1.5 rounded-full ${getDotColorClass(depth)}`} />
                                        <input
                                          value={n.name}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setNewTemplateMindMaps((prev) =>
                                              prev.map((p, i) => {
                                                if (i !== idx) return p;
                                                const nextTree = updateOutlineNodeName(p.outlineTree || [], n.id, v);
                                                const text = outlineTreeToDirectoryText(nextTree);
                                                return { ...p, outlineTree: nextTree, outlineText: text };
                                              })
                                            );
                                          }}
                                          className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                                          placeholder={depth === 0 ? '一级节点' : '子节点'}
                                        />
                                        <IconActionButton
                                          label="新增同级"
                                          onClick={() => {
                                            setNewTemplateMindMaps((prev) =>
                                              prev.map((p, i) => {
                                                if (i !== idx) return p;
                                                const nextTree = addOutlineSiblingAfter(p.outlineTree || [], n.id);
                                                const text = outlineTreeToDirectoryText(nextTree);
                                                return { ...p, outlineTree: nextTree, outlineText: text };
                                              })
                                            );
                                          }}
                                          className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                                        >
                                          <Plus className="w-4 h-4" />
                                        </IconActionButton>
                                        <IconActionButton
                                          label="新增子节点"
                                          onClick={() => {
                                            setNewTemplateMindMaps((prev) =>
                                              prev.map((p, i) => {
                                                if (i !== idx) return p;
                                                const nextTree = addOutlineChild(p.outlineTree || [], n.id);
                                                const text = outlineTreeToDirectoryText(nextTree);
                                                return { ...p, outlineTree: nextTree, outlineText: text };
                                              })
                                            );
                                          }}
                                          className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                                        >
                                          <PlusCircle className="w-4 h-4" />
                                        </IconActionButton>
                                        <IconActionButton
                                          label="删除节点"
                                          onClick={() => {
                                            setNewTemplateMindMaps((prev) =>
                                              prev.map((p, i) => {
                                                if (i !== idx) return p;
                                                const nextTree = removeOutlineNode(p.outlineTree || [], n.id);
                                                const text = outlineTreeToDirectoryText(nextTree);
                                                return { ...p, outlineTree: nextTree, outlineText: text };
                                              })
                                            );
                                          }}
                                          className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-red-600 transition-colors"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </IconActionButton>
                                      </div>

                                      {!isCollapsed && Array.isArray(n.children) && n.children.length > 0 && (
                                        <div className="mt-2 space-y-2">
                                          {n.children.map((c: any) => renderNode(c, depth + 1))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                };

                                return renderNode(node, 0);
                              })}
                            </div>

                            <div className="mt-3">
                              <button
                                onClick={() => {
                                  setNewTemplateMindMaps((prev) =>
                                    prev.map((p, i) => {
                                      if (i !== idx) return p;
                                      const nextTree = [...(p.outlineTree || []), createOutlineNode()];
                                      const text = outlineTreeToDirectoryText(nextTree);
                                      return { ...p, outlineTree: nextTree, outlineText: text };
                                    })
                                  );
                                }}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors inline-flex items-center gap-2"
                                type="button"
                                title="添加一级节点"
                                aria-label="添加一级节点"
                              >
                                <Plus className="w-4 h-4" />
                                添加一级节点
                              </button>
                            </div>
                          </div>
                        ) : (
                          <textarea
                            value={m.outlineText}
                            onChange={(e) => {
                              const v = e.target.value;
                              setNewTemplateMindMaps((prev) =>
                                prev.map((p, i) => {
                                  if (i !== idx) return p;
                                  const tree = hydrateOutlineTree(parseDirectoryText(v || ''));
                                  return { ...p, outlineText: v, outlineTree: tree };
                                })
                              );
                            }}
                            className="w-full h-40 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none resize-none font-mono"
                            placeholder={`开头\n  主角出场\n  核心冲突\n发展\n  关键转折\n高潮\n  最终对决`}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleCreateWorkTemplate}
                  disabled={!editingTemplateId && userWorkTemplateCount >= 10}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-purple-600"
                >
                  {editingTemplateId ? '保存修改' : '创建作品模板'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1">提示词名称</div>
                  <input
                    value={newSkillTitle}
                    onChange={(e) => setNewSkillTitle(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                    placeholder="例如：网文开篇优化"
                  />
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1">分类</div>
                  <select
                    value={newSkillCategory}
                    onChange={(e) => setNewSkillCategory(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none bg-white"
                  >
                    {skillCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-gray-600 mb-1">说明</div>
                <input
                  value={newSkillDescription}
                  onChange={(e) => setNewSkillDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                  placeholder="一句话说明这个提示词的用途"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2">
                <div>
                  <div className="text-xs font-medium text-gray-700">公开到社区</div>
                  <div className="text-[11px] text-gray-500">关闭后仅你自己可见与可用</div>
                </div>
                <input
                  type="checkbox"
                  checked={newSkillIsPublic}
                  onChange={(e) => setNewSkillIsPublic(e.target.checked)}
                  className="h-4 w-4 accent-purple-600"
                />
              </div>

              <div>
                <div className="text-xs font-medium text-gray-600 mb-1">提示词内容</div>
                <textarea
                  value={newSkillPromptText}
                  onChange={(e) => setNewSkillPromptText(e.target.value)}
                  className="w-full h-56 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none resize-none"
                  placeholder="写下你希望 AI 遵循的角色、规则、输出格式等"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleCreateSkillTemplate}
                  disabled={!editingSkillId && userSkillTemplateCount >= 20}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-purple-600"
                >
                  {editingSkillId ? '保存修改' : '创建提示词模板'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
        {mainTab === 'templates' ? (
          loading ? (
            <div className="col-span-full text-center py-20 text-gray-500">加载中...</div>
          ) : (
            (() => {
              const { items, totalPages, page } = getPaged(publicTemplates);
              return (
                <>
                  {items.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => openTemplatePreview(item)}
                      className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow group flex flex-col cursor-pointer"
                    >
                      <div className={`h-32 ${item.cover_color || 'bg-gray-300'} relative p-4 flex flex-col justify-between`}>
                        {item.is_official && (
                          <span className="absolute top-3 right-3 bg-black/25 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full flex items-center">
                            <CheckCircle className="w-3.5 h-3.5 mr-1" /> 官方
                          </span>
                        )}
                        <div className="text-white font-bold text-lg leading-tight drop-shadow-md line-clamp-2">{item.title}</div>
                        <div className="text-white/90 text-xs flex items-center">
                          <span className="opacity-75">By {item.author_name}</span>
                        </div>
                      </div>

                      <div className="p-4 flex-1 flex flex-col">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                          <div className="flex items-center space-x-4">
                            <button
                              onClick={(e) => handleToggleTemplateLike(item, e)}
                              className={`flex items-center transition-colors ${
                                likedTemplateIds.includes(item.id) ? 'text-red-500' : 'hover:text-red-500'
                              }`}
                            >
                              <Heart className={`w-3 h-3 mr-1 ${likedTemplateIds.includes(item.id) ? 'fill-red-500' : ''}`} />
                              {item.likes || 0}
                            </button>
                            <span className="flex items-center">
                              <Eye className="w-3 h-3 mr-1" /> {item.views ?? 0}
                            </span>
                          </div>

                          <button
                            onClick={(e) => handleToggleTemplateCollect(item, e)}
                            className={`p-1 rounded hover:bg-gray-100 transition-colors ${
                              collectedTemplateIds.includes(item.id) ? 'text-purple-600' : 'text-gray-400'
                            }`}
                          >
                            <Star className={`w-4 h-4 ${collectedTemplateIds.includes(item.id) ? 'fill-purple-600' : ''}`} />
                          </button>
                        </div>

                        <p className="text-xs text-gray-500 line-clamp-2 mb-4 flex-1">{item.description || '暂无描述'}</p>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUseTemplate(item);
                          }}
                          className="w-full py-2 bg-gray-50 hover:bg-gray-100 text-gray-900 text-sm font-medium rounded-lg transition-colors border border-gray-200 flex items-center justify-center group-hover:bg-purple-50 group-hover:text-purple-600 group-hover:border-purple-100"
                        >
                          使用模板
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="col-span-full pt-2">
                    <Pagination page={page} totalPages={totalPages} onChange={setCurrentPage} />
                  </div>
                </>
              );
            })()
          )
        ) : mainTab === 'skills' ? (
          (() => {
            const { items, totalPages, page } = getPaged(publicSkills);
            return (
              <>
                {items.map((skill) => {
                  const metrics = getSkillMetrics(skill);
                  const isLiked = isSkillLikedByMe(skill);
                  return (
                    <div
                      key={skill.id}
                      onClick={() => openSkillPreview(skill)}
                      className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow flex flex-col cursor-pointer"
                    >
                      <div className="p-4 border-b border-gray-100 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="text-sm font-semibold text-gray-900 truncate flex-1 min-w-0" title={skill.title}>
                              {skill.title}
                            </div>
                            {skill.is_official && (
                              <span className="inline-flex items-center rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-xs px-2.5 py-1 whitespace-nowrap shrink-0">
                                <CheckCircle className="w-3.5 h-3.5 mr-1" /> 官方
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-500 mt-1 truncate">By {skill.author_name}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopySkillPrompt(skill);
                            }}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-gray-50 hover:bg-purple-100 hover:border-purple-200 transition-colors text-gray-900"
                          >
                            复制
                          </button>
                          <button
                            onClick={(e) => handleImportSkillToPrompts(skill, e)}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-gray-50 hover:bg-purple-100 hover:border-purple-200 transition-colors text-gray-900"
                          >
                            导入
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCollectSkill(skill.id);
                            }}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border ${
                              collectedSkills.includes(skill.id)
                                ? 'bg-purple-100 text-purple-700 border-purple-200'
                                : 'bg-white hover:bg-purple-50 text-gray-700 border-gray-200 hover:border-purple-200 hover:text-purple-700'
                            }`}
                          >
                            {collectedSkills.includes(skill.id) ? '已收藏' : '收藏'}
                          </button>
                        </div>
                      </div>

                      <div className="p-4 flex-1 flex flex-col gap-3">
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <button
                            onClick={(e) => handleToggleSkillLike(skill, e)}
                            className={`flex items-center transition-colors ${
                              isLiked ? 'text-red-500' : 'hover:text-red-500'
                            }`}
                            type="button"
                          >
                            <Heart className={`w-3 h-3 mr-1 ${isLiked ? 'fill-red-500' : ''}`} />
                            {metrics.likes}
                          </button>
                          <span className="flex items-center">
                            <Eye className="w-3 h-3 mr-1" /> {metrics.uses}
                          </span>
                        </div>
                        {skill.description ? <div className="text-xs text-gray-500 line-clamp-2">{skill.description}</div> : null}
                        <div className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap break-words max-h-40 overflow-y-auto pr-1">
                          {skill.prompt_text}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="col-span-full pt-2">
                  <Pagination page={page} totalPages={totalPages} onChange={setCurrentPage} />
                </div>
              </>
            );
          })()
        ) : mainTab === 'mine' ? (
          !user?.id ? (
            <div className="col-span-full text-center py-20 text-gray-500">需要登录后才能查看你创建的模板</div>
          ) : mineTab === 'templates' ? (
            mineTemplates.length === 0 ? (
              <div className="col-span-full text-center py-20 text-gray-500">你还没有创建任何作品模板</div>
            ) : (
              (() => {
                const { items, totalPages, page } = getPaged(mineTemplates);
                return (
                  <>
                    {items.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => openTemplatePreview(item)}
                        className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow group flex flex-col cursor-pointer"
                      >
                        <div className={`h-32 ${item.cover_color || 'bg-gray-300'} relative p-4 flex flex-col justify-between`}>
                          <div className="absolute top-3 right-3 flex items-center gap-2">
                            <button
                              onClick={(e) => startEditWorkTemplate(item, e)}
                              className="bg-black/20 backdrop-blur-sm text-white p-2 rounded-lg hover:bg-black/30 transition-colors"
                              type="button"
                              aria-label="编辑模板"
                              title="编辑模板"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteTemplate(item, e)}
                              className="bg-black/20 backdrop-blur-sm text-white p-2 rounded-lg hover:bg-black/30 transition-colors"
                              type="button"
                              aria-label="删除模板"
                              title="删除模板"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <span className="absolute top-3 left-3 bg-black/25 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full">
                            {item.is_public !== false ? '公开' : '私密'}
                          </span>
                          <div className="text-white font-bold text-lg leading-tight drop-shadow-md line-clamp-2">{item.title}</div>
                          <div className="text-white/90 text-xs flex items-center">
                            <span className="opacity-75">By {item.author_name}</span>
                          </div>
                        </div>

                        <div className="p-4 flex-1 flex flex-col">
                          <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                            <div className="flex items-center space-x-4">
                              <button
                                onClick={(e) => handleToggleTemplateLike(item, e)}
                                className={`flex items-center transition-colors ${
                                  likedTemplateIds.includes(item.id) ? 'text-red-500' : 'hover:text-red-500'
                                }`}
                              >
                                <Heart className={`w-3 h-3 mr-1 ${likedTemplateIds.includes(item.id) ? 'fill-red-500' : ''}`} />
                                {item.likes || 0}
                              </button>
                              <span className="flex items-center">
                                <Eye className="w-3 h-3 mr-1" /> {item.views ?? 0}
                              </span>
                            </div>

                            <button
                              onClick={(e) => handleToggleTemplateCollect(item, e)}
                              className={`p-1 rounded hover:bg-gray-100 transition-colors ${
                                collectedTemplateIds.includes(item.id) ? 'text-purple-600' : 'text-gray-400'
                              }`}
                            >
                              <Star className={`w-4 h-4 ${collectedTemplateIds.includes(item.id) ? 'fill-purple-600' : ''}`} />
                            </button>
                          </div>

                          <p className="text-xs text-gray-500 line-clamp-2 mb-4 flex-1">{item.description || '暂无描述'}</p>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUseTemplate(item);
                            }}
                            className="w-full py-2 bg-gray-50 hover:bg-gray-100 text-gray-900 text-sm font-medium rounded-lg transition-colors border border-gray-200 flex items-center justify-center group-hover:bg-purple-50 group-hover:text-purple-600 group-hover:border-purple-100"
                          >
                            使用模板
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="col-span-full pt-2">
                      <Pagination page={page} totalPages={totalPages} onChange={setCurrentPage} />
                    </div>
                  </>
                );
              })()
            )
          ) : mineSkills.length === 0 ? (
            <div className="col-span-full text-center py-20 text-gray-500">你还没有创建任何提示词模板</div>
          ) : (
            (() => {
              const { items, totalPages, page } = getPaged(mineSkills);
              return (
                <>
                  {items.map((skill) => {
                    const metrics = getSkillMetrics(skill);
                    const isLiked = isSkillLikedByMe(skill);
                    return (
                      <div
                        key={skill.id}
                        onClick={() => openSkillPreview(skill)}
                        className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow flex flex-col cursor-pointer"
                      >
                        <div className="p-4 border-b border-gray-100 flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-semibold text-gray-900 truncate">{skill.title}</div>
                              <span className="inline-flex items-center rounded-full bg-gray-50 text-gray-700 border border-gray-200 text-xs px-2.5 py-1">
                                {skill.is_public !== false ? '公开' : '私密'}
                              </span>
                            </div>
                            <div className="text-[11px] text-gray-500 mt-1 truncate">By {skill.author_name}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={(e) => startEditSkillTemplate(skill, e)}
                              className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                              type="button"
                              aria-label="编辑提示词模板"
                              title="编辑提示词模板"
                            >
                              <Pencil className="w-4 h-4 text-gray-600" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteSkillTemplate(skill, e)}
                              className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-red-50 hover:border-red-200 transition-colors"
                              type="button"
                              aria-label="删除提示词模板"
                              title="删除提示词模板"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          </div>
                        </div>

                        <div className="p-4 flex-1 flex flex-col gap-3">
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <button
                              onClick={(e) => handleToggleSkillLike(skill, e)}
                              className={`flex items-center transition-colors ${
                                isLiked ? 'text-red-500' : 'hover:text-red-500'
                              }`}
                              type="button"
                            >
                              <Heart className={`w-3 h-3 mr-1 ${isLiked ? 'fill-red-500' : ''}`} />
                              {metrics.likes}
                            </button>
                            <span className="flex items-center">
                              <Eye className="w-3 h-3 mr-1" /> {metrics.uses}
                            </span>
                          </div>
                          {skill.description ? <div className="text-xs text-gray-500 line-clamp-2">{skill.description}</div> : null}
                          <div className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap break-words max-h-40 overflow-y-auto pr-1">
                            {skill.prompt_text}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopySkillPrompt(skill);
                              }}
                              className="flex-1 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors text-gray-900"
                            >
                              复制
                            </button>
                            <button
                              onClick={(e) => handleImportSkillToPrompts(skill, e)}
                              className="flex-1 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors text-gray-900"
                            >
                              导入
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCollectSkill(skill.id);
                              }}
                              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors border ${
                                collectedSkills.includes(skill.id)
                                  ? 'bg-purple-100 text-purple-700 border-purple-200'
                                  : 'bg-white hover:bg-purple-50 text-gray-700 border-gray-200 hover:border-purple-200 hover:text-purple-700'
                              }`}
                            >
                              {collectedSkills.includes(skill.id) ? '已收藏' : '收藏'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="col-span-full pt-2">
                    <Pagination page={page} totalPages={totalPages} onChange={setCurrentPage} />
                  </div>
                </>
              );
            })()
          )
        ) : favoritesTab === 'templates' ? (
          !user?.id ? (
            <div className="col-span-full text-center py-20 text-gray-500">需要登录后才能查看你收藏的作品模板</div>
          ) : favoriteTemplates.length === 0 ? (
            <div className="col-span-full text-center py-20 text-gray-500">你还没有收藏任何作品模板</div>
          ) : (
            (() => {
              const { items, totalPages, page } = getPaged(favoriteTemplates);
              return (
                <>
                  {items.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => openTemplatePreview(item)}
                      className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow group flex flex-col cursor-pointer"
                    >
                      <div className={`h-32 ${item.cover_color || 'bg-gray-300'} relative p-4 flex flex-col justify-between`}>
                        {item.is_official && (
                          <span className="absolute top-3 right-3 bg-black/25 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full flex items-center">
                            <CheckCircle className="w-3.5 h-3.5 mr-1" /> 官方
                          </span>
                        )}
                        <div className="text-white font-bold text-lg leading-tight drop-shadow-md line-clamp-2">{item.title}</div>
                        <div className="text-white/90 text-xs flex items-center">
                          <span className="opacity-75">By {item.author_name}</span>
                        </div>
                      </div>

                      <div className="p-4 flex-1 flex flex-col">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                          <div className="flex items-center space-x-4">
                            <button
                              onClick={(e) => handleToggleTemplateLike(item, e)}
                              className={`flex items-center transition-colors ${
                                likedTemplateIds.includes(item.id) ? 'text-red-500' : 'hover:text-red-500'
                              }`}
                            >
                              <Heart className={`w-3 h-3 mr-1 ${likedTemplateIds.includes(item.id) ? 'fill-red-500' : ''}`} />
                              {item.likes || 0}
                            </button>
                            <span className="flex items-center">
                              <Eye className="w-3 h-3 mr-1" /> {item.views ?? 0}
                            </span>
                          </div>

                          <button
                            onClick={(e) => handleToggleTemplateCollect(item, e)}
                            className="p-1 rounded hover:bg-gray-100 transition-colors text-purple-600"
                          >
                            <Star className="w-4 h-4 fill-purple-600" />
                          </button>
                        </div>

                        <p className="text-xs text-gray-500 line-clamp-2 mb-4 flex-1">{item.description || '暂无描述'}</p>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUseTemplate(item);
                          }}
                          className="w-full py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 text-sm font-medium rounded-lg transition-colors border border-purple-200 flex items-center justify-center"
                        >
                          使用模板
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="col-span-full pt-2">
                    <Pagination page={page} totalPages={totalPages} onChange={setCurrentPage} />
                  </div>
                </>
              );
            })()
          )
        ) : favoriteSkills.length === 0 ? (
          <div className="col-span-full text-center py-20 text-gray-500">你还没有收藏任何提示词</div>
        ) : (
          (() => {
            const { items, totalPages, page } = getPaged(favoriteSkills);
            return (
              <>
                {items.map((skill) => {
                  const metrics = getSkillMetrics(skill);
                  const isLiked = isSkillLikedByMe(skill);
                  return (
                    <div
                      key={skill.id}
                      onClick={() => openSkillPreview(skill)}
                      className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow flex flex-col cursor-pointer"
                    >
                      <div className="p-4 border-b border-gray-100 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="text-sm font-semibold text-gray-900 truncate flex-1 min-w-0" title={skill.title}>
                              {skill.title}
                            </div>
                            {skill.is_official && (
                              <span className="inline-flex items-center rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-xs px-2.5 py-1 whitespace-nowrap shrink-0">
                                <CheckCircle className="w-3.5 h-3.5 mr-1" /> 官方
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-500 mt-1 truncate">By {skill.author_name}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopySkillPrompt(skill);
                            }}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-gray-50 hover:bg-purple-100 hover:border-purple-200 transition-colors text-gray-900"
                          >
                            复制
                          </button>
                          <button
                            onClick={(e) => handleImportSkillToPrompts(skill, e)}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-gray-50 hover:bg-purple-100 hover:border-purple-200 transition-colors text-gray-900"
                          >
                            导入
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCollectSkill(skill.id);
                            }}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
                          >
                            取消收藏
                          </button>
                        </div>
                      </div>

                      <div className="p-4 flex-1 flex flex-col gap-3">
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <button
                            onClick={(e) => handleToggleSkillLike(skill, e)}
                            className={`flex items-center transition-colors ${isLiked ? 'text-red-500' : 'hover:text-red-500'}`}
                            type="button"
                          >
                            <Heart className={`w-3 h-3 mr-1 ${isLiked ? 'fill-red-500' : ''}`} />
                            {metrics.likes}
                          </button>
                          <span className="flex items-center">
                            <Eye className="w-3 h-3 mr-1" /> {metrics.uses}
                          </span>
                        </div>
                        {skill.description ? <div className="text-xs text-gray-500 line-clamp-2">{skill.description}</div> : null}
                        <div className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap break-words max-h-48 overflow-y-auto pr-1">
                          {skill.prompt_text}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="col-span-full pt-2">
                  <Pagination page={page} totalPages={totalPages} onChange={setCurrentPage} />
                </div>
              </>
            );
          })()
        )}
        </div>
      )}
      </div>

      {previewSkill && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/25 backdrop-blur-[1px] p-4" onClick={closeSkillPreview}>
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-[900px] max-w-[95vw] max-h-[90vh] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          >
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-base font-bold text-gray-900 truncate" title={previewSkill.title}>
                    {previewSkill.title}
                  </div>
                  {previewSkill.is_official && (
                    <span className="inline-flex items-center rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-xs px-2.5 py-1 whitespace-nowrap shrink-0">
                      <CheckCircle className="w-3.5 h-3.5 mr-1" /> 官方
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">By {previewSkill.author_name}</div>
              </div>
              <button
                onClick={closeSkillPreview}
                className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center text-xs text-gray-500 space-x-4">
                  <button
                    onClick={() => handleToggleSkillLike(previewSkill, { stopPropagation() {} } as any)}
                    className={`flex items-center transition-colors ${
                      isSkillLikedByMe(previewSkill) ? 'text-red-500' : 'hover:text-red-500'
                    }`}
                    type="button"
                  >
                    <Heart className={`w-3 h-3 mr-1 ${isSkillLikedByMe(previewSkill) ? 'fill-red-500' : ''}`} /> {previewSkill.likes || 0}
                  </button>
                  <span className="flex items-center">
                    <Eye className="w-3 h-3 mr-1" /> {previewSkill.uses || 0}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopySkillPrompt(previewSkill)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-gray-50 hover:bg-purple-100 hover:border-purple-200 transition-colors text-gray-900"
                  >
                    复制
                  </button>
                  <button
                    onClick={() => handleImportSkillToPrompts(previewSkill)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-gray-50 hover:bg-purple-100 hover:border-purple-200 transition-colors text-gray-900"
                  >
                    导入
                  </button>
                  <button
                    onClick={() => toggleCollectSkill(previewSkill.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border ${
                      collectedSkills.includes(previewSkill.id)
                        ? 'bg-purple-100 text-purple-700 border-purple-200'
                        : 'bg-white hover:bg-purple-50 text-gray-700 border-gray-200 hover:border-purple-200 hover:text-purple-700'
                    }`}
                  >
                    {collectedSkills.includes(previewSkill.id) ? '已收藏' : '收藏'}
                  </button>
                </div>
              </div>

              {previewSkill.description ? <div className="text-sm text-gray-600 mb-3">{previewSkill.description}</div> : null}
              <div className="text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg p-4 whitespace-pre-wrap break-words max-h-[55vh] overflow-y-auto">
                {previewSkill.prompt_text}
              </div>
            </div>
          </div>
        </div>
      )}

      {previewTemplate && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/25 backdrop-blur-[1px] p-4" onClick={closeTemplatePreview}>
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-[1000px] max-w-[95vw] h-[650px] max-h-[90vh] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50">
              <div className="flex flex-col">
                <div className="text-base font-bold text-gray-900">{previewTemplate.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">By {previewTemplate.author_name}</div>
              </div>
              <button onClick={closeTemplatePreview} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              <div className="w-[320px] border-r border-gray-100 overflow-y-auto p-3">
                <div className="text-xs font-medium text-gray-500 mb-2">包含页面</div>
                {previewStructure ? renderPreviewFileTree(previewStructure) : <div className="text-xs text-gray-400">模板结构为空</div>}
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <div className="text-xs font-medium text-gray-500 mb-2">思维导图节点预览</div>
                {(() => {
                  const selected = findPreviewNode(previewStructure, selectedPreviewNodeId);
                  if (!selected) return <div className="text-xs text-gray-400">请选择左侧一个页面</div>;
                  if (selected.type !== 'mindmap') return <div className="text-xs text-gray-400">该页面不是思维导图页面</div>;
                  const tree = selected.savedMindMap
                    ? buildPreviewTreeFromSavedMindMap(selected.savedMindMap)
                    : mindMapPresetNodes[selected.mindMapType as string] || [];
                  return tree.length > 0 ? (
                    <div className="bg-gray-50/50 border border-gray-100 rounded-lg p-3">{renderPreviewNodes(tree)}</div>
                  ) : (
                    <div className="text-xs text-gray-400">暂无节点数据</div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Community;
