import React, { useState, useEffect } from 'react';
import { 
  Gift, 
  Calendar, 
  Share2, 
  UserPlus, 
  Video, 
  CheckCircle, 
  Lock, 
  Coins,
  Crown
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';

type UserWelfare = Database['public']['Tables']['user_welfare']['Row'];

const Welfare = () => {
  const { user, diamondBalance, setDiamondBalance } = useAuthStore();
  const navigate = useNavigate();
  
  const [welfareData, setWelfareData] = useState<UserWelfare | null>(null);
  const [loading, setLoading] = useState(false);

  // Computed state from welfareData
  const checkedInDays = welfareData?.check_in_streak 
    ? Array.from({ length: welfareData.check_in_streak % 7 || 7 }, (_, i) => i + 1)
    : [];
  
  const lastCheckInDate = welfareData?.last_check_in_date || null;
  const completedTasks: string[] = Array.isArray(welfareData?.completed_tasks) 
    ? (welfareData?.completed_tasks as string[]) 
    : [];

  const todayStr = new Date().toISOString().split('T')[0];
  const isCheckedInToday = lastCheckInDate === todayStr;

  useEffect(() => {
    if (user) {
      fetchWelfareData();
    }
  }, [user]);

  const fetchWelfareData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_welfare')
        .select('*')
        .eq('user_id', user!.id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error('Error fetching welfare data:', error);
      }
      
      if (data) {
        setWelfareData(data);
      } else {
        // Initialize if not exists
        const { data: newData, error: insertError } = await supabase
          .from('user_welfare')
          .insert({ user_id: user!.id, completed_tasks: [] })
          .select()
          .single();
        
        if (insertError) {
             console.error('Error creating welfare record:', insertError);
        } else {
             setWelfareData(newData);
        }
      }
    } catch (err) {
      console.error('Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    // Dev Mode: Allow check-in without login
    // if (!user) {
    //     if(confirm('请先登录')) navigate('/login');
    //     return;
    // }
    if (isCheckedInToday) return;

    const reward = 10;
    
    // Optimistic update
    setDiamondBalance(diamondBalance + reward);
    
    try {
        const userId = user?.id || 'guest-user'; // Fallback for guest
        const newStreak = (welfareData?.check_in_streak || 0) + 1;
        
        // Update User Welfare
        const { error: welfareError } = await supabase
            .from('user_welfare')
            .upsert({ 
                user_id: userId,
                last_check_in_date: todayStr,
                check_in_streak: newStreak,
            });
            
        // Actually, let's use update since we fetched it on mount
        // For guest, this might fail RLS if not authenticated, but we handle error gracefully or use mock
        if (user) {
             const { data: updatedWelfare, error: updateError } = await supabase
                .from('user_welfare')
                .update({
                    last_check_in_date: todayStr,
                    check_in_streak: newStreak,
                    total_points_earned: (welfareData?.total_points_earned || 0) + reward
                })
                .eq('user_id', user.id)
                .select()
                .single();

            if (updateError) throw updateError;
            setWelfareData(updatedWelfare);

            // Update Profile Balance
            await supabase.from('profiles').update({
                word_balance: diamondBalance + reward
            }).eq('id', user.id);
        } else {
             // Guest Mode Simulation
             setWelfareData({
                 ...welfareData,
                 last_check_in_date: todayStr,
                 check_in_streak: newStreak,
                 total_points_earned: (welfareData?.total_points_earned || 0) + reward
             } as any);
        }

        alert(`签到成功！获得 ${reward} 星石`);

    } catch (error) {
        console.error('Check-in failed:', error);
        // Don't revert in dev mode for better experience
        // setDiamondBalance(diamondBalance); 
        alert('签到失败，请重试');
    }
  };

  const handleTask = async (taskId: string, reward: number) => {
    // Dev Mode: Allow task without login
    // if (!user) {
    //     if(confirm('请先登录')) navigate('/login');
    //     return;
    // }
    if (completedTasks.includes(taskId)) return;

    // Simulate task completion (e.g., waiting for ad or share callback)
    if (taskId === 'ad') {
        if (!confirm('正在播放广告... (模拟) \n\n观看完毕？')) return;
    } else if (taskId === 'share') {
        alert('分享链接已复制到剪贴板！');
    }

    // Optimistic update
    setDiamondBalance(diamondBalance + reward);
    
    try {
        const newCompletedTasks = [...completedTasks, taskId];
        
        if (user) {
            const { data: updatedWelfare, error } = await supabase
                .from('user_welfare')
                .update({
                    completed_tasks: newCompletedTasks,
                    total_points_earned: (welfareData?.total_points_earned || 0) + reward
                })
                .eq('user_id', user.id)
                .select()
                .single();

            if (error) throw error;
            setWelfareData(updatedWelfare);

            // Update Profile
            await supabase.from('profiles').update({
                word_balance: diamondBalance + reward
            }).eq('id', user.id);
        } else {
             // Guest Mode Simulation
             setWelfareData({
                 ...welfareData,
                 completed_tasks: newCompletedTasks,
                 total_points_earned: (welfareData?.total_points_earned || 0) + reward
             } as any);
        }
        
        alert(`任务完成！获得 ${reward} 星石`);
    } catch (error) {
        console.error('Task completion failed:', error);
        // setDiamondBalance(diamondBalance); // Revert
        alert('任务提交失败');
    }
  };

  // Check-in Config
  const checkInConfig = [
    { day: 1, reward: 10 },
    { day: 2, reward: 10 },
    { day: 3, reward: 20 },
    { day: 4, reward: 20 },
    { day: 5, reward: 30 },
    { day: 6, reward: 30 },
    { day: 7, reward: 50 },
  ];

  const tasks = [
    { id: 'profile', title: '完善个人信息', reward: 20, icon: <UserPlus className="w-5 h-5 text-blue-500" />, type: 'once', desc: '上传头像并设置昵称' },
    { id: 'share', title: '分享网站给好友', reward: 30, icon: <Share2 className="w-5 h-5 text-green-500" />, type: 'daily', desc: '复制链接分享' },
    { id: 'ad', title: '观看激励视频', reward: 50, icon: <Video className="w-5 h-5 text-purple-500" />, type: 'daily', desc: '观看30秒广告' },
  ];

  // Calculate streak visually
  // If checkins > 7, reset visually or keep cycling.
  const currentStreak = checkedInDays.length % 7; 

  return (
    <div className="flex-1 h-full bg-gray-50 flex flex-col overflow-y-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-8 text-white relative overflow-hidden">
        <div className="relative z-10 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center">
              <Gift className="w-8 h-8 mr-3" />
              福利中心
            </h1>
            <p className="opacity-90">完成任务，免费领取星石，畅享 AI 创作</p>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 flex items-center border border-white/20">
            <div className="bg-yellow-400 p-2 rounded-full mr-3 shadow-lg">
              <Coins className="w-6 h-6 text-yellow-900" />
            </div>
            <div>
              <div className="text-xs opacity-80">当前余额</div>
              <div className="text-2xl font-bold font-mono">{user ? diamondBalance : '--'}</div>
            </div>
            <button className="ml-6 px-4 py-1.5 bg-yellow-400 text-yellow-900 rounded-lg text-sm font-bold hover:bg-yellow-300 transition-colors shadow-sm">
              充值
            </button>
          </div>
        </div>
        {/* Decor */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />
      </div>

      <div className="max-w-5xl mx-auto w-full p-6 space-y-8">
        
        {/* Daily Check-in */}
        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-xl shadow-indigo-100/50">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-2xl font-extrabold text-gray-800 flex items-center">
              <div className="bg-gradient-to-br from-indigo-100 to-purple-100 p-3 rounded-2xl mr-4 shadow-inner">
                <Calendar className="w-6 h-6 text-indigo-600" />
              </div>
              每日签到
            </h2>
            <div className="flex items-center bg-gradient-to-r from-indigo-50 to-purple-50 px-5 py-2 rounded-full border border-indigo-100 shadow-sm">
              <span className="text-sm text-indigo-600 mr-2 font-medium">连续签到</span>
              <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">{checkedInDays.length}</span>
              <span className="text-sm text-indigo-600 ml-2 font-medium">天</span>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="relative mb-12 px-4">
            <div className="absolute top-1/2 left-0 w-full h-3 bg-gray-100 rounded-full -translate-y-1/2 shadow-inner" />
            <div 
              className="absolute top-1/2 left-0 h-3 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full -translate-y-1/2 transition-all duration-700 shadow-md" 
              style={{ width: `${(currentStreak / 6) * 100}%` }}
            />
            
            <div className="relative flex justify-between">
              {checkInConfig.map((item, index) => {
                const isSigned = index < currentStreak;
                const isToday = index === currentStreak;
                
                return (
                  <div key={item.day} className="flex flex-col items-center group cursor-pointer">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 border-4 transition-all duration-300 z-10 ${
                      isSigned 
                        ? 'bg-gradient-to-br from-indigo-500 to-purple-600 border-indigo-100 text-white shadow-lg shadow-indigo-200' 
                        : isToday 
                          ? 'bg-white border-indigo-500 text-indigo-600 shadow-xl scale-125 ring-4 ring-indigo-50' 
                          : 'bg-white border-gray-100 text-gray-400 shadow-sm'
                    }`}>
                      {isSigned ? (
                        <CheckCircle className="w-6 h-6" />
                      ) : (
                        <span className="text-sm font-black">+{item.reward}</span>
                      )}
                    </div>
                    <span className={`text-sm font-bold ${isToday ? 'text-indigo-600 scale-110' : 'text-gray-400'}`}>
                      {index + 1}天
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <button 
            onClick={handleCheckIn}
            disabled={isCheckedInToday}
            className={`w-full py-4 rounded-2xl text-center font-bold text-xl transition-all duration-300 ${
              isCheckedInToday 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-2 border-gray-200' 
                : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-[length:200%_auto] hover:bg-[position:right_center] text-white shadow-xl shadow-indigo-200 hover:shadow-2xl hover:shadow-indigo-300 hover:-translate-y-1'
            }`}
          >
            {isCheckedInToday ? '今日已签到' : '立即签到'}
          </button>
        </div>

        {/* Tasks */}
        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-xl shadow-indigo-100/50">
          <h2 className="text-2xl font-extrabold text-gray-800 mb-8 flex items-center">
            <div className="bg-gradient-to-br from-yellow-100 to-orange-100 p-3 rounded-2xl mr-4 shadow-inner">
                <Crown className="w-6 h-6 text-yellow-600" />
            </div>
            任务列表
          </h2>
          
          <div className="space-y-5">
            {tasks.map(task => {
              const isCompleted = completedTasks.includes(task.id);
              return (
                <div key={task.id} className="flex items-center justify-between p-5 bg-white rounded-2xl border-2 border-gray-100 hover:border-indigo-200 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 group">
                  <div className="flex items-center">
                    <div className="w-14 h-14 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl flex items-center justify-center shadow-inner mr-5 group-hover:scale-110 transition-transform duration-300">
                      {task.icon}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-800 mb-1">{task.title}</h3>
                      <p className="text-sm text-gray-500 font-medium">{task.desc}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-6">
                    <div className="text-right">
                      <div className="text-xl font-black text-yellow-500 flex items-center justify-end">
                        +{task.reward} <Coins className="w-5 h-5 ml-1" />
                      </div>
                      <div className="text-xs text-gray-400">{task.type === 'once' ? '一次性' : '每日'}</div>
                    </div>
                    <button 
                      onClick={() => handleTask(task.id, task.reward)}
                      disabled={isCompleted}
                      className={`px-6 py-2 rounded-full text-sm font-medium transition-colors ${
                        isCompleted
                          ? 'bg-gray-200 text-gray-400 cursor-default'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}
                    >
                      {isCompleted ? '已完成' : '去完成'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Welfare;
