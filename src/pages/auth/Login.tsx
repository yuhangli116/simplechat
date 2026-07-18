import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, PenTool, Eye, EyeOff, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { createGuestProfile, createGuestUser, saveGuestSession, useAuthStore, isGuestUser } from '@/store/useAuthStore';
import { guestDemoFileStructure, useFileStore } from '@/store/useFileStore';
import { usePromptStore } from '@/store/usePromptStore';
import { useTrashStore } from '@/store/useTrashStore';
import { createLogger, flushLogs } from '@/lib/logger';
import { checkCurrentUserSecurity } from '@/services/security';
import { useMaintenance } from '@/contexts/useMaintenance';
import { getMaintenanceBannerMessage } from '@/services/maintenance';

const log = createLogger('Login')

// 清理游客数据的辅助函数
const clearAllGuestData = () => {
  if (typeof window === 'undefined') return
  
  log.info('Clearing ALL guest data before new guest login...')

  const keyPrefixesToRemove = [
    'mindmap-',
    'mindmap-theme-',
    'story-',
    'view-',
  ]
  const exactKeysToRemove = [
    'collectedSkills',
    'likedOfficialSkills',
    'officialSkillMetrics',
    'likedTemplates',
    'collectedTemplates',
    'guestTemplateLikesDelta',
    'guestTemplateViewsDelta',
    'likedSkillTemplates',
    'guest-diamond-balance',
    'guest-storage-key',
    'simplechat-guest-session',
    'my-works-tree',
    'guest-my-works-tree',
    'my-prompts',
    'trash-store',
    'guest-trash-store',
  ]
  const isGuestScopedKey = (key: string) =>
    key.startsWith('guest-') && (
      key.includes('-mindmap-') ||
      key.includes('-mindmap-theme-') ||
      key.includes('-story-') ||
      key.includes('-view-')
    )

  const allKeys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key) {
      allKeys.push(key)
    }
  }

  const keysToRemove = allKeys.filter(key => 
    exactKeysToRemove.includes(key) || 
    keyPrefixesToRemove.some(prefix => key.startsWith(prefix)) ||
    isGuestScopedKey(key)
  )
  
  for (const key of keysToRemove) {
    localStorage.removeItem(key)
    log.info('Removed localStorage key for new guest', { key })
  }
  sessionStorage.removeItem('guest-storage-key')
  sessionStorage.removeItem('simplechat-guest-session')

  try {
    usePromptStore.setState({ prompts: [] })
    usePromptStore.persist?.clearStorage?.()
    useTrashStore.setState({ items: [] })
    useTrashStore.persist?.clearStorage?.()
    log.info('Guest in-memory stores cleared')
  } catch (error) {
    log.error('Failed to clear guest in-memory stores', { error })
  }

  log.info('All previous guest data cleared')
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const navigate = useNavigate();
  const { user, session, signingOut, setUser, setSession, setProfile, setDiamondBalance, fetchProfile } = useAuthStore();
  const { setFiles } = useFileStore();
  const maintenance = useMaintenance();
  const canSubmit = email.trim().length > 0 && password.trim().length > 0;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const defaultWorkspacePath = '/workspace';

  useEffect(() => {
    // 只有真正登录的用户（不是游客）才跳转到 workspace
    if (!signingOut && (session?.user || user) && !isGuestUser(user)) {
      navigate(defaultWorkspacePath, { replace: true });
    }
  }, [defaultWorkspacePath, navigate, session, user, signingOut]);

  const handleGuestLogin = async () => {
    const latestMaintenance = await maintenance.refresh();
    if (latestMaintenance.phase === 'locked') {
      alert(getMaintenanceBannerMessage(latestMaintenance));
      return;
    }

    // 先清理之前的游客数据，确保新的游客会话是干净的！
    clearAllGuestData()
    
    // 为游客会话生成唯一标识，确保并发隔离
    const guestId = 'guest-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    log.info('Guest login', { guestId });
    
    const guestUser = createGuestUser(guestId);
    saveGuestSession(guestId);
    
    setUser(guestUser);
    setProfile(createGuestProfile(guestId));
    setDiamondBalance(0);
    setFiles(JSON.parse(JSON.stringify(guestDemoFileStructure)));
    log.info('Guest login completed, files set to demo structure');
    flushLogs();
    
    // 防回归：只有游客登录后的这一次跳转展示欢迎页；普通点击“我的作品”不应继续显示欢迎页。
    navigate('/workspace', { state: { showGuestWelcome: true } });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const loginStartedAt = performance.now();
    const normalizedEmail = email.trim();
    log.info('Password login submitted', { email: normalizedEmail });
    if (!emailRegex.test(normalizedEmail)) {
      log.warn('Password login blocked: invalid email', { email: normalizedEmail });
      setEmailError('请输入有效的邮箱地址');
      alert('请输入有效的邮箱地址');
      return;
    }

    const latestMaintenance = await maintenance.refresh();
    if (latestMaintenance.phase === 'locked') {
      alert(getMaintenanceBannerMessage(latestMaintenance));
      return;
    }

    setLoading(true);
    
    try {
      const signInStartedAt = performance.now();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      const signInMs = Math.round(performance.now() - signInStartedAt);
      if (signInMs >= 3000) {
        log.warn('Slow password login detected', { email: normalizedEmail, durationMs: signInMs });
      }
      if (error) throw error;
      
      const loggedInUser = data.user ?? data.session?.user ?? null;
      if (loggedInUser) {
        const security = await checkCurrentUserSecurity(loggedInUser.id);
        if (security.userStatus === 'blacklisted' || security.blocked) {
          log.warn('Password login rejected by security controls', {
            userId: loggedInUser.id,
            email: normalizedEmail,
            userStatus: security.userStatus,
          });
          await supabase.auth.signOut();
          throw new Error(security.userReason || '当前账号已被系统安全策略封禁，如有疑问请联系管理员。');
        }
      }
      log.success('Password login succeeded', {
        userId: loggedInUser?.id,
        email: normalizedEmail,
        signInMs,
      });
      if (data.session) {
        setSession(data.session);
      }
      if (loggedInUser) {
        setUser(loggedInUser);
      }

      // Fetch profile in the background so the page can enter workspace immediately.
      const fetchProfileStartedAt = performance.now();
      void fetchProfile().finally(() => {
        const profileMs = Math.round(performance.now() - fetchProfileStartedAt);
        if (profileMs >= 3000) {
          log.warn('Slow login profile hydration detected', { email: normalizedEmail, durationMs: profileMs });
        }
      });

      flushLogs();
      navigate(defaultWorkspacePath, { replace: true });
    } catch (error: any) {
      console.error('Error logging in:', error);
      log.error('Password login failed', {
        email: normalizedEmail,
        durationMs: Math.round(performance.now() - loginStartedAt),
        error: error?.message || String(error),
      }, error);
      
      let msg = '登录失败，请检查账号密码';
      if (error.message === 'Invalid login credentials') {
        msg = '账号或密码错误';
      } else if (error.message === 'Email not confirmed') {
        msg = '邮箱尚未验证，请前往邮箱点击验证链接（注意检查垃圾邮件）';
      } else if (error.message.includes('Network')) {
        msg = '网络连接失败，请检查网络';
      } else if (error.message) {
        msg = error.message;
      }
      
      if (error.message === 'Email not confirmed') {
        alert(msg);
      } else if (confirm(`${msg}\n\n是否使用“访客体验模式”直接进入？`)) {
          void handleGuestLogin();
      }
    } finally {
      log.info('Password login flow finished', {
        email: normalizedEmail,
        durationMs: Math.round(performance.now() - loginStartedAt),
      });
      flushLogs();
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 relative font-sans bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-black/40 via-black/20 to-purple-900/30"></div>
      
      <div className="w-full max-w-md bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl overflow-hidden relative z-10 transition-all hover:shadow-purple-500/10 hover:border-white/30 animate-in fade-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="p-8 md:p-10 pb-6 text-center">
          <div className="inline-flex items-center gap-3 mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/30 transform hover:scale-105 transition-transform duration-300">
              <PenTool className="w-7 h-7" />
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-bold text-white tracking-tight">简单写作</h1>
            </div>
          </div>
          
          <h2 className="text-xl font-semibold text-white tracking-tight">欢迎回来</h2>
          <p className="text-gray-400 mt-2 text-sm">登录简单写作，继续你的创作之旅</p>
        </div>

        {/* Login Form */}
        <div className="px-8 md:px-10 pb-8 md:pb-10">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-300 uppercase tracking-wider ml-1">电子邮箱</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-purple-400 transition-colors" />
                <input
                  type="email"
                  required
                  className="w-full pl-12 pr-4 py-3.5 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 focus:bg-black/30 outline-none transition-all duration-300"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError('');
                  }}
                  onBlur={() => {
                    if (!email) {
                      setEmailError('');
                      return;
                    }
                    if (!emailRegex.test(email)) {
                      setEmailError('请输入有效的邮箱地址');
                    } else {
                      setEmailError('');
                    }
                  }}
                />
              </div>
              {emailError && (
                <p className="text-xs text-red-400 mt-1">{emailError}</p>
              )}
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center ml-1">
                <label className="block text-xs font-medium text-gray-300 uppercase tracking-wider">密码</label>
                <Link to="/forgot-password" className="text-xs text-purple-300 hover:text-purple-200 hover:underline">忘记密码？</Link>
              </div>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-purple-400 transition-colors" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  className="w-full pl-12 pr-12 py-3.5 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 focus:bg-black/30 outline-none transition-all duration-300"
                  placeholder="输入您的密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 hover:text-purple-300 transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-purple-600/30 transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none mt-4 flex items-center justify-center group"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  立即登录
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleGuestLogin}
              className="w-full py-3.5 bg-white/5 border border-white/10 text-gray-300 rounded-xl font-medium hover:bg-white/10 hover:text-white transition-all duration-300 flex items-center justify-center gap-2 mt-4"
            >
              <User className="w-4 h-4" />
              访客体验模式 (无需登录)
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-gray-400 text-sm">
              还没有账号？{' '}
              <Link to="/register" className="text-white font-semibold hover:text-purple-300 hover:underline transition-colors">
                免费注册
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
