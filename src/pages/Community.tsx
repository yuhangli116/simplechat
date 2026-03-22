import React, { useState, useEffect } from 'react';
import { Heart, MessageSquare, Eye, Download, Search, FileText, CheckCircle } from 'lucide-react';
import { useFileStore, FileNode } from '@/store/useFileStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';

type Template = Database['public']['Tables']['community_templates']['Row'];

const Community = () => {
  const [activeTab, setActiveTab] = useState('webnovel');
  const { addNode } = useFileStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [resources, setResources] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  const categories = [
    { id: 'webnovel', label: '网文小说' },
    { id: 'short', label: '短故事' },
    { id: 'script', label: '剧本类' },
    { id: 'prompt', label: '提示词' },
    { id: 'wish', label: '许愿池' },
  ];

  useEffect(() => {
    const fetchTemplates = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('community_templates')
          .select('*')
          .order('likes', { ascending: false });
        
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

    fetchTemplates();
  }, []);

  // Mock Data fallback if DB is empty (optional, but good for demo if DB is empty)
  const mockResources = [
    {
      id: 'mock-1',
      title: '小说通用模板 (50章节版)',
      author_name: '僵尸道士',
      category: '古风言情',
      content: {
        type: 'folder',
        name: '小说通用模板',
        children: [
           { 
             id: 'meta-temp-1', 
             name: '作品相关', 
             type: 'folder', 
             children: [
               { id: 'mm-outline-temp-1', name: '作品大纲', type: 'mindmap', mindMapType: 'outline' },
               { id: 'mm-world-temp-1', name: '世界设定', type: 'mindmap', mindMapType: 'world' },
               { id: 'mm-char-temp-1', name: '角色塑造', type: 'mindmap', mindMapType: 'character' },
               { id: 'mm-event-temp-1', name: '事件细纲', type: 'mindmap', mindMapType: 'event' },
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
      likes: 89,
      downloads: 1278,
      cover_color: 'bg-gradient-to-br from-orange-400 to-red-500',
      is_official: true,
      tags: [],
      created_at: new Date().toISOString()
    },
    {
      id: 'mock-6',
      title: '更多模板即将上线',
      author_name: '官方',
      category: '其他',
      content: { type: 'folder', name: 'Empty', children: [] },
      likes: 0,
      downloads: 0,
      cover_color: 'bg-gray-200'
    }
  ];

  const displayResources = resources.length > 0 ? resources : mockResources;

  const handleUseTemplate = async (template: any) => {
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
            }

            return {
                ...node,
                id: finalId,
                path: path,
                children: node.children ? node.children.map((child: any) => copyStructure(child, assignedWorkId)) : undefined
            };
        };
        
        // Ensure content is parsed if it's a string (JSON) or use as is
        let structure = template.content;
        if (typeof structure === 'string') {
            try {
                structure = JSON.parse(structure);
            } catch (e) {
                console.error("Failed to parse template content", e);
                return;
            }
        }

        // Check if the template structure is just an empty shell and we need to inject default content
        // This is useful if the DB has the old empty 'children: []' data for '小说通用模板'
        if (template.title.includes('小说通用模板') && (!structure.children || structure.children.length === 0)) {
             structure.children = [
                 { 
                   id: 'meta-temp', 
                   name: '作品相关', 
                   type: 'folder', 
                   children: [
                     { id: 'mm-outline', name: '作品大纲', type: 'mindmap', mindMapType: 'outline' },
                     { id: 'mm-world', name: '世界设定', type: 'mindmap', mindMapType: 'world' },
                     { id: 'mm-char', name: '角色塑造', type: 'mindmap', mindMapType: 'character' },
                     { id: 'mm-event', name: '事件细纲', type: 'mindmap', mindMapType: 'event' },
                   ] 
                 },
                 {
                   id: 'chapters-temp',
                   name: '正文情节',
                   type: 'folder',
                   children: Array.from({ length: 10 }, (_, i) => ({
                     id: `ch-${i + 1}`,
                     name: `第${i + 1}章`,
                     type: 'file'
                   }))
                 }
             ];
        }

        if (structure) {
            const newNode = copyStructure(structure);
            // Append random suffix to the work name
            if (newNode.type === 'folder') {
                newNode.name = `${newNode.name}${Math.floor(Math.random() * 1000)}`;
            }
            addNode(newNode);
            alert('模板已应用到工作区！');
            
            // Update download count in DB
            if (template.id && typeof template.id === 'string' && !template.id.startsWith('mock-')) {
                await supabase.rpc('increment_downloads', { template_id: template.id }).catch(() => {
                   // Fallback if RPC doesn't exist, ignore error
                });
            }
        }
    }
  };

  return (
    <div className="flex-1 h-full bg-gray-50 flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">创作社区</h1>
        <p className="text-gray-500 text-sm">发现优质创作模板，激发你的写作灵感</p>
      </div>

      {/* Tabs */}
      <div className="px-8 pt-6 pb-2 flex space-x-6 border-b border-gray-200 bg-white overflow-x-auto">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveTab(cat.id)}
            className={`pb-4 text-sm font-medium transition-colors relative whitespace-nowrap ${
              activeTab === cat.id ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {cat.label}
            {activeTab === cat.id && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content Grid */}
      <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {loading ? (
            <div className="col-span-full text-center py-20 text-gray-500">加载中...</div>
        ) : displayResources.map(item => (
          <div key={item.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow group flex flex-col">
            {/* Cover */}
            <div className={`h-32 ${item.cover_color || 'bg-gray-300'} relative p-4 flex flex-col justify-between`}>
               {item.is_official && (
                 <span className="absolute top-3 right-3 bg-black/20 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-full flex items-center">
                   <CheckCircle className="w-3 h-3 mr-1" /> 官方
                 </span>
               )}
               <div className="text-white font-bold text-lg leading-tight drop-shadow-md line-clamp-2">
                 {item.title}
               </div>
               <div className="text-white/90 text-xs flex items-center">
                 <span className="opacity-75">By {item.author_name}</span>
               </div>
            </div>

            {/* Info */}
            <div className="p-4 flex-1 flex flex-col">
               <div className="flex items-center text-xs text-gray-500 mb-3 space-x-4">
                 <span className="flex items-center"><Heart className="w-3 h-3 mr-1" /> {item.likes || 0}</span>
                 <span className="flex items-center"><Download className="w-3 h-3 mr-1" /> {item.downloads || 0}</span>
               </div>
               
               <p className="text-xs text-gray-500 line-clamp-2 mb-4 flex-1">
                 {item.description || '暂无描述'}
               </p>

               <button 
                 onClick={() => handleUseTemplate(item)}
                 className="w-full py-2 bg-gray-50 hover:bg-gray-100 text-gray-900 text-sm font-medium rounded-lg transition-colors border border-gray-200 flex items-center justify-center group-hover:bg-blue-50 group-hover:text-blue-600 group-hover:border-blue-100"
               >
                 <Download className="w-4 h-4 mr-2" />
                 使用模板
               </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Community;