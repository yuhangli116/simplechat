import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Phone, ArrowRight, PenTool } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      if (method === 'email') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        // Phone login placeholder
        console.log('Phone login not implemented yet');
      }
      navigate('/workspace');
    } catch (error) {
      console.error('Error logging in:', error);
      alert('登录失败，请检查账号密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen bg-cover bg-center flex items-center justify-center p-4 relative font-sans"
      style={{ backgroundImage: "url('https://images.unsplash.com/photo-1497561813398-8fcc7a37b567?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80')" }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-black/60 to-purple-900/40 backdrop-blur-sm"></div>
      
      <div className="w-full max-w-md bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl overflow-hidden relative z-10 transition-all hover:shadow-purple-500/10 hover:border-white/30 animate-in fade-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="p-8 md:p-10 pb-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white mb-6 shadow-lg shadow-purple-500/30 transform hover:scale-105 transition-transform duration-300">
            <PenTool className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-bold text-white tracking-tight">欢迎回来</h2>
          <p className="text-gray-300 mt-2 text-sm font-medium">登录简单写作，继续你的创作之旅</p>
        </div>

        {/* Login Form */}
        <div className="px-8 md:px-10 pb-8 md:pb-10">
          {/* Method Toggle */}
          <div className="flex bg-black/20 p-1 rounded-xl mb-8 backdrop-blur-md">
            <button
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 ${
                method === 'email' ? 'bg-white text-purple-900 shadow-md transform scale-[1.02]' : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`}
              onClick={() => setMethod('email')}
            >
              邮箱登录
            </button>
            <button
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 ${
                method === 'phone' ? 'bg-white text-purple-900 shadow-md transform scale-[1.02]' : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`}
              onClick={() => setMethod('phone')}
            >
              手机验证
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {method === 'email' ? (
              <>
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
                  <div className="flex justify-between items-center ml-1">
                    <label className="block text-xs font-medium text-gray-300 uppercase tracking-wider">密码</label>
                    <Link to="/forgot-password" className="text-xs text-purple-300 hover:text-purple-200 hover:underline">忘记密码？</Link>
                  </div>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-purple-400 transition-colors" />
                    <input
                      type="password"
                      required
                      className="w-full pl-12 pr-4 py-3.5 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 focus:bg-black/30 outline-none transition-all duration-300"
                      placeholder="请输入密码"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-300 uppercase tracking-wider ml-1">手机号码</label>
                <div className="relative group">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-purple-400 transition-colors" />
                  <input
                    type="tel"
                    required
                    className="w-full pl-12 pr-4 py-3.5 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 focus:bg-black/30 outline-none transition-all duration-300"
                    placeholder="请输入手机号"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
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
