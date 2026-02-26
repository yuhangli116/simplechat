import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, ArrowRight, PenTool, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();
  const typeMatches = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  const isPasswordStrong = password.length >= 8 && typeMatches >= 2;
  const isConfirmValid = confirmPassword.length > 0 && password === confirmPassword;
  const lengthScore = password.length >= 12 ? 2 : password.length >= 8 ? 1 : 0;
  const varietyScore = typeMatches >= 3 ? 2 : typeMatches >= 2 ? 1 : 0;
  const strengthScore = Math.min(3, lengthScore + varietyScore);
  const strengthLabel = strengthScore <= 1 ? '弱' : strengthScore === 2 ? '中' : '强';
  const [passwordFocused, setPasswordFocused] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordStrong) {
      alert('密码至少8位且需包含两种以上不同类型字符');
      return;
    }
    if (password !== confirmPassword) {
      alert('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      alert('密码已更新，请重新登录');
      navigate('/login');
    } catch (error) {
      console.error('Error updating password:', error);
      alert('重置失败，链接可能已过期，请重新发起');
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
          <h2 className="text-xl font-semibold text-white tracking-tight">设置新密码</h2>
          <p className="text-gray-400 mt-2 text-sm">请设置一个更安全的新密码</p>
        </div>

        <div className="px-8 md:px-10 pb-8 md:pb-10">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-300 uppercase tracking-wider ml-1">新密码</label>
              <div className="relative group">
                {isPasswordStrong ? (
                  <CheckCircle className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-green-400 group-focus-within:text-green-300 transition-colors" />
                ) : password.length > 0 ? (
                  <XCircle className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-red-400 group-focus-within:text-red-300 transition-colors" />
                ) : (
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-purple-400 transition-colors" />
                )}
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  className="w-full pl-12 pr-12 py-3.5 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 focus:bg-black/30 outline-none transition-all duration-300"
                  placeholder="至少8位，包含两种以上字符类型"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                />
                <button
                  type="button"
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 hover:text-purple-300 transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {passwordFocused && password.length > 0 && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    <div className={`h-1 rounded flex-1 ${strengthScore >= 1 ? 'bg-red-500' : 'bg-gray-700'}`}></div>
                    <div className={`h-1 rounded flex-1 ${strengthScore >= 2 ? 'bg-yellow-500' : 'bg-gray-700'}`}></div>
                    <div className={`h-1 rounded flex-1 ${strengthScore >= 3 ? 'bg-green-500' : 'bg-gray-700'}`}></div>
                  </div>
                  <div className={`text-xs mt-1 ${strengthScore <= 1 ? 'text-red-400' : strengthScore === 2 ? 'text-yellow-400' : 'text-green-400'}`}>
                    强度：{strengthLabel}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-300 uppercase tracking-wider ml-1">确认新密码</label>
              <div className="relative group">
                {isConfirmValid ? (
                  <CheckCircle className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-green-400 group-focus-within:text-green-300 transition-colors" />
                ) : confirmPassword.length > 0 ? (
                  <XCircle className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-red-400 group-focus-within:text-red-300 transition-colors" />
                ) : (
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-purple-400 transition-colors" />
                )}
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  minLength={8}
                  className="w-full pl-12 pr-12 py-3.5 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 focus:bg-black/30 outline-none transition-all duration-300"
                  placeholder="再次输入新密码"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 hover:text-purple-300 transition-colors"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !isPasswordStrong || !isConfirmValid}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-purple-600/30 transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none mt-2 flex items-center justify-center group"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  更新密码
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-gray-400 text-sm">
              返回登录{' '}
              <Link to="/login" className="text-white font-semibold hover:text-purple-300 hover:underline transition-colors">
                立即登录
              </Link>
            </p>
            <p className="text-gray-400 text-sm mt-2">
              需要重新发送链接？{' '}
              <Link to="/forgot-password" className="text-white font-semibold hover:text-purple-300 hover:underline transition-colors">
                找回密码
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
