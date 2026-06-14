import React from 'react';
import { useParams } from 'react-router-dom';
import MindMapEditor from '@/components/MindMapEditor';
import MindMapPageHeader from './MindMapPageHeader';

const Outline = () => {
  const { workId } = useParams();
  
  return (
    <div className="h-full flex flex-col p-4">
      <MindMapPageHeader title="作品大纲" description="使用 AI 辅助生成，构建你的故事骨架" />
      <div className="flex-1 bg-gray-900 rounded-xl overflow-hidden border border-gray-800 shadow-lg">
        <MindMapEditor type="outline" workId={workId} />
      </div>
    </div>
  );
};

export default Outline;
