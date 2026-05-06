import React, { useState, useRef } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useToastStore } from '@/store/useToastStore';
import { supabase } from '@/lib/supabase';
import { X, Upload, Loader2, Check } from 'lucide-react';
import { getRandomAvatar } from '@/utils/randomProfile';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, profile: storeProfile, fetchProfile } = useAuthStore();
  const { addToast } = useToastStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');
  
  // Profile state
  const [username, setUsername] = useState(storeProfile?.username || '');
  const [avatarUrl, setAvatarUrl] = useState(storeProfile?.avatar_url || (user ? getRandomAvatar(user.id) : ''));
  const [uploading, setUploading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  if (!isOpen || !user) return null;

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      setProfileError('');
      
      const file = event.target.files?.[0];
      if (!file) return;

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setAvatarUrl(publicUrl);
    } catch (error: any) {
      setProfileError(error.message || '上传头像失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUpdateProfile = async () => {
    try {
      setProfileLoading(true);
      setProfileError('');
      setProfileSuccess(false);

      const { error } = await supabase
        .from('profiles')
        .update({
          username,
          avatar_url: avatarUrl,
        })
        .eq('id', user.id);

      if (error) throw error;

      await fetchProfile(); // refresh store
      setProfileSuccess(true);
      addToast('个人信息修改成功！', 'success');
      setProfileSuccess(false);
      onClose();
    } catch (error: any) {
      setProfileError(error.message || '更新个人信息失败');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('新密码长度不能少于6位');
      return;
    }

    try {
      setPasswordLoading(true);
      setPasswordError('');
      setPasswordSuccess(false);

      // Verify old password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: oldPassword,
      });

      if (signInError) {
        throw new Error('原密码不正确');
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) throw updateError;

      setPasswordSuccess(true);
      addToast('密码修改成功！', 'success');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(false);
      onClose();
    } catch (error: any) {
      setPasswordError(error.message || '修改密码失败');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-xl font-semibold text-gray-800">账户设置</h2>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-4 space-x-6 border-b border-gray-100">
          <button
            onClick={() => setActiveTab('profile')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'profile' 
                ? 'border-purple-600 text-purple-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            个人信息
          </button>
          <button
            onClick={() => setActiveTab('password')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'password' 
                ? 'border-purple-600 text-purple-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            修改密码
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'profile' ? (
            <div className="space-y-6">
              <div className="flex flex-col items-center gap-4">
                <div 
                  className="relative w-24 h-24 rounded-full border-2 border-dashed border-gray-300 overflow-hidden group cursor-pointer"
                  onClick={handleAvatarClick}
                >
                  <img 
                    src={avatarUrl} 
                    alt="Avatar" 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {uploading ? (
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    ) : (
                      <Upload className="w-6 h-6 text-white" />
                    )}
                  </div>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleAvatarChange} 
                  accept="image/*" 
                  className="hidden" 
                />
                <span className="text-xs text-gray-500">点击头像可重新上传 (最大 2MB)</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">昵称</label>
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"
                  placeholder="请输入您的昵称"
                />
              </div>

              {profileError && <p className="text-sm text-red-500">{profileError}</p>}
              {profileSuccess && <p className="text-sm text-green-500 flex items-center gap-1"><Check className="w-4 h-4"/> 个人信息已更新</p>}

              <button 
                onClick={handleUpdateProfile}
                disabled={profileLoading}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center"
              >
                {profileLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : '保存修改'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">原密码</label>
                <input 
                  type="password" 
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"
                  placeholder="请输入原密码"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">新密码</label>
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"
                  placeholder="请输入新密码（至少6位）"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">确认新密码</label>
                <input 
                  type="password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"
                  placeholder="请再次输入新密码"
                />
              </div>

              {passwordError && <p className="text-sm text-red-500">{passwordError}</p>}
              {passwordSuccess && <p className="text-sm text-green-500 flex items-center gap-1"><Check className="w-4 h-4"/> 密码修改成功</p>}

              <button 
                onClick={handleUpdatePassword}
                disabled={passwordLoading || !oldPassword || !newPassword || !confirmPassword}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center mt-6"
              >
                {passwordLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : '确认修改密码'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
