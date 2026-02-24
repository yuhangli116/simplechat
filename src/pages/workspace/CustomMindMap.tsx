import React from 'react';
import { useParams } from 'react-router-dom';
import MindMapEditor from '@/components/MindMapEditor';

const CustomMindMap = () => {
  const { workId, mindMapId } = useParams();
  
  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-800">自定义大纲</h1>
        <div className="text-sm text-gray-500">
          使用 AI 辅助生成，构建你的故事骨架
        </div>
      </div>
      <div className="flex-1 bg-gray-900 rounded-xl overflow-hidden border border-gray-800 shadow-lg">
        <MindMapEditor type="outline" workId={workId} id={mindMapId} />
      </div>
    </div>
  );
};

export default CustomMindMap;
