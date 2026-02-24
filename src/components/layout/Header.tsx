import React from 'react';
import { Bell, Search, User } from 'lucide-react';

const Header = () => {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      {/* Left: Breadcrumbs or Page Title (Placeholder) */}
      <div className="flex items-center text-sm text-gray-600">
        <span className="font-medium text-gray-900">创作工作台</span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="搜索作品、素材..." 
            className="pl-9 pr-4 py-1.5 bg-gray-100 border-none rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          />
        </div>

        {/* Notifications */}
        <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-full relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
        </button>

        {/* Avatar (Small) */}
        <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden border border-gray-200">
             <User className="w-full h-full p-1 text-gray-500" />
        </div>
      </div>
    </header>
  );
};

export default Header;
