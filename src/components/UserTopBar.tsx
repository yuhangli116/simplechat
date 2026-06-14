import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore, isGuestUser } from '@/store/useAuthStore';
import { 
  LogOut, 
  Crown, 
  Settings, 
  ChevronDown,
  CreditCard,
  UserCircle,
  Eye
} from 'lucide-react';
import { getUserProfile, getRandomAvatar } from '@/utils/randomProfile';
import { EditProfileModal } from '@/components/EditProfileModal';
import { RechargeHistoryModal } from '@/components/RechargeHistoryModal';
import { AboutUsModal } from '@/components/AboutUsModal';
import { createLogger, flushLogs } from '@/lib/logger';

const log = createLogger('UserTopBar');

const UserTopBar = () => {
  const { user, beginSignOut, signOut, diamondBalance, profile: storeProfile } = useAuthStore();
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isRechargeHistoryOpen, setIsRechargeHistoryOpen] = useState(false);
  const [isAboutUsModalOpen, setIsAboutUsModalOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; right: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isGuest = isGuestUser(user);

  // Generate random profile for current user or use store profile
  const profile = useMemo(() => {
    if (isGuest) {
      return {
        name: '访客体验',
        avatar: '',
        isVip: false
      };
    }
    if (!user) return null;
    const randomProf = getUserProfile(user);
    
    return {
      name: storeProfile?.username || randomProf?.name,
      avatar: storeProfile?.avatar_url || randomProf?.avatar,
      isVip: (storeProfile?.membership_type && storeProfile.membership_type !== 'free') || randomProf?.isVip
    };
  }, [user, storeProfile, isGuest]);

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

  useEffect(() => {
    if (!isDropdownOpen || !dropdownRef.current) return;

    const updateDropdownPosition = () => {
      const rect = dropdownRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDropdownRect({
        top: rect.bottom + 12,
        right: Math.max(12, window.innerWidth - rect.right),
      });
    };

    updateDropdownPosition();
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);
    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [isDropdownOpen]);

  const handleLogout = async () => {
    const startedAt = performance.now();
    log.info('Logout button clicked', {
      userId: user?.id,
      isGuest,
      path: window.location.pathname,
    });
    setIsDropdownOpen(false);
    beginSignOut();
    navigate('/login', { replace: true });
    flushLogs(true);
    const signOutPromise = signOut();
    await signOutPromise;
    log.success('Logout flow completed', {
      userId: user?.id,
      isGuest,
      durationMs: Math.round(performance.now() - startedAt),
    });
    flushLogs();
  };

  // 处理登录按钮点击：确保不管什么状态都能正确跳转到登录页面
  const handleLoginClick = async () => {
    if (isGuest) {
      // 如果是游客，先清理数据
      log.info('Guest login button clicked, signing out guest before login', { userId: user?.id });
      beginSignOut();
      navigate('/login');
      flushLogs(true);
      const signOutPromise = signOut();
      await signOutPromise;
      return;
    }
    // 然后跳转到登录页
    navigate('/login');
  };

  const handleEditProfile = () => {
    setIsProfileModalOpen(true);
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

  // 游客模式：显示提示文字、访客标识和登录/注册按钮
  if (isGuest) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground hidden sm:inline">
          体验模式数据将在退出或重新登录后清除
        </span>
        <span className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full font-medium border border-amber-200">
          <Eye className="w-3.5 h-3.5" />
          访客体验模式
        </span>
        <button 
          onClick={handleLoginClick}
          className="px-5 py-2 text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-full transition-colors"
        >
          登录
        </button>
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
    <div className="relative z-[1100]" ref={dropdownRef}>
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
        <div
          className="fixed w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-[9999] transform origin-top-right"
          style={{
            top: dropdownRect?.top ?? 72,
            right: dropdownRect?.right ?? 24,
          }}
        >
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
            
            <div className="mt-4 bg-white p-3 rounded-xl border border-purple-100 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">我的钻石</span>
                <span className="text-base font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center gap-1.5">
                  💎 {diamondBalance?.toLocaleString() || 0}
                </span>
              </div>
              <div className="flex items-center">
                {storeProfile?.membership_type && storeProfile.membership_type !== 'free' ? (
                  <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-100 font-medium">
                    <Crown className="w-3.5 h-3.5" />
                    VIP会员 · {storeProfile.membership_expires_at ? `剩 ${Math.max(0, Math.ceil((new Date(storeProfile.membership_expires_at).getTime() - Date.now()) / 86400000))} 天` : '长期有效'}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-md font-medium">
                    普通用户 · Free
                  </span>
                )}
              </div>
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
              onClick={() => {
                setIsRechargeHistoryOpen(true);
                setIsDropdownOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-xl transition-all duration-200 group"
            >
              <div className="p-1.5 rounded-lg bg-blue-100 group-hover:bg-blue-200 transition-colors">
                <CreditCard className="w-4 h-4 text-blue-600" />
              </div>
              充值记录
            </button>
            <button 
              onClick={() => {
                setIsAboutUsModalOpen(true);
                setIsDropdownOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 rounded-xl transition-all duration-200 group"
            >
              <div className="p-1.5 rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors">
                <Settings className="w-4 h-4 text-gray-500 group-hover:text-gray-700" />
              </div>
              关于我们
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

      <EditProfileModal 
        isOpen={isProfileModalOpen} 
        onClose={() => setIsProfileModalOpen(false)} 
      />
      <RechargeHistoryModal 
        isOpen={isRechargeHistoryOpen} 
        onClose={() => setIsRechargeHistoryOpen(false)} 
      />
      <AboutUsModal 
        isOpen={isAboutUsModalOpen} 
        onClose={() => setIsAboutUsModalOpen(false)} 
      />
    </div>
  );
};

export default UserTopBar;
