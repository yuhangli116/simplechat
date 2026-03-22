import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { 
  Folder, 
  Trash2, 
  Home, 
  Gift, 
  BookOpen, 
  Database, 
  CreditCard, 
  Calendar, 
  Monitor, 
  Settings, 
  Sun,
  Moon,
  LogOut,
  ChevronRight
} from 'lucide-react';
import { useThemeStore } from '@/store/useThemeStore';
import FileTree from '@/components/FileTree';
import UserTopBar from '@/components/UserTopBar';

const WorkspaceLayout = () => {
  const { theme, toggleTheme } = useThemeStore();
  const location = useLocation();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);

  // Determine if we should show the FileTree (secondary sidebar)
  // Only show FileTree when in /workspace path
  const showFileTree = location.pathname.startsWith('/workspace'); 

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* 1. Global Sidebar (Leftmost) */}
      <aside className={`${isSidebarCollapsed ? 'w-16' : 'w-56'} flex-shrink-0 bg-white border-r border-gray-200 flex flex-col py-4 z-20 transition-all duration-300`}>
        {/* Branding */}
        <div className={`px-6 mb-6 flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}>
          <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white flex-shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          {!isSidebarCollapsed && <span className="text-lg font-bold text-gray-900 tracking-tight whitespace-nowrap">简单写作</span>}
        </div>

        {/* Navigation Icons */}
        <div className="flex-1 w-full space-y-6 overflow-y-auto no-scrollbar flex flex-col px-3">
          
          {/* Section: Creation */}
          <div className="w-full flex flex-col space-y-1">
            <NavIcon to="/workspace" icon={Folder} label="我的作品" collapsed={isSidebarCollapsed} />
            <NavIcon to="/trash" icon={Trash2} label="回收站" collapsed={isSidebarCollapsed} />
          </div>

          <div className="mx-3 h-px bg-gray-200" />

          {/* Section: Discovery */}
          <div className="w-full flex flex-col space-y-1">
            <NavIcon to="/community" icon={Home} label="创作社区" collapsed={isSidebarCollapsed} />
            <NavIcon to="/welfare" icon={Gift} label="领取福利" collapsed={isSidebarCollapsed} />
            <NavIcon to="/guide" icon={BookOpen} label="教程专区" collapsed={isSidebarCollapsed} />
          </div>

          <div className="mx-3 h-px bg-gray-200" />

          {/* Section: More */}
          <div className="w-full flex flex-col space-y-1">
            <NavIcon to="/prompts" icon={Database} label="提示词库" collapsed={isSidebarCollapsed} />
            <NavIcon to="/membership" icon={CreditCard} label="充值会员" collapsed={isSidebarCollapsed} />
            <NavIcon to="/records" icon={Calendar} label="星石记录" collapsed={isSidebarCollapsed} />
            <NavIcon to="/download" icon={Monitor} label="下载软件" collapsed={isSidebarCollapsed} />
          </div>
        </div>

        {/* Bottom Actions & User Profile */}
        <div className="mt-auto px-4 pb-4">
          {/* User Profile - Moved to Top Bar */}
          {/* <div className={`flex items-center gap-3 mb-4 p-2 rounded-lg bg-gray-50 border border-gray-100 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-xs border border-purple-200 flex-shrink-0">
              {user?.email?.[0].toUpperCase() || 'G'}
            </div>
            {!isSidebarCollapsed && (
              <div className="flex flex-col overflow-hidden flex-1">
                <span className="text-xs font-medium text-gray-900 truncate">{user?.email || 'Guest'}</span>
                <span className="text-[10px] text-gray-500">普通用户</span>
              </div>
            )}
          </div> */}

          {/* Action Buttons */}
          <div className={`flex items-center ${isSidebarCollapsed ? 'flex-col space-y-2' : 'justify-between'}`}>
            <button 
              className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors" 
              title="切换主题"
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
            <button 
              className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors" 
              title="设置"
              onClick={() => alert('设置功能开发中')}
            >
              <Settings className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
              className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors" 
              title={isSidebarCollapsed ? "展开" : "收起"}
            >
              {isSidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <LogOut className="w-5 h-5 rotate-180" />}
            </button>
          </div>
        </div>
      </aside>

      {/* 2. Secondary Sidebar (File Tree) */}
      {showFileTree && (
        <aside className="flex-shrink-0 z-10 h-full">
          <FileTree />
        </aside>
      )}

      {/* 3. Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-white relative">
        {/* Top User Bar */}
        <div className="w-full flex justify-end px-6 py-3 border-b border-gray-100 bg-white">
          <UserTopBar />
        </div>
        
        <Outlet />
      </main>
    </div>
  );
};

const NavIcon = ({ to, icon: Icon, label, active, collapsed }: { to: string, icon: any, label: string, active?: boolean, collapsed?: boolean }) => (
  <NavLink 
    to={to} 
    className={({ isActive }) => `
      group relative flex items-center w-full px-3 py-2.5 rounded-lg transition-all duration-200
      ${(isActive || active) ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
      ${collapsed ? 'justify-center' : ''}
    `}
    title={collapsed ? label : undefined}
  >
    {({ isActive }) => (
      <>
        <Icon className={`w-5 h-5 flex-shrink-0 ${!collapsed ? 'mr-3' : ''} ${(isActive || active) ? 'text-purple-600' : ''}`} />
        {!collapsed && <span className="text-sm font-medium truncate">{label}</span>}
      </>
    )}
  </NavLink>
);

export default WorkspaceLayout;
