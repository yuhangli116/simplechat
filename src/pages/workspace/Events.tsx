import React from 'react';
import { useParams } from 'react-router-dom';
import MindMapEditor from '@/components/MindMapEditor';

const Events = () => {
  const { workId } = useParams();

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-800">事件细纲</h1>
        <div className="text-sm text-gray-500">
          梳理故事脉络，规划核心事件与冲突
        </div>
      </div>
      <div className="flex-1 bg-gray-900 rounded-xl overflow-hidden border border-gray-800 shadow-lg">
        <MindMapEditor type="event" workId={workId} />
      </div>
    </div>
  );
};

export default Events;
