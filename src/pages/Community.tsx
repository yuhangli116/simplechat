import React, { useState } from 'react';
import { Heart, MessageSquare, Eye, Download, Search } from 'lucide-react';

const Community = () => {
  const [activeTab, setActiveTab] = useState('webnovel');

  const categories = [
    { id: 'webnovel', label: '网文小说' },
    { id: 'short', label: '短故事' },
    { id: 'script', label: '剧本类' },
    { id: 'prompt', label: '提示词' },
    { id: 'wish', label: '许愿池' },
  ];

  const resources = [
    {
      id: 1,
      title: '小说通用模板 (50章节版)',
      author: '僵尸道士',
      category: '古风言情',
      content: '4个思维导图、51个文本文件\n1个提示词',
      stats: { likes: 89, downloads: 1278, comments: 1 },
      coverColor: 'bg-gradient-to-br from-orange-400 to-red-500',
      isHot: true
    },
    {
      id: 2,
      title: '觉醒成灭世协议，我被国家托管了',
      author: '匿名作家',
      category: '科幻末世',
      content: '4个思维导图、51个文本文件',
      stats: { likes: 41, downloads: 205, comments: 0 },
      coverColor: 'bg-gradient-to-br from-blue-600 to-purple-800'
    },
    {
      id: 3,
      title: '【三金】网文小说通用模板',
      author: '飞鹰77',
      category: '都市脑洞',
      content: '10个思维导图、3个文本文件\n1个提示词',
      stats: { likes: 93, downloads: 843, comments: 2 },
      coverColor: 'bg-gradient-to-br from-yellow-500 to-yellow-700'
    },
    {
      id: 4,
      title: '有手就会，有脚也行',
      author: '秋末呢',
      category: '都市高武',
      content: '4个思维导图、3个文本文件\n1个提示词',
      stats: { likes: 85, downloads: 399, comments: 0 },
      coverColor: 'bg-gradient-to-br from-gray-600 to-gray-800'
    },
    {
      id: 5,
      title: '闺蜜夸小叔温柔，可他暗里唤我宝',
      author: '大爱仙尊',
      category: '都市日常',
      content: '4个思维导图、6个文本文件\n1个提示词',
      stats: { likes: 40, downloads: 97, comments: 0 },
      coverColor: 'bg-gradient-to-br from-pink-400 to-pink-600',
      tag: '官方'
    },
    {
      id: 6,
      title: '百万在读新书，书名封面做对什么',
      author: '大爱仙尊',
      category: '都市日常',
      content: '1个思维导图\n1个提示词',
      stats: { likes: 72, downloads: 107, comments: 0 },
      coverColor: 'bg-gradient-to-br from-green-600 to-green-800',
      tag: '官方'
    },
    {
      id: 7,
      title: '写小说如何塑造角色？',
      author: '大爱仙尊',
      category: '都市脑洞',
      content: '1个思维导图\n1个提示词',
      stats: { likes: 114, downloads: 160, comments: 1 },
      coverColor: 'bg-gradient-to-br from-indigo-400 to-indigo-600',
      tag: '官方'
    },
    {
      id: 8,
      title: '开局截胡病弱虚，以歌姬',
      author: '大爱仙尊',
      category: '都市高武',
      content: '5个思维导图、3个文本文件\n1个提示词',
      stats: { likes: 162, downloads: 232, comments: 2 },
      coverColor: 'bg-gradient-to-br from-purple-400 to-purple-600',
      tag: '官方'
    },
  ];

  return (
    <div className="flex-1 h-full bg-gray-50 flex flex-col">
      {/* Tabs Header */}
      <div className="bg-white border-b border-gray-200 px-8 pt-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">创作社区</h1>
        <div className="flex items-center space-x-8">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              className={`pb-4 text-sm font-medium transition-colors relative ${
                activeTab === cat.id ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {cat.label}
              {activeTab === cat.id && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gray-900" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {resources.map(item => (
              <div key={item.id} className="bg-white rounded-xl overflow-hidden border border-gray-100 hover:shadow-lg transition-shadow group cursor-pointer">
                {/* Cover */}
                <div className={`h-40 w-full ${item.coverColor} relative p-4 flex flex-col justify-end`}>
                  <h3 className="text-white font-bold text-lg leading-tight shadow-sm drop-shadow-md">
                    {item.title}
                  </h3>
                  {item.tag && (
                    <span className="absolute top-2 left-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-1.5 py-0.5 rounded">
                      {item.tag}
                    </span>
                  )}
                </div>

                {/* Details */}
                <div className="p-4">
                  <div className="flex items-center mb-3">
                    <div className="w-5 h-5 rounded-full bg-gray-200 mr-2 overflow-hidden">
                       <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${item.author}`} alt="avatar" />
                    </div>
                    <span className="text-xs font-medium text-gray-700 truncate flex-1">{item.author}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                      {item.category}
                    </span>
                  </div>

                  <div className="text-xs text-gray-500 mb-4 whitespace-pre-line leading-relaxed">
                    {item.content}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center justify-between text-gray-400 text-xs border-t border-gray-50 pt-3">
                    <div className="flex items-center space-x-3">
                      <span className="flex items-center hover:text-pink-500">
                        <Heart className="w-3.5 h-3.5 mr-1" />
                        {item.stats.likes}
                      </span>
                      <span className="flex items-center hover:text-blue-500">
                        <Download className="w-3.5 h-3.5 mr-1" />
                        {item.stats.downloads}
                      </span>
                    </div>
                    <span className="flex items-center hover:text-green-500">
                      <MessageSquare className="w-3.5 h-3.5 mr-1" />
                      {item.stats.comments}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Community;
