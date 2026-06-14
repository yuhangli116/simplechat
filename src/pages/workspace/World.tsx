import React from 'react';
import { useParams } from 'react-router-dom';
import MindMapEditor from '@/components/MindMapEditor';
import MindMapPageHeader from './MindMapPageHeader';

const World = () => {
  const { workId } = useParams();

  return (
    <div className="h-full flex flex-col p-4">
      <MindMapPageHeader title="世界设定" description="构建你的宏大世界观（地理、势力、力量体系）" />
      <div className="flex-1 bg-gray-900 rounded-xl overflow-hidden border border-gray-800 shadow-lg">
        <MindMapEditor type="world" workId={workId} />
      </div>
    </div>
  );
};

export default World;
