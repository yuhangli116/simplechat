import React from 'react';

interface MindMapPageHeaderProps {
  title: string;
  description: string;
}

const MindMapPageHeader: React.FC<MindMapPageHeaderProps> = ({ title, description }) => (
  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mt-1 mb-2">
    <div className="min-w-0">
      <h1 className="text-2xl font-bold text-gray-800 shrink-0">{title}</h1>
    </div>
    <div className="text-sm text-gray-500 leading-5 md:text-right">
      {description}，确认已保存后再退出
    </div>
  </div>
);

export default MindMapPageHeader;
