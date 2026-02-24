import React from 'react';
import { useParams } from 'react-router-dom';
import MindMapEditor from '@/components/MindMapEditor';

const Events = () => {
  const { workId } = useParams();

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="h-14 border-b border-gray-200 bg-white flex items-center px-6 justify-between flex-shrink-0">
        <h1 className="text-lg font-medium text-gray-900">事件细纲</h1>
      </div>
      <div className="flex-1 p-4 overflow-hidden">
        <MindMapEditor type="event" workId={workId} />
      </div>
    </div>
  );
};

export default Events;
