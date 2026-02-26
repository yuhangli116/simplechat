import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowRight, PenTool } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailError, setEmailError] = useState('');
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailRegex.test(email)) {
      setEmailError('请输入有效的邮箱地址');
      alert('请输入有效的邮箱地址');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (error) {
      console.error('Error sending reset email:', error);
      alert('发送失败，请检查邮箱地址');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative font-sans bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950">
      <div className="absolute inset-0 bg-gradient-to-br from-black/40 via-black/20 to-purple-900/30"></div>
      <div className="w-full max-w-md bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl overflow-hidden relative z-10 transition-all hover:shadow-purple-500/10 hover:border-white/30 animate-in fade-in zoom-in-95 duration-300">
        <div className="p-8 md:p-10 pb-6 text-center">
          <div className="inline-flex items-center gap-3 mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/30 transform hover:scale-105 transition-transform duration-300">
              <PenTool className="w-7 h-7" />
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-bold text-white tracking-tight">简单写作</h1>
            </div>
          </div>
          <h2 className="text-xl font-semibold text-white tracking-tight">找回密码</h2>
          <p className="text-gray-400 mt-2 text-sm">输入邮箱，我们将发送重置链接</p>
        </div>

        <div className="px-8 md:px-10 pb-8 md:pb-10">
          {sent ? (
            <div className="text-center text-gray-200 text-sm">
              重置链接已发送，请检查邮箱
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
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

              <button
                type="submit"
                disabled={loading || email.trim().length === 0}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-purple-600/30 transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none mt-2 flex items-center justify-center group"
              >
                {loading ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    发送重置链接
                    <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          )}

          <div className="mt-8 text-center">
            <p className="text-gray-400 text-sm">
              想起密码了？{' '}
              <Link to="/login" className="text-white font-semibold hover:text-purple-300 hover:underline transition-colors">
                直接登录
              </Link>
            </p>
            <p className="text-gray-400 text-sm mt-2">
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
