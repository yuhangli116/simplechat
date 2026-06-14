import React from 'react';
import { useParams } from 'react-router-dom';
import MindMapEditor from '@/components/MindMapEditor';
import MindMapPageHeader from './MindMapPageHeader';

const Characters = () => {
  const { workId } = useParams();

  return (
    <div className="h-full flex flex-col p-4">
      <MindMapPageHeader title="角色塑造" description="设计鲜活的角色形象（性格、背景、关系网）" />
      <div className="flex-1 bg-gray-900 rounded-xl overflow-hidden border border-gray-800 shadow-lg">
        <MindMapEditor type="character" workId={workId} />
      </div>
    </div>
  );
};

export default Characters;
