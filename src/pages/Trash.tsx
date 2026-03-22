import React, { useState, useMemo, useEffect } from 'react';
import { 
  Trash2, 
  RefreshCcw, 
  Search, 
  Filter, 
  AlertCircle,
  FileText,
  Folder,
  Map,
  GitBranch,
  MessageSquare
} from 'lucide-react';
import { useTrashStore, TrashItem } from '@/store/useTrashStore';
import { useFileStore, FileNode } from '@/store/useFileStore';
import { usePromptStore, Prompt } from '@/store/usePromptStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useNavigate } from 'react-router-dom';

const Trash = () => {
  const { items, restoreItem, permanentlyDelete, clearTrash, syncFromSupabase } = useTrashStore();
  const { addNode } = useFileStore();
  const { addPrompt } = usePromptStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [filterType, setFilterType] = useState<'all' | 'work' | 'prompt'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Sync with Supabase on mount
    syncFromSupabase();
  }, [syncFromSupabase]);

  // Login check - REMOVED for Dev Mode/User Request
  // if (!user) {
  //   return (
  //     <div className="flex flex-col items-center justify-center h-full text-gray-500">
  //       <Trash2 className="w-12 h-12 mb-4 text-gray-300" />
  //       <p className="text-lg font-medium mb-2">请先登录</p>
  //       <p className="text-sm mb-4">查看回收站需要登录账号</p>
  //       <button 
  //         onClick={() => navigate('/login')}
  //         className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
  //       >
  //         去登录
  //       </button>
  //     </div>
  //   );
  // }

  // Filter and Search
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Type Filter
      if (filterType === 'work') {
        if (!['work', 'chapter', 'mindmap', 'file', 'folder'].includes(item.type)) return false;
      }
      if (filterType === 'prompt') {
        if (item.type !== 'prompt') return false;
      }

      // Search Filter
      if (searchTerm) {
        const lowerTerm = searchTerm.toLowerCase();
        return item.title.toLowerCase().includes(lowerTerm);
      }

      return true;
    });
  }, [items, filterType, searchTerm]);

  // Selection Handling
  const handleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.id)));
    }
  };

  const handleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  // Actions
  const handleRestore = async (id: string) => {
    const item = await restoreItem(id);
    if (!item) return;

    if (item.type === 'prompt') {
      addPrompt(item.content as Prompt);
    } else {
      // Restore to original parent if available, otherwise root
      addNode(item.content as FileNode, item.parentId); 
    }
    
    // Clear selection if restored
    if (selectedIds.has(id)) {
      const newSet = new Set(selectedIds);
      newSet.delete(id);
      setSelectedIds(newSet);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要彻底删除吗？此操作无法撤销。')) {
      await permanentlyDelete(id);
      const newSet = new Set(selectedIds);
      newSet.delete(id);
      setSelectedIds(newSet);
    }
  };

  const handleBatchRestore = async () => {
    if (selectedIds.size === 0) return;
    if (confirm(`确定要恢复选中的 ${selectedIds.size} 项内容吗？`)) {
      for (const id of Array.from(selectedIds)) {
        const item = await restoreItem(id);
        if (item) {
          if (item.type === 'prompt') {
            addPrompt(item.content as Prompt);
          } else {
            addNode(item.content as FileNode, item.parentId);
          }
        }
      }
      setSelectedIds(new Set());
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (confirm(`确定要彻底删除选中的 ${selectedIds.size} 项内容吗？此操作无法撤销。`)) {
      for (const id of Array.from(selectedIds)) {
        await permanentlyDelete(id);
      }
      setSelectedIds(new Set());
    }
  };

  const handleClearTrash = async () => {
    if (confirm('确定要清空回收站吗？所有内容将被永久删除且无法找回。')) {
      await clearTrash();
      setSelectedIds(new Set());
    }
  };

  // Helper for icons
  const getItemIcon = (type: string) => {
    switch (type) {
      case 'work': return <Folder className="w-5 h-5 text-yellow-500" />;
      case 'folder': return <Folder className="w-5 h-5 text-yellow-500" />;
      case 'chapter': return <FileText className="w-5 h-5 text-gray-500" />;
      case 'file': return <FileText className="w-5 h-5 text-gray-500" />;
      case 'mindmap': return <GitBranch className="w-5 h-5 text-purple-500" />;
      case 'prompt': return <MessageSquare className="w-5 h-5 text-green-500" />;
      default: return <FileText className="w-5 h-5 text-gray-400" />;
    }
  };

  // Helper for type text
  const getTypeName = (type: string) => {
    switch (type) {
      case 'work': return '作品';
      case 'folder': return '文件夹';
      case 'chapter': return '章节';
      case 'file': return '文件';
      case 'mindmap': return '思维导图';
      case 'prompt': return '提示词';
      default: return '未知';
    }
  };

  // Format date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Format remaining days
  const getRemainingDays = (expiresAt: number) => {
    const now = Date.now();
    const diff = expiresAt - now;
    if (diff <= 0) return '即将过期';
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return `${days}天后过期`;
  };

  const renderItems = () => {
    if (filteredItems.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Trash2 className="w-12 h-12 mb-4 text-gray-200" />
          <p>回收站空空如也</p>
        </div>
      );
    }

    const groups: { [key: string]: { workName: string; items: TrashItem[]; isFullWork: boolean; id: string } } = {};
    const standaloneItems: TrashItem[] = [];

    filteredItems.forEach(item => {
      if (item.type === 'prompt') {
        standaloneItems.push(item);
        return;
      }
      
      const isFullWork = item.extra?.isFullWork;
      const groupKey = item.workName || item.title;

      if (isFullWork) {
        groups[item.id] = { workName: item.title, items: [item], isFullWork: true, id: item.id };
      } else if (item.workName) {
        if (!groups[item.workName]) {
          groups[item.workName] = { workName: item.workName, items: [], isFullWork: false, id: `group-${item.workName}` };
        }
        groups[item.workName].items.push(item);
      } else {
        standaloneItems.push(item);
      }
    });

    return (
      <div className="flex flex-col">
        {Object.values(groups).map(group => (
          <div key={group.id} className="mb-4 bg-white border border-gray-200 rounded-lg overflow-hidden">
            {/* Group Header (Pseudo-work or Full Work) */}
            <div className="flex items-center justify-between p-3 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center">
                <Folder className="w-5 h-5 text-yellow-500 mr-2" />
                <span className="font-medium text-gray-900">{group.workName}</span>
                <span className="ml-2 text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full">
                  {group.isFullWork ? '完整作品' : `包含 ${group.items.length} 个页面`}
                </span>
              </div>
              {group.isFullWork && (
                <div className="flex space-x-2">
                  <button onClick={() => handleRestore(group.items[0].id)} className="text-xs text-blue-600 hover:text-blue-800">恢复整个作品</button>
                  <button onClick={() => handleDelete(group.items[0].id)} className="text-xs text-red-600 hover:text-red-800">彻底删除</button>
                </div>
              )}
            </div>
            
            {/* Group Items */}
            <div className="divide-y divide-gray-100">
              {group.items.map(item => (
                <div key={item.id} className={`grid grid-cols-12 gap-4 p-3 items-center hover:bg-gray-50 transition-colors ${selectedIds.has(item.id) ? 'bg-blue-50/50' : ''}`}>
                  <div className="col-span-1 flex items-center justify-center">
                    <input 
                      type="checkbox" 
                      checked={selectedIds.has(item.id)}
                      onChange={() => handleSelect(item.id)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-4 flex items-center min-w-0 pl-4">
                    <span className="mr-3">{getItemIcon(item.type)}</span>
                    <span className="truncate text-sm text-gray-800" title={item.title}>{item.title}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                      {getTypeName(item.type)}
                    </span>
                  </div>
                  <div className="col-span-2 text-xs text-gray-500">
                    {formatDate(item.deletedAt)}
                  </div>
                  <div className="col-span-1 text-xs text-orange-600 font-medium">
                    {getRemainingDays(item.expiresAt)}
                  </div>
                  <div className="col-span-2 flex justify-end space-x-2">
                    {!group.isFullWork && (
                      <button 
                        onClick={() => handleRestore(item.id)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors text-xs flex items-center"
                        title="恢复"
                      >
                        <RefreshCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!group.isFullWork && (
                      <button 
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors text-xs flex items-center"
                        title="彻底删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Standalone Items (e.ps. Prompts) */}
        {standaloneItems.length > 0 && (
          <div className="mb-4 bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center p-3 bg-gray-50 border-b border-gray-100">
              <span className="font-medium text-gray-900">其他项目</span>
            </div>
            <div className="divide-y divide-gray-100">
              {standaloneItems.map(item => (
                <div key={item.id} className={`grid grid-cols-12 gap-4 p-3 items-center hover:bg-gray-50 transition-colors ${selectedIds.has(item.id) ? 'bg-blue-50/50' : ''}`}>
                  <div className="col-span-1 flex items-center justify-center">
                    <input 
                      type="checkbox" 
                      checked={selectedIds.has(item.id)}
                      onChange={() => handleSelect(item.id)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-4 flex items-center min-w-0 pl-4">
                    <span className="mr-3">{getItemIcon(item.type)}</span>
                    <span className="truncate text-sm text-gray-800" title={item.title}>{item.title}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                      {getTypeName(item.type)}
                    </span>
                  </div>
                  <div className="col-span-2 text-xs text-gray-500">
                    {formatDate(item.deletedAt)}
                  </div>
                  <div className="col-span-1 text-xs text-orange-600 font-medium">
                    {getRemainingDays(item.expiresAt)}
                  </div>
                  <div className="col-span-2 flex justify-end space-x-2">
                    <button 
                      onClick={() => handleRestore(item.id)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors text-xs flex items-center"
                      title="恢复"
                    >
                      <RefreshCcw className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors text-xs flex items-center"
                      title="彻底删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 h-full bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Trash2 className="w-6 h-6 text-gray-700 mr-2" />
            <h1 className="text-xl font-bold text-gray-800">回收站</h1>
          </div>
          
          <div className="flex space-x-3">
            {selectedIds.size > 0 && (
              <>
                <button 
                  onClick={handleBatchRestore}
                  className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium flex items-center"
                >
                  <RefreshCcw className="w-4 h-4 mr-2" />
                  恢复选中 ({selectedIds.size})
                </button>
                <button 
                  onClick={handleBatchDelete}
                  className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium flex items-center"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  彻底删除 ({selectedIds.size})
                </button>
              </>
            )}
            <button 
              onClick={handleClearTrash}
              disabled={items.length === 0}
              className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              清空回收站
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between">
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
            <button 
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filterType === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              全部
            </button>
            <button 
              onClick={() => setFilterType('work')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filterType === 'work' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              我的作品
            </button>
            <button 
              onClick={() => setFilterType('prompt')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filterType === 'prompt' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              提示词
            </button>
          </div>

          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="搜索回收站内容..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          {/* Table Body */}
          {renderItems()}
        </div>
        
        <div className="mt-4 flex items-start p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
          <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 text-blue-500" />
          <p>
            说明：回收站中的内容将保留 30 天，到期后会自动永久删除。
            <br />
            恢复作品时，将默认恢复到列表底部；恢复提示词时将回到提示词库列表。
          </p>
        </div>
      </div>
    </div>
  );
};

export default Trash;
