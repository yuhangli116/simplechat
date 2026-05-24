import React from 'react';

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
