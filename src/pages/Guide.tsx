import React, { useState, useEffect } from 'react';
import { 
  Play, 
  BookOpen, 
  Search, 
  ChevronRight, 
  HelpCircle,
  FileText,
  Video
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';

type Tutorial = Database['public']['Tables']['tutorials']['Row'];

const Guide = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'video' | 'text'>('all');
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTutorials = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('tutorials')
          .select('*')
          .order('views', { ascending: false });
        
        if (error) {
          console.error('Error fetching tutorials:', error);
        } else {
          setTutorials(data || []);
        }
      } catch (err) {
        console.error('Unexpected error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTutorials();
  }, []);

  // Mock Fallback
  const mockTutorials: Tutorial[] = [
    {
      id: 'mock-1',
      type: 'video',
      title: '新手入门：3分钟快速上手 AI 创作',
      duration: '03:12',
      thumbnail_url: 'bg-blue-100',
      views: 12000,
      category: '入门指南',
      content: null,
      video_url: null,
      created_at: new Date().toISOString()
    },
    {
      id: 'mock-2',
      type: 'video',
      title: '思维导图功能详解：如何构建复杂世界观',
      duration: '05:45',
      thumbnail_url: 'bg-purple-100',
      views: 8500,
      category: '进阶技巧',
      content: null,
      video_url: null,
      created_at: new Date().toISOString()
    },
    {
      id: 'mock-3',
      type: 'text',
      title: '如何使用"提示词库"提高写作效率？',
      duration: '3 min',
      thumbnail_url: 'bg-green-100',
      views: 5000,
      category: '效率工具',
      content: '详细介绍提示词的预设、调用以及高级参数设置...',
      video_url: null,
      created_at: new Date().toISOString()
    }
  ];

  const displayTutorials = tutorials.length > 0 ? tutorials : mockTutorials;

  const filteredTutorials = displayTutorials.filter(item => {
    if (activeTab !== 'all' && item.type !== activeTab) return false;
    if (searchTerm && !item.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex-1 h-full bg-gray-50 flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">教程专区</h1>
        <div className="max-w-2xl relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input 
            type="text" 
            placeholder="搜索教程、指南或问题..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="px-8 py-6 flex space-x-4">
        <button 
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            activeTab === 'all' ? 'bg-black text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
          }`}
        >
          全部教程
        </button>
        <button 
          onClick={() => setActiveTab('video')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center ${
            activeTab === 'video' ? 'bg-black text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Video className="w-4 h-4 mr-2" />
          视频教程
        </button>
        <button 
          onClick={() => setActiveTab('text')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center ${
            activeTab === 'text' ? 'bg-black text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
          }`}
        >
          <FileText className="w-4 h-4 mr-2" />
          图文指南
        </button>
      </div>

      {/* Content List */}
      <div className="flex-1 p-8 pt-0">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {loading ? (
             <div className="p-10 text-center text-gray-500">加载中...</div>
          ) : filteredTutorials.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {filteredTutorials.map(item => (
                <div key={item.id} className="p-6 hover:bg-gray-50 transition-colors flex items-start group cursor-pointer">
                  {/* Thumbnail */}
                  <div className={`w-40 h-24 rounded-lg flex-shrink-0 mr-6 relative overflow-hidden ${item.thumbnail_url || 'bg-gray-200'} flex items-center justify-center`}>
                    {item.type === 'video' ? (
                      <div className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                        <Play className="w-4 h-4 text-black ml-1" />
                      </div>
                    ) : (
                      <BookOpen className="w-8 h-8 text-gray-400" />
                    )}
                    {item.duration && (
                      <span className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                        {item.duration}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded mr-2 ${
                        item.type === 'video' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {item.category}
                      </span>
                      <h3 className="text-lg font-bold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                        {item.title}
                      </h3>
                    </div>
                    <p className="text-gray-500 text-sm mb-3 line-clamp-2">
                      {item.content || '暂无简介...'}
                    </p>
                    <div className="flex items-center text-xs text-gray-400">
                      <span className="mr-4">{item.views ? (item.views > 1000 ? `${(item.views/1000).toFixed(1)}k` : item.views) : 0} 次观看</span>
                      <span className="flex items-center text-blue-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        立即学习 <ChevronRight className="w-3 h-3 ml-1" />
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-20 text-center text-gray-500 flex flex-col items-center">
              <Search className="w-12 h-12 mb-4 text-gray-300" />
              <p>没有找到相关教程</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Guide;
