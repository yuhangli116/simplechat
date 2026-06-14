import React from 'react';

const Download = () => {
  return (
    <div className="flex-1 h-full bg-gray-50 dark:bg-background flex flex-col">
      <div className="flex-1 p-8 text-center text-gray-500 flex flex-col items-center justify-center">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-foreground">漫剧工坊</h1>
        <p className="mt-2 text-sm max-w-md">
          AI 漫剧创作能力正在筹备中，后续将支持从故事设定到分镜脚本的生成体验，敬请期待。
        </p>
      </div>
    </div>
  );
};

export default Download;
