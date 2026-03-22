import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, PenTool, Eye, EyeOff, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const navigate = useNavigate();
  const { setUser, setProfile, setDiamondBalance } = useAuthStore();
  const canSubmit = email.trim().length > 0 && password.trim().length > 0;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleGuestLogin = () => {
    // Manually set guest state
    const guestUser: any = {
        id: 'guest-' + Date.now(),
        email: 'guest@simplechat.ai',
        aud: 'authenticated',
        role: 'authenticated',
    };
    
    setUser(guestUser);
    setProfile({
        id: guestUser.id,
        username: '访客体验',
        avatar_url: '',
        membership_type: 'free',
        diamond_balance: 9999
    });
    setDiamondBalance(9999);
    
    alert('已进入访客体验模式');
    navigate('/workspace');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailRegex.test(email)) {
      setEmailError('请输入有效的邮箱地址');
      alert('请输入有效的邮箱地址');
      return;
    }
    setLoading(true);
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      
      // Explicitly update store immediately to avoid delay
      if (data.user) {
          setUser(data.user);
          // fetchProfile will be triggered by App.tsx subscription
      }
      
      navigate('/workspace');
    } catch (error: any) {
      console.error('Error logging in:', error);
      
      let msg = '登录失败，请检查账号密码';
      if (error.message === 'Invalid login credentials') msg = '账号或密码错误';
      if (error.message.includes('Network')) msg = '网络连接失败，请检查网络';
      
      if (confirm(`${msg}\n\n是否使用“访客体验模式”直接进入？`)) {
          handleGuestLogin();
      }
    } finally {
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
