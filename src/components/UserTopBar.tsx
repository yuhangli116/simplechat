import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { 
  User, 
  LogOut, 
  Crown, 
  Settings, 
  ChevronDown,
  CreditCard,
  UserCircle
} from 'lucide-react';
import { getUserProfile, getRandomAvatar } from '@/utils/randomProfile';

const UserTopBar = () => {
  const { user, signOut, diamondBalance } = useAuthStore();
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Generate random profile for current user
  const profile = useMemo(() => {
    if (!user) return null;
    return getUserProfile(user);
  }, [user]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const handleEditProfile = () => {
    // Placeholder for profile editing
    const newName = window.prompt("修改昵称", profile?.name);
    if (newName) {
      alert(`昵称已修改为: ${newName} (功能演示)`);
      // In a real app, you would call an API to update the user profile
    }
    setIsDropdownOpen(false);
  };

  if (!user) {
    return (
      <div className="flex items-center gap-4">
        <Link 
          to="/login" 
          className="px-5 py-2 text-sm font-medium text-gray-600 hover:text-purple-600 transition-colors"
        >
          登录
        </Link>
        <Link 
          to="/register" 
          className="px-5 py-2 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 rounded-full shadow-lg shadow-purple-500/30 transition-all transform hover:scale-105 active:scale-95"
        >
          注册
        </Link>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="flex items-center gap-3 p-1 pl-4 rounded-full border border-gray-100 bg-white hover:bg-gray-50 hover:shadow-md transition-all duration-300 group"
      >
        {/* User Info */}
        <div className="flex flex-col items-end mr-1">
          <span className="text-sm font-semibold text-gray-800 group-hover:text-purple-700 transition-colors">
            {profile?.name}
          </span>
          <div className="flex items-center gap-1">
             {profile?.isVip ? (
               <span className="flex items-center text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium border border-amber-100 shadow-sm">
                 <Crown className="w-2.5 h-2.5 mr-1 fill-amber-600" />
                 VIP会员
               </span>
             ) : (
               <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                 普通用户
               </span>
             )}
          </div>
        </div>

        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-100 to-indigo-100 flex items-center justify-center border-2 border-white shadow-md overflow-hidden relative group-hover:ring-2 ring-purple-200 transition-all">
          <img 
            src={profile?.avatar || getRandomAvatar(user.id)} 
            alt={profile?.name} 
            className="w-full h-full object-cover" 
          />
        </div>
        
        <div className="mr-2 text-gray-300 group-hover:text-purple-400 transition-colors">
          <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isDropdownOpen && (
        <div className="absolute right-0 top-full mt-3 w-72 bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-50 transform origin-top-right">
          {/* Header */}
          <div className="p-5 bg-gradient-to-br from-purple-50/80 to-indigo-50/80 border-b border-gray-100">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-white p-1 shadow-md">
                <img 
                  src={profile?.avatar || getRandomAvatar(user.id)} 
                  alt={profile?.name} 
                  className="w-full h-full object-cover rounded-full" 
                />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-gray-900 text-lg">{profile?.name}</span>
                <span className="text-xs text-gray-500 truncate max-w-[140px]">{user.email}</span>
              </div>
            </div>
            
            <div className="mt-4 flex items-center justify-between bg-white/80 p-3 rounded-xl border border-purple-100 shadow-sm backdrop-blur-sm">
              <span className="text-xs font-medium text-gray-500">我的星石</span>
              <span className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center gap-1.5">
                💎 {diamondBalance?.toLocaleString() || 0}
              </span>
            </div>
          </div>

          {/* Menu Items */}
          <div className="p-2 space-y-1">
            <button 
              onClick={handleEditProfile}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-purple-50 hover:text-purple-700 rounded-xl transition-all duration-200 group"
            >
              <div className="p-1.5 rounded-lg bg-gray-100 group-hover:bg-purple-100 transition-colors">
                <UserCircle className="w-4 h-4 text-gray-500 group-hover:text-purple-600" />
              </div>
              修改个人信息
            </button>
            <Link 
              to="/membership"
              onClick={() => setIsDropdownOpen(false)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-amber-50 hover:text-amber-700 rounded-xl transition-all duration-200 group"
            >
              <div className="p-1.5 rounded-lg bg-amber-100 group-hover:bg-amber-200 transition-colors">
                <Crown className="w-4 h-4 text-amber-600" />
              </div>
              开通/续费会员
            </Link>
            <button 
              onClick={() => alert("功能开发中")}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-xl transition-all duration-200 group"
            >
              <div className="p-1.5 rounded-lg bg-blue-100 group-hover:bg-blue-200 transition-colors">
                <CreditCard className="w-4 h-4 text-blue-600" />
              </div>
              充值记录
            </button>
            <button 
              onClick={() => alert("功能开发中")}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 rounded-xl transition-all duration-200 group"
            >
              <div className="p-1.5 rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors">
                <Settings className="w-4 h-4 text-gray-500 group-hover:text-gray-700" />
              </div>
              账户设置
            </button>
          </div>

          <div className="h-px bg-gray-100 mx-4 my-1" />

          <div className="p-2 pb-3">
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 rounded-xl transition-all duration-200 group"
            >
              <div className="p-1.5 rounded-lg bg-red-50 group-hover:bg-red-100 transition-colors">
                <LogOut className="w-4 h-4 text-red-500 group-hover:text-red-600" />
              </div>
              退出登录
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserTopBar;
