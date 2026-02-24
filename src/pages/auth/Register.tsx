import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, ArrowRight, PenTool } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      alert('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) throw error;
      alert('注册成功！请检查邮箱完成验证');
      navigate('/login');
    } catch (error) {
      console.error('Error registering:', error);
      alert('注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen bg-cover bg-center flex items-center justify-center p-4 relative font-sans"
      style={{ backgroundImage: "url('https://images.unsplash.com/photo-1455390582262-044cdead277a?ixlib=rb-4.0.3&auto=format&fit=crop&w=2073&q=80')" }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-black/60 to-purple-900/40 backdrop-blur-sm"></div>
      
      <div className="w-full max-w-md bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl overflow-hidden relative z-10 transition-all hover:shadow-purple-500/10 hover:border-white/30 animate-in fade-in zoom-in-95 duration-300">
        
        <div className="p-8 md:p-10 pb-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white mb-6 shadow-lg shadow-purple-500/30 transform hover:scale-105 transition-transform duration-300">
            <PenTool className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-bold text-white tracking-tight">创建账号</h2>
          <p className="text-gray-300 mt-2 text-sm font-medium">加入简单写作，开启智能创作体验</p>
        </div>

        <div className="px-8 md:px-10 pb-8 md:pb-10">
          <form onSubmit={handleRegister} className="space-y-5">
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
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-300 uppercase tracking-wider ml-1">设置密码</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-purple-400 transition-colors" />
                <input
                  type="password"
                  required
                  minLength={6}
                  className="w-full pl-12 pr-4 py-3.5 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 focus:bg-black/30 outline-none transition-all duration-300"
                  placeholder="至少6位字符"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-300 uppercase tracking-wider ml-1">确认密码</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-purple-400 transition-colors" />
                <input
                  type="password"
                  required
                  minLength={6}
                  className="w-full pl-12 pr-4 py-3.5 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 focus:bg-black/30 outline-none transition-all duration-300"
                  placeholder="再次输入密码"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-purple-600/30 transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none mt-6 flex items-center justify-center group"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  立即注册
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-gray-400 text-sm">
              已有账号？{' '}
              <Link to="/login" className="text-white font-semibold hover:text-purple-300 hover:underline transition-colors">
                直接登录
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
