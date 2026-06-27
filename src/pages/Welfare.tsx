import React, { useState, useEffect, useRef } from 'react';
import {
  Gift,
  Calendar,
  Rocket,
  LayoutGrid,
  Video,
  CheckCircle,
  Coins,
  Crown,
  X,
  Check,
  Sparkles
} from 'lucide-react';
import { useAuthStore, isGuestUser } from '@/store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { useToastStore } from '@/store/useToastStore';
import { createLogger, flushLogs } from '@/lib/logger';

type UserWelfare = Database['public']['Tables']['user_welfare']['Row'];

const log = createLogger('Welfare');

const Welfare = () => {
  const { user, diamondBalance, fetchProfile, profile } = useAuthStore();
  const navigate = useNavigate();
  const { addToast } = useToastStore();

  const [welfareData, setWelfareData] = useState<UserWelfare | null>(null);
  const [loading, setLoading] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoWatched, setVideoWatched] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const maxWatchedTimeRef = useRef(0);
  const lastSeekToastAtRef = useRef(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoPlaying, setVideoPlaying] = useState(false);

  const completedTasks: string[] = Array.isArray(welfareData?.completed_tasks)
    ? (welfareData?.completed_tasks as string[])
    : [];

  const todayStr = new Date().toISOString().split('T')[0];
  const isCheckedInToday = welfareData?.last_check_in_date === todayStr;
  const createdAt = user?.created_at ? new Date(user.created_at) : null;
  const signupDays = createdAt ? Math.floor((Date.now() - createdAt.getTime()) / 86400000) + 1 : null;
  const isNewbieCheckinActive = user?.email === '1909232424@qq.com' ? true : (signupDays ? signupDays <= 7 : true);

  useEffect(() => {
    if (user) {
      fetchWelfareData();
    }
  }, [user]);

  useEffect(() => {
    if (showVideoModal && videoRef.current) {
      videoRef.current.play().then(() => {
        setVideoPlaying(true);
      }).catch(err => {
        console.error("Auto-play failed", err);
      });
    }
  }, [showVideoModal]);

  const fetchWelfareData = async () => {
    // 游客不加载福利数据
    if (!user || isGuestUser(user)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      log.info('Welfare data load requested', { userId: user.id });
      const { data, error } = await supabase
        .from('user_welfare')
        .select('*')
        .eq('user_id', user!.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching welfare data:', error);
        log.error('Welfare data load failed', { userId: user.id, error: error.message }, error);
      }

      if (data) {
        setWelfareData(data);
        log.success('Welfare data loaded', {
          userId: user.id,
          hasData: true,
          completedTaskCount: Array.isArray(data.completed_tasks) ? data.completed_tasks.length : 0,
        });
      } else {
        const { data: newData, error: insertError } = await supabase
          .from('user_welfare')
          .insert({ user_id: user!.id, completed_tasks: [] })
          .select()
          .single();

        if (!insertError && newData) {
          setWelfareData(newData);
          log.success('Welfare data loaded', {
            userId: user.id,
            hasData: false,
            created: true,
          });
        } else if (insertError) {
          log.error('Welfare data create failed', { userId: user.id, error: insertError.message }, insertError);
        }
      }
    } finally {
      setLoading(false);
      flushLogs();
    }
  };

  const confirmLoginForGuest = (message: string) => {
    if (user && !isGuestUser(user)) return false;
    if (confirm(message)) {
      navigate('/login');
    }
    return true;
  };

  const handleGuestTaskNavigate = (path: string) => {
    if (confirmLoginForGuest('完成任务需要登录后才能使用，是否前往登录？')) return;
    log.info('Welfare task navigation clicked', {
      userId: user?.id,
      path,
    });
    flushLogs();
    navigate(path);
  };

  const handleCheckIn = async () => {
    if (confirmLoginForGuest('签到功能需要登录后才能使用，是否前往登录？')) {
      return;
    }

    try {
      log.info('Welfare check-in requested', {
        userId: user?.id,
        today: todayStr,
        balanceBefore: diamondBalance,
      });
      const { data, error } = await supabase.rpc('claim_daily_checkin');
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || '签到失败');

      await fetchProfile();
      await fetchWelfareData();
      addToast('签到成功！获得 ' + Number(data.reward).toLocaleString() + ' 钻石', 'success');
      log.success('Welfare check-in succeeded', {
        userId: user?.id,
        today: todayStr,
        reward: Number(data.reward || 0),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '签到失败，请重试';
      log.error('Welfare check-in failed', {
        userId: user?.id,
        today: todayStr,
        error: message,
      }, error);
      addToast(message, 'error');
    } finally {
      flushLogs();
    }
  };

  const handleVideoTask = async () => {
    if (confirmLoginForGuest('观看视频任务需要登录后才能使用，是否前往登录？')) {
      return;
    }

    setVideoProgress(0);
    setVideoWatched(false);
    maxWatchedTimeRef.current = 0;
    lastSeekToastAtRef.current = 0;
    setVideoDuration(0);
    setVideoCurrentTime(0);
    setVideoPlaying(false);
    setShowVideoModal(true);
    log.info('Welfare video opened', {
      userId: user?.id,
      taskId: 'ad',
    });
    flushLogs();
  };

  const onVideoTimeUpdate = () => {
    if (videoRef.current) {
      if (!videoRef.current.duration || Number.isNaN(videoRef.current.duration)) return;
      const progress = videoRef.current.currentTime / videoRef.current.duration;
      setVideoProgress(Math.min(progress, 1));
      setVideoDuration(videoRef.current.duration);
      setVideoCurrentTime(videoRef.current.currentTime);
      if (videoRef.current.currentTime > maxWatchedTimeRef.current) {
        maxWatchedTimeRef.current = videoRef.current.currentTime;
      }
      if (progress >= 0.8 && !videoWatched) {
        setVideoWatched(true);
        log.success('Welfare video progress reached', {
          userId: user?.id,
          taskId: 'ad',
          progress: Math.round(progress * 100),
          currentTime: videoRef.current.currentTime,
          duration: videoRef.current.duration,
        });
        flushLogs();
      }
    }
  };

  const onVideoLoadedMetadata = () => {
    if (!videoRef.current) return;
    if (!videoRef.current.duration || Number.isNaN(videoRef.current.duration)) return;
    setVideoDuration(videoRef.current.duration);
    setVideoCurrentTime(videoRef.current.currentTime);
  };

  const onVideoSeeking = () => {
    if (!videoRef.current) return;
    const targetTime = videoRef.current.currentTime;
    if (targetTime <= maxWatchedTimeRef.current + 0.25) return;

    videoRef.current.currentTime = maxWatchedTimeRef.current;
    const now = Date.now();
    if (now - lastSeekToastAtRef.current > 1200) {
      lastSeekToastAtRef.current = now;
      addToast('为保证公平，激励视频不支持快进', 'info');
      log.warn('Welfare video seek blocked', {
        userId: user?.id,
        taskId: 'ad',
        targetTime,
        maxWatchedTime: maxWatchedTimeRef.current,
      });
      flushLogs();
    }
  };

  const toggleVideoPlay = async () => {
    if (!videoRef.current) return;
    try {
      if (videoRef.current.paused) {
        await videoRef.current.play();
        setVideoPlaying(true);
      } else {
        videoRef.current.pause();
        setVideoPlaying(false);
      }
    } catch {
      addToast('播放失败，请稍后重试', 'error');
    }
  };

  const onVideoEnded = async () => {
    setShowVideoModal(false);
    log.info('Welfare video reward claimed', {
      userId: user?.id,
      taskId: 'ad',
      progress: Math.round(videoProgress * 100),
    });
    flushLogs();
    await claimTask('ad');
  };

  const claimTask = async (taskId: string) => {
    if (confirmLoginForGuest('领取任务奖励需要登录后才能使用，是否前往登录？')) {
      return;
    }

    try {
      log.info('Welfare task claim requested', {
        userId: user?.id,
        taskId,
        balanceBefore: diamondBalance,
      });
      const { data, error } = await supabase.rpc('claim_welfare_task', { p_task_id: taskId });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || '任务领取失败');

      await fetchProfile();
      await fetchWelfareData();
      addToast('任务完成！获得 ' + Number(data.reward).toLocaleString() + ' 钻石', 'success');
      log.success('Welfare task claim succeeded', {
        userId: user?.id,
        taskId,
        reward: Number(data.reward || 0),
      });
    } catch (error) {
      log.error('Welfare task claim failed', {
        userId: user?.id,
        taskId,
        error: error instanceof Error ? error.message : String(error),
      }, error);
      addToast('任务提交失败', 'error');
    } finally {
      flushLogs();
    }
  };

  const checkInConfig = [
    { day: 1, reward: 10000 },
    { day: 2, reward: 10000 },
    { day: 3, reward: 10000 },
    { day: 4, reward: 10000 },
    { day: 5, reward: 10000 },
    { day: 6, reward: 10000 },
    { day: 7, reward: 20000 },
  ];

  const tasks = [
    {
      id: 'first_ai_call',
      title: '完成首次 AI 生成',
      reward: 10000,
      icon: <Rocket className="w-5 h-5 text-indigo-600" />,
      type: 'once',
      desc: '完成一次 AI 生成后即可领取',
      handler: () => handleGuestTaskNavigate('/'),
    },
    {
      id: 'first_template_create',
      title: '完成首次创建模板',
      reward: 5000,
      icon: <LayoutGrid className="w-5 h-5 text-emerald-600" />,
      type: 'once',
      desc: '创建作品模板或提示词模板后即可领取',
      handler: () => handleGuestTaskNavigate('/community'),
    },
    {
      id: 'ad',
      title: '观看激励视频',
      reward: 50000,
      icon: <Video className="w-5 h-5 text-purple-500" />,
      type: 'daily',
      desc: '观看80%即可领取',
      handler: handleVideoTask,
    },
  ];

  const getCurrentStreak = () => {
    const streak = Number(welfareData?.check_in_streak ?? 0);
    if (!streak) return 0;
    return ((streak - 1) % 7) + 1;
  };

  const currentStreak = getCurrentStreak();
  const totalStreak = Number(welfareData?.check_in_streak ?? 0);
  const completedCount = Math.min(totalStreak, 7);
  const todayIndex = isCheckedInToday ? Math.max(1, completedCount) : Math.min(completedCount + 1, 7);

  const formatRewardShort = (value: number) => {
    if (value >= 10000) {
      const w = value / 10000;
      const str = Number.isInteger(w) ? String(w) : w.toFixed(1);
      return `${str}万`;
    }
    return value.toLocaleString();
  };

  const resetDevState = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.rpc('dev_reset_welfare_state');
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || '重置失败');
      await fetchWelfareData();
      addToast('已重置该账号的签到/任务状态', 'success');
    } catch (e) {
      const message = e instanceof Error ? e.message : '重置失败';
      addToast(message, 'error');
    }
  };

  return (
    <div className="flex-1 h-full bg-gradient-to-b from-gray-50 to-white dark:from-background dark:via-background dark:to-card flex flex-col overflow-y-auto">
      <div className="sticky top-0 z-10 bg-white/75 dark:bg-background/80 backdrop-blur-xl border-b border-gray-100 dark:border-border">
        <div className="max-w-6xl mx-auto px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-purple-950/40">
              <Gift className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col">
              <div className="text-xl font-bold text-gray-900">奖励中心</div>
              <div className="text-sm text-gray-500">每日签到与任务，领取钻石奖励</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 rounded-2xl bg-gray-50 dark:bg-card/80 border border-gray-100 dark:border-border flex items-center gap-2">
              <Coins className="w-5 h-5 text-amber-500" />
              <div className="text-sm text-gray-500">余额</div>
              <div className="text-sm font-semibold text-gray-900 font-mono">
                {user ? diamondBalance.toLocaleString() : '--'}
              </div>
            </div>
            <button
              onClick={() => {
                log.info('Welfare recharge navigation clicked', { userId: user?.id });
                flushLogs();
                navigate('/membership');
              }}
              className="px-5 py-2.5 rounded-2xl bg-gray-900 dark:bg-purple-600 text-white text-sm font-semibold hover:bg-black dark:hover:bg-purple-500 transition-colors"
            >
              去充值
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full p-8 space-y-8">
        <div className="rounded-3xl p-8 border border-gray-100 dark:border-border shadow-sm dark:shadow-purple-950/10 bg-gradient-to-br from-white to-indigo-50/60 dark:from-card dark:to-indigo-500/10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-400/20 flex items-center justify-center shadow-sm">
                <Calendar className="w-6 h-6 text-indigo-600" />
              </div>
              <div className="flex flex-col">
                <div className="text-2xl font-bold text-gray-900">新手签到</div>
                <div className="text-sm text-gray-500 mt-1">注册 7 天内，每日签到可领取丰厚钻石奖励</div>
              </div>
            </div>

            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white dark:bg-card/80 border border-indigo-50 dark:border-indigo-400/20 shadow-sm">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <div className="text-sm text-gray-600 font-medium">已连续签到</div>
              <div className="text-base font-bold text-indigo-600 font-mono">
                {Number(welfareData?.check_in_streak ?? 0).toLocaleString()}
              </div>
              <div className="text-sm text-gray-600 font-medium">天</div>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-3 mb-8">
            {checkInConfig.map((item, index) => {
              const dayNumber = index + 1;
              const isDone = dayNumber <= completedCount;
              const isNext = dayNumber === todayIndex && !isCheckedInToday;
              const isToday = dayNumber === todayIndex && isCheckedInToday;

              return (
                <div
                  key={item.day}
                  className={`rounded-2xl border py-3 px-2 flex flex-col items-center justify-center gap-2.5 transition-all ${
                    isDone
                      ? 'bg-gray-50 border-gray-200 shadow-inner'
                      : isToday
                        ? 'bg-indigo-50 border-indigo-200 shadow-sm'
                        : isNext
                          ? 'bg-white border-indigo-200 shadow-sm ring-2 ring-indigo-100'
                          : 'bg-white border-gray-100'
                  }`}
                >
                  <div className={`text-sm font-bold ${isDone ? 'text-gray-400' : 'text-gray-700'}`}>
                    Day {dayNumber}
                  </div>
                  
                  {isDone ? (
                    <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-white" />
                    </div>
                  ) : (
                    <div className="text-xs font-semibold px-2 py-1 rounded-lg flex items-center gap-1 text-amber-600 bg-amber-50">
                      <Coins className="w-3.5 h-3.5" />
                      +{formatRewardShort(item.reward)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={handleCheckIn}
            disabled={!isNewbieCheckinActive || isCheckedInToday || loading}
            className={`w-full py-4 rounded-2xl text-center font-semibold text-lg transition-all duration-200 ${
              !isNewbieCheckinActive || isCheckedInToday
                ? 'bg-gray-100 dark:bg-muted text-gray-400 cursor-not-allowed border border-gray-200 dark:border-border'
                : 'bg-gray-900 dark:bg-purple-600 hover:bg-black dark:hover:bg-purple-500 text-white shadow-sm'
            }`}
          >
            {!isNewbieCheckinActive ? '新手签到已结束' : isCheckedInToday ? '今日已签到' : '立即签到'}
          </button>

          {import.meta.env.DEV && user?.email === '1909232424@qq.com' ? (
            <button
              onClick={resetDevState}
              className="mt-4 w-full py-3 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-semibold text-gray-700 transition-colors"
              disabled={loading}
            >
              重置测试状态（仅开发）
            </button>
          ) : null}
        </div>

        <div className="bg-white dark:bg-card rounded-3xl p-8 border border-gray-100 dark:border-border shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                <Crown className="w-6 h-6 text-amber-600" />
              </div>
              <div className="flex flex-col">
                <div className="text-2xl font-bold text-gray-900">任务奖励</div>
                <div className="text-sm text-gray-500 mt-1">完成任务即可领取钻石</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tasks.map((task) => {
              const taskKey = task.type === 'daily' ? `${task.id}:${todayStr}` : task.id;
              const isCompleted = completedTasks.includes(taskKey);
              return (
                <div
                  key={task.id}
                  className="group bg-white dark:bg-muted/35 rounded-3xl p-6 border border-gray-100 dark:border-border hover:border-gray-200 dark:hover:border-purple-400/30 transition-all duration-200 hover:shadow-md dark:hover:shadow-purple-950/20 flex flex-col md:flex-row md:items-center justify-between gap-5"
                >
                  <div className="flex items-center gap-5">
                      <div className="w-14 h-14 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-muted dark:to-card rounded-2xl flex items-center justify-center shadow-inner shrink-0">
                      {task.icon}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        {task.title}
                        <span className="text-sm font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg flex items-center gap-1">
                          <Coins className="w-3.5 h-3.5" />
                          +{formatRewardShort(task.reward)}
                        </span>
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">{task.desc}</p>
                    </div>
                  </div>
                  <button
                    onClick={task.handler}
                    disabled={isCompleted || loading}
                    className={`px-6 py-2.5 rounded-2xl text-sm font-semibold transition-colors shrink-0 ${
                      isCompleted
                        ? 'bg-gray-100 dark:bg-muted text-gray-400 cursor-default'
                        : 'bg-gray-900 dark:bg-purple-600 text-white hover:bg-black dark:hover:bg-purple-500'
                    }`}
                  >
                    {isCompleted ? '已完成' : '去完成'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showVideoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100">
              <h2 className="text-2xl font-bold text-gray-900">观看激励视频</h2>
              <button
                onClick={() => setShowVideoModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>
            <div className="p-4">
              <video
                ref={videoRef}
                src="/video/guanggao.MP4"
                playsInline
                autoPlay
                controlsList="nodownload noplaybackrate noremoteplayback"
                disablePictureInPicture
                className="w-full rounded-xl"
                onLoadedMetadata={onVideoLoadedMetadata}
                onTimeUpdate={onVideoTimeUpdate}
                onSeeking={onVideoSeeking}
                onEnded={onVideoEnded}
                onContextMenu={(e) => e.preventDefault()}
              />
              <div className="mt-6">
                <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
                  <span>观看进度</span>
                  <span>{Math.round(videoProgress * 100)}%</span>
                </div>
                <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-200" style={{ width: `${videoProgress * 100}%` }} />
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <button
                    onClick={toggleVideoPlay}
                    className="px-5 py-2.5 rounded-2xl bg-gray-900 hover:bg-black text-white text-sm font-semibold transition-colors"
                  >
                    {videoPlaying ? '暂停' : '播放'}
                  </button>
                  <div className="flex-1 text-right text-xs text-gray-500 font-mono">
                    {Math.floor(videoCurrentTime).toString().padStart(2, '0')} / {Math.floor(videoDuration).toString().padStart(2, '0')}s
                  </div>
                </div>
                {videoWatched ? (
                  <button
                    onClick={onVideoEnded}
                    className="w-full mt-4 py-3.5 bg-gray-900 hover:bg-black text-white font-semibold rounded-2xl flex items-center justify-center gap-2"
                  >
                    <Check className="w-5 h-5" />
                    完成观看，领取奖励
                  </button>
                ) : (
                  <p className="mt-4 text-center text-gray-500">
                    观看进度达到 80% 后可领取奖励
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Welfare;
