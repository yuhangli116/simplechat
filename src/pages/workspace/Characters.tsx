import React from 'react';
import { useParams } from 'react-router-dom';
import MindMapEditor from '@/components/MindMapEditor';

const Characters = () => {
  const { workId } = useParams();

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-800">角色塑造</h1>
        <div className="text-sm text-gray-500">
          设计鲜活的角色形象（性格、背景、关系网）
        </div>
      </div>
      <div className="flex-1 bg-gray-900 rounded-xl overflow-hidden border border-gray-800 shadow-lg">
        <MindMapEditor type="character" workId={workId} />
      </div>
    </div>
  );
};

export default Characters;
