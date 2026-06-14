import React from 'react';
import { useParams } from 'react-router-dom';
import MindMapEditor from '@/components/MindMapEditor';
import MindMapPageHeader from './MindMapPageHeader';

const Events = () => {
  const { workId } = useParams();

  return (
    <div className="h-full flex flex-col p-4">
      <MindMapPageHeader title="事件细纲" description="梳理故事脉络，规划核心事件与冲突" />
      <div className="flex-1 bg-gray-900 rounded-xl overflow-hidden border border-gray-800 shadow-lg">
        <MindMapEditor type="event" workId={workId} />
      </div>
    </div>
  );
};

export default Events;
