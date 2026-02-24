import React from 'react';
import { Plus, BookOpen, Clock, MoreVertical } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const works = [
    { id: 1, title: '剑道独尊', words: '12.5万字', updated: '2小时前', cover: 'bg-blue-500' },
    { id: 2, title: '星际迷航：重启', words: '5.8万字', updated: '1天前', cover: 'bg-purple-500' },
    { id: 3, title: '都市修仙传', words: '2300字', updated: '3天前', cover: 'bg-green-500' },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">我的作品</h1>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-5 h-5" />
          <span>新建作品</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* New Project Card */}
        <div className="aspect-[3/4] border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50 cursor-pointer transition-all group">
          <div className="w-12 h-12 rounded-full bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center mb-3 transition-colors">
            <Plus className="w-6 h-6" />
          </div>
          <span className="font-medium">创建新书</span>
        </div>

        {/* Work Cards */}
        {works.map((work) => (
          <Link to="/workspace/editor" key={work.id} className="group relative aspect-[3/4] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
            <div className={`h-2/3 ${work.cover} relative`}>
              <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1.5 bg-white/90 rounded-full hover:bg-white text-gray-700">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4">
              <h3 className="font-bold text-gray-900 mb-1 truncate">{work.title}</h3>
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                <BookOpen className="w-3 h-3" />
                <span>{work.words}</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Clock className="w-3 h-3" />
                <span>{work.updated}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
