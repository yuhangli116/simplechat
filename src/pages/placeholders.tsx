import React, { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import { aiService } from '@/services/ai';
import { MODEL_ORDER, type ModelKey } from '@/services/billing';
import { useToastStore } from '@/store/useToastStore';

const PlaceholderPage = ({ title, desc, withPagination }: { title: string; desc: string; withPagination?: boolean }) => {
  return (
    <div className="flex-1 h-full bg-gray-50 flex flex-col">
      <div className="flex-1 p-8 text-center text-gray-500 flex flex-col items-center justify-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm">{desc}</p>
      </div>
      {withPagination ? (
        <div className="p-6 pt-0">
          <div className="flex items-center justify-end gap-2 pt-4">
            <button
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              disabled
              type="button"
            >
              上一页
            </button>
            <button className="min-w-8 px-2.5 py-1.5 text-xs rounded-lg border border-purple-200 bg-purple-50 text-purple-700" type="button">
              1
            </button>
            <button
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              disabled
              type="button"
            >
              下一页
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const Community = () => <PlaceholderPage title="创作社区 (开发中)" desc="这里将展示其他用户的优秀作品和交流区" withPagination />;
export const Welfare = () => <PlaceholderPage title="福利中心 (开发中)" desc="签到、任务、领取钻石" />;
export const Guide = () => <PlaceholderPage title="教程专区 (开发中)" desc="新手指南、进阶技巧" withPagination />;
export const Prompts = () => <PlaceholderPage title="提示词库 (开发中)" desc="管理和分享你的 AI 提示词" withPagination />;
export const Membership = () => <PlaceholderPage title="会员充值 (开发中)" desc="升级会员，获取更多权益" />;
export const Records = () => <PlaceholderPage title="钻石记录 (开发中)" desc="查看你的消费和充值记录" withPagination />;
export const Download = () => <PlaceholderPage title="下载客户端 (开发中)" desc="Windows / Mac / Mobile" />;
export const Trash = () => <PlaceholderPage title="回收站 (开发中)" desc="找回误删的作品" withPagination />;

export const Validate = () => {
  const { user, session, profile, diamondBalance } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);

  const [model, setModel] = useState<ModelKey>('deepseek-v4-flash');
  const [prompt, setPrompt] = useState('用一句话介绍这个项目的核心价值。');
  const [context, setContext] = useState('这是一个写作/创作辅助应用。');
  const [loading, setLoading] = useState(false);
  const [resultText, setResultText] = useState<string>('');
  const [resultMeta, setResultMeta] = useState<string>('');

  const userId = user?.id || '';
  const sessionEmail = user?.email || '';
  const accessTokenPreview = session?.access_token ? `${session.access_token.slice(0, 8)}...` : '';

  const checks = useMemo(
    () => [
      {
        key: 'toast',
        title: 'Toast',
        desc: '确认全局 Toast 能正常弹出',
        action: async () => {
          addToast('Toast 自检：成功', 'success');
        },
      },
      {
        key: 'session',
        title: 'Supabase 会话',
        desc: '读取当前 session / user 信息',
        action: async () => {
          const { data, error } = await supabase.auth.getSession();
          if (error) {
            addToast(`会话读取失败：${error.message}`, 'error');
            setResultText('');
            setResultMeta('');
            return;
          }
          setResultText(JSON.stringify({ user: data.session?.user ?? null, session: data.session ? { accessToken: data.session.access_token.slice(0, 12) + '...' } : null }, null, 2));
          setResultMeta('getSession: ok');
          addToast('会话读取成功', 'success');
        },
      },
      {
        key: 'raw-fetch',
        title: '原始 Fetch（带调试）',
        desc: '手动发起一次 /api/ai/generate 请求，看请求头和响应',
        action: async () => {
          if (!userId) {
            addToast('请先登录后再测试 AI 生成', 'error');
            return;
          }
          const getToken = async () => {
            const token = useAuthStore.getState().session?.access_token;
            if (token) return token;
            const { data } = await supabase.auth.getSession();
            return data.session?.access_token || '';
          };
          const token = await getToken();
          const payload = {
            prompt,
            context,
            model,
            userId,
          };
          const debugInfo: any = {
            request: {
              url: '/api/ai/generate',
              method: 'POST',
              hasToken: !!token,
              tokenPreview: token ? token.slice(0, 16) + '...' : null,
              payload,
            },
          };
          try {
            const resp = await fetch('/api/ai/generate', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify(payload),
            });
            const json = await resp.json();
            debugInfo.response = {
              ok: resp.ok,
              status: resp.status,
              statusText: resp.statusText,
              body: json,
            };
            setResultText(JSON.stringify(debugInfo, null, 2));
            if (resp.ok && !json.error) {
              setResultMeta('raw fetch: ok');
              addToast('原始请求成功', 'success');
            } else {
              setResultMeta('raw fetch: error');
              addToast(json.error || `HTTP ${resp.status}`, 'error');
            }
          } catch (err) {
            debugInfo.error = err instanceof Error ? err.message : String(err);
            setResultText(JSON.stringify(debugInfo, null, 2));
            setResultMeta('raw fetch: exception');
            addToast(debugInfo.error, 'error');
          }
        },
      },
      {
        key: 'ai-generate',
        title: 'AI 生成（封装版）',
        desc: '调用 /api/ai/generate（需要已登录）',
        action: async () => {
          if (!userId) {
            addToast('请先登录后再测试 AI 生成', 'error');
            return;
          }
          const res = await aiService.generateText({
            prompt,
            context,
            model,
            userId,
          });
          if (res.error) {
            addToast(res.error, 'error');
            setResultText('');
            setResultMeta('ai.generate: error');
            return;
          }
          setResultText(res.content || '');
          setResultMeta(
            res.usage
              ? `ai.generate: ok | tokens in=${res.usage.input_tokens} out=${res.usage.output_tokens} cost=${res.usage.total_cost}`
              : 'ai.generate: ok'
          );
          addToast('AI 生成成功', 'success');
        },
      },
      {
        key: 'ai-summarize',
        title: 'AI 总结',
        desc: '调用 /api/ai/summarize（需要已登录）',
        action: async () => {
          if (!userId) {
            addToast('请先登录后再测试 AI 总结', 'error');
            return;
          }
          const res = await aiService.summarizeContext(context, userId, model);
          if (res.error) {
            addToast(res.error, 'error');
            setResultText('');
            setResultMeta('ai.summarize: error');
            return;
          }
          setResultText(res.content || '');
          setResultMeta(
            res.usage
              ? `ai.summarize: ok | tokens in=${res.usage.input_tokens} out=${res.usage.output_tokens} cost=${res.usage.total_cost}`
              : 'ai.summarize: ok'
          );
          addToast('AI 总结成功', 'success');
        },
      },
    ],
    [addToast, context, model, prompt, userId]
  );

  const run = async (fn: () => Promise<void>) => {
    if (loading) return;
    setLoading(true);
    try {
      await fn();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 h-full bg-gray-50 flex flex-col">
      <div className="p-6 border-b border-gray-200 bg-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">验证 / 自检</h1>
            <p className="mt-1 text-sm text-gray-500">用于快速验证基础链路：路由、会话、Toast、AI 接口</p>
          </div>
          <div className="text-xs text-gray-500 text-right leading-5">
            <div>userId: {userId || '未登录'}</div>
            <div>email: {sessionEmail || '-'}</div>
            <div>token: {accessTokenPreview || '-'}</div>
            <div>diamonds: {typeof diamondBalance === 'number' ? diamondBalance : profile?.diamond_balance ?? '-'}</div>
          </div>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">测试输入</h2>
            <div className="text-xs text-gray-500">{loading ? '运行中...' : '就绪'}</div>
          </div>

          <div className="mt-4">
            <label className="block text-xs text-gray-600 mb-1">模型</label>
            <select
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
              value={model}
              onChange={(e) => setModel(e.target.value as ModelKey)}
            >
              {MODEL_ORDER.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <label className="block text-xs text-gray-600 mb-1">上下文（用于总结/生成）</label>
            <textarea
              className="w-full min-h-28 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
          </div>

          <div className="mt-4">
            <label className="block text-xs text-gray-600 mb-1">提示词（用于生成）</label>
            <textarea
              className="w-full min-h-24 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
          <h2 className="text-sm font-semibold text-gray-900">一键检查</h2>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {checks.map((c) => (
              <button
                key={c.key}
                type="button"
                disabled={loading}
                onClick={() => run(c.action)}
                className="text-left px-3 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="text-sm font-medium text-gray-900">{c.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">{c.desc}</div>
              </button>
            ))}
          </div>

          <div className="mt-5 flex-1">
            <div className="text-xs text-gray-500">{resultMeta || '输出将在这里显示'}</div>
            <pre className="mt-2 p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-800 overflow-auto whitespace-pre-wrap break-words min-h-44">
              {resultText || ''}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
