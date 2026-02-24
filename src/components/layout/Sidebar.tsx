import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  BookOpen, 
  Layout, 
  Users, 
  Settings, 
  PenTool, 
  FileText, 
  Globe, 
  User, 
  Zap,
  Download,
  History,
  CreditCard,
  MessageSquare
} from 'lucide-react';
import { cn } from '@/lib/utils';

const Sidebar = () => {
  return (
    <aside className="w-64 bg-[#1a1a2e] text-gray-300 flex flex-col h-screen border-r border-gray-800">
      {/* Logo Area */}
      <div className="p-6 flex items-center gap-2">
        <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
          <PenTool className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-bold text-white tracking-wide">非凡写作</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 space-y-6 scrollbar-hide">
        
        {/* Creation Section */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">创作</h3>
          <div className="space-y-1">
            <NavItem to="/dashboard" icon={<Layout className="w-4 h-4" />} label="我的作品" />
            
            {/* Project Specific Sub-menu (Mock for now) */}
            <div className="ml-4 mt-2 border-l border-gray-700 pl-4 space-y-1">
              <div className="text-xs text-gray-500 mb-2">武夫档案</div>
              <NavItem to="/workspace/outline" icon={<FileText className="w-4 h-4" />} label="作品大纲" compact />
              <NavItem to="/workspace/world" icon={<Globe className="w-4 h-4" />} label="世界设定" compact />
              <NavItem to="/workspace/characters" icon={<Users className="w-4 h-4" />} label="角色塑造" compact />
              <NavItem to="/workspace/events" icon={<History className="w-4 h-4" />} label="事件细纲" compact />
              <NavItem to="/workspace/editor" icon={<BookOpen className="w-4 h-4" />} label="正文情节" compact />
            </div>

            <NavItem to="/shorts" icon={<FileText className="w-4 h-4" />} label="短篇小说" />
          </div>
        </div>

        {/* Discovery Section */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">探索</h3>
          <div className="space-y-1">
            <NavItem to="/community" icon={<Users className="w-4 h-4" />} label="创作社区" />
            <NavItem to="/rewards" icon={<CreditCard className="w-4 h-4" />} label="领稿稿酬" />
            <NavItem to="/tutorials" icon={<BookOpen className="w-4 h-4" />} label="教程专区" />
          </div>
        </div>

        {/* More Section */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">更多</h3>
          <div className="space-y-1">
            <NavItem to="/prompts" icon={<MessageSquare className="w-4 h-4" />} label="提示词库" />
            <NavItem to="/membership" icon={<Zap className="w-4 h-4 text-yellow-500" />} label="充值会员" highlight />
            <NavItem to="/logs" icon={<History className="w-4 h-4" />} label="星云记录" />
            <NavItem to="/download" icon={<Download className="w-4 h-4" />} label="下载软件" />
          </div>
        </div>
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
          <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">匿名作家</p>
            <p className="text-xs text-gray-500 truncate">Free Plan</p>
          </div>
          <Settings className="w-4 h-4 text-gray-500 hover:text-white" />
        </div>
      </div>
    </aside>
  );
};

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  compact?: boolean;
  highlight?: boolean;
}

const NavItem = ({ to, icon, label, compact = false, highlight = false }: NavItemProps) => {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
          compact ? "py-1.5 text-xs" : "",
          isActive 
            ? "bg-blue-600 text-white font-medium" 
            : "hover:bg-white/5 text-gray-400 hover:text-white",
          highlight && !isActive ? "text-yellow-500 hover:text-yellow-400" : ""
        )
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
};

export default Sidebar;
