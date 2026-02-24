import React, { useState, useCallback, useRef, useMemo } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap,
  Connection,
  Edge,
  Node,
  Panel,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import '@/styles/reactflow.css';
import { v4 as uuidv4 } from 'uuid';
import { aiService } from '@/services/ai';
import { useAuthStore } from '@/store/useAuthStore';
import { Plus, Trash2, GitMerge, RotateCcw, Share2, Sparkles, Layout, Palette, Maximize } from 'lucide-react';
import MindMapNode from './MindMapNode';
import { getLayoutedElements } from '@/utils/layout';
import AIGenerationDialog from './AIGenerationDialog';

interface MindMapEditorProps {
  type?: 'outline' | 'world' | 'character' | 'event';
  workId?: string;
  id?: string; // Unique ID for this specific mindmap instance
  initialData?: { nodes: Node[], edges: Edge[] };
}

const getDefaultData = (type: string) => {
  const rootId = 'root';
  let rootLabel = '作品大纲';
  if (type === 'world') rootLabel = '世界设定';
  if (type === 'character') rootLabel = '角色关系';
  if (type === 'event') rootLabel = '事件细纲';

  return {
    nodes: [
      {
        id: rootId,
        type: 'mindMap',
        data: { label: rootLabel, isRoot: true },
        position: { x: 250, y: 250 },
      },
    ],
    edges: []
  };
};

const MindMapEditor: React.FC<MindMapEditorProps> = ({ type = 'outline', workId, id, initialData }) => {
  const { user, fetchBalance } = useAuthStore();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const defaultData = useMemo(() => getDefaultData(type), [type]);
  const startNodes = initialData?.nodes || defaultData.nodes;
  const startEdges = initialData?.edges || defaultData.edges;

  const [nodes, setNodes, onNodesChange] = useNodesState(startNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(startEdges);

  const handleAiClick = useCallback((nodeId: string, nodeLabel: string) => {
    if (!user) {
      alert('请先登录后使用AI功能');
      return;
    }
    setSelectedNodeId(nodeId);
    setShowAIDialog(true);
  }, [user]);

  const handleToolbarAiClick = useCallback(() => {
    if (!user) {
      alert('请先登录后使用AI功能');
      return;
    }
    if (!selectedNodeId) {
        alert('请先选择一个节点');
        return;
    }
    setShowAIDialog(true);
  }, [user, selectedNodeId]);

  const handleCloseAiDialog = () => {
    setShowAIDialog(false);
    setSelectedNodeId(null);
  };

  const nodeTypes = useMemo(() => ({
    mindMap: (props: any) => {
      // If this is the selected node and AI dialog is open, we can optionally render differently
      // But based on user request "replace node with dialog", we might need a different approach.
      // However, usually dialogs are overlays. 
      // User said: "选中某个节点后，点击AI编辑，则将原节点替换为对话框" (Select node -> Click AI Edit -> Replace original node with dialog)
      // This implies an in-place edit mode.
      
      const isAiMode = props.id === selectedNodeId && showAIDialog;

      if (isAiMode) {
        return (
            <div className="relative z-50">
                 <AIGenerationDialog
                    isOpen={true}
                    onClose={handleCloseAiDialog}
                    onSubmit={handleAiSubmit}
                    nodeLabel={props.data.label}
                    nodeId={props.id}
                    balance={user?.diamond_balance || 0}
                 />
            </div>
        );
      }

      return (
        <MindMapNode 
            {...props} 
            data={{
            ...props.data,
            onAiClick: handleAiClick
            }} 
        />
      );
    },
  }), [handleAiClick, selectedNodeId, showAIDialog, user]);
  
  // Load from localStorage or reset when type/workId/id changes

  // Load from localStorage or reset when type/workId/id changes
  React.useEffect(() => {
    if (!workId && !id) {
      // If no workId/id, just use default (for demo/standalone)
      const newData = getDefaultData(type);
      setNodes(newData.nodes);
      setEdges(newData.edges);
      return;
    }

    const key = id ? `mindmap-${id}` : `mindmap-${workId}-${type}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const { nodes: savedNodes, edges: savedEdges } = JSON.parse(saved);
        setNodes(savedNodes || []);
        setEdges(savedEdges || []);
      } catch (e) {
        console.error('Failed to parse saved mindmap', e);
        const newData = getDefaultData(type);
        setNodes(newData.nodes);
        setEdges(newData.edges);
      }
    } else {
      const newData = getDefaultData(type);
      setNodes(newData.nodes);
      setEdges(newData.edges);
    }
  }, [type, workId, id, setNodes, setEdges]);

  // Auto-save to localStorage
  React.useEffect(() => {
    if (!workId && !id) return;
    const key = id ? `mindmap-${id}` : `mindmap-${workId}-${type}`;
    const timeout = setTimeout(() => {
      localStorage.setItem(key, JSON.stringify({ nodes, edges }));
    }, 1000); // Debounce 1s
    return () => clearTimeout(timeout);
  }, [nodes, edges, workId, type, id]);

  // Ref to ReactFlow instance for coordinate projection
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setShowAIDialog(false);
  }, []);

  // --- Operations ---

  const addNode = (type: 'child' | 'sibling') => {
    if (!selectedNodeId) {
      alert('请先选择一个节点');
      return;
    }

    const selectedNode = nodes.find(n => n.id === selectedNodeId);
    if (!selectedNode) return;

    const newNodeId = uuidv4();
    let newPos = { x: selectedNode.position.x + 200, y: selectedNode.position.y }; // Simple offset

    if (type === 'sibling') {
       // Find parent and add child to parent.
       const parentEdge = edges.find(e => e.target === selectedNodeId);
       
       if (!parentEdge) {
         // Root node case or detached node
         alert('根节点无法添加兄弟节点');
         return;
       }
       
       const parentNode = nodes.find(n => n.id === parentEdge.source);
       // Position: Add below the current node with some offset, layout will fix eventually
       // But for manual positioning, let's put it below the last sibling or just below selected
       newPos = { x: selectedNode.position.x, y: selectedNode.position.y + 100 };

       const newNode: Node = {
          id: newNodeId,
          type: 'mindMap',
          data: { label: '新节点' },
          position: newPos,
       };

       const newEdge: Edge = {
          id: `e-${parentEdge.source}-${newNodeId}`, // Connect to parent
          source: parentEdge.source,
          target: newNodeId,
          type: 'smoothstep',
          style: { stroke: '#9ca3af' }
       };
       
       setNodes((nds) => [...nds, newNode]);
       setEdges((eds) => [...eds, newEdge]);
       return; // Exit early as we handled sibling case
    }

    const newNode: Node = {
      id: newNodeId,
      type: 'mindMap',
      data: { label: '新节点' },
      position: newPos,
    };

    const newEdge: Edge = {
      id: `e-${selectedNodeId}-${newNodeId}`,
      source: selectedNodeId,
      target: newNodeId,
      type: 'smoothstep',
      style: { stroke: '#9ca3af' }
    };

    setNodes((nds) => [...nds, newNode]);
    setEdges((eds) => [...eds, newEdge]);
  };

  const deleteNode = () => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  };

  const onLayout = useCallback(
    (direction: string) => {
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        nodes,
        edges,
        direction
      );

      setNodes([...layoutedNodes]);
      setEdges([...layoutedEdges]);
      
      setTimeout(() => {
          reactFlowInstance?.fitView();
      }, 50);
    },
    [nodes, edges, setNodes, setEdges, reactFlowInstance]
  );

  // --- AI Generation Logic ---
  
  // (Old handleAiClick removed to avoid duplicate declaration)

  const handleAiSubmit = async (model: string, userPrompt: string) => {
    setShowAIDialog(false);
    
    // Reset selected node ID to exit "AI Mode"
    // Note: We need to keep the ID temporarily to know which node to update
    const targetNodeId = selectedNodeId;
    setSelectedNodeId(null); 

    const selectedNode = nodes.find(n => n.id === targetNodeId);
    if (!selectedNode || !targetNodeId) return;

    setIsGenerating(true);

    try {
        // Construct Prompt
        const prompt = `你是一个专业的小说大纲生成助手。
当前选中节点是：${selectedNode.data.label}
根节点是：${nodes.find(n => n.data.isRoot)?.data.label || '未知小说'}

用户需求：${userPrompt}

请根据用户需求和上下文，为当前节点生成子节点。
请直接返回一个纯 JSON 对象，结构如下：
{
  "children": [
    {
      "label": "子节点标题",
      "children": [
         { "label": "孙子节点（可选）" }
      ]
    }
  ]
}
注意：
1. 返回必须是合法的 JSON。
2. 不要包含 Markdown 格式（如 \`\`\`json）。
3. 如果用户只是想修改当前节点，children 可以为空，你可以返回 "newLabel": "新标题" 来重命名当前节点。
`;

        const response = await aiService.generateText({
            prompt,
            model: model as any, 
            userId: user.id
        });

        if (response.content) {
            try {
                // Try to clean up markdown if AI adds it
                const jsonStr = response.content.replace(/```json/g, '').replace(/```/g, '').trim();
                const result = JSON.parse(jsonStr);
                
                let newNodes: Node[] = [];
                let newEdges: Edge[] = [];

                // 1. Rename current node if needed
                if (result.newLabel) {
                    setNodes(nds => nds.map(n => n.id === targetNodeId ? { ...n, data: { ...n.data, label: result.newLabel } } : n));
                }

                // 2. Add children recursively
                if (result.children && Array.isArray(result.children)) {
                    const processChildren = (parentId: string, children: any[], parentX: number, parentY: number, level: number) => {
                        children.forEach((child: any, index: number) => {
                            const childId = uuidv4();
                            // Position logic is rudimentary here, layout engine will fix it
                            const posX = parentX + 250;
                            const posY = parentY + (index * 60);

                            newNodes.push({
                                id: childId,
                                type: 'mindMap',
                                data: { label: child.label },
                                position: { x: posX, y: posY },
                            });

                            newEdges.push({
                                id: `e-${parentId}-${childId}`,
                                source: parentId,
                                target: childId,
                                type: 'smoothstep',
                                style: { stroke: '#9ca3af' }
                            });

                            if (child.children && Array.isArray(child.children)) {
                                processChildren(childId, child.children, posX, posY, level + 1);
                            }
                        });
                    };

                    processChildren(targetNodeId, result.children, selectedNode.position.x, selectedNode.position.y, 0);
                    
                    setNodes((nds) => [...nds, ...newNodes]);
                    setEdges((eds) => [...eds, ...newEdges]);
                }

                // Refresh Balance
                fetchBalance();

                // Auto Layout after a short delay
                setTimeout(() => onLayout('LR'), 100);

            } catch (e) {
                console.error('JSON Parse Error:', e);
                alert('AI生成格式错误，请重试');
            }
        } else if (response.error) {
            alert(`AI生成失败: ${response.error}`);
        }
    } catch (error) {
        console.error('AI Gen Error:', error);
        alert('AI生成发生错误');
    } finally {
        setIsGenerating(false);
    }
  };
  
  // Calculate position for the dialog
  const getDialogPosition = () => {
      if (!selectedNodeId || !reactFlowInstance) return undefined;
      const node = nodes.find(n => n.id === selectedNodeId);
      if (!node) return undefined;
      
      const { x, y, zoom } = reactFlowInstance.getViewport();
      const screenX = node.position.x * zoom + x + (node.width || 150) / 2;
      const screenY = node.position.y * zoom + y;
      
      return { x: screenX, y: screenY };
  };

  return (
    <div className="w-full h-full min-h-[600px] bg-[#111827] relative rounded-lg overflow-hidden border border-gray-800" ref={reactFlowWrapper}>
      <ReactFlowProvider>
        <div className="w-full h-full" style={{ height: '600px' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onInit={setReactFlowInstance}
            nodeTypes={nodeTypes} // Register custom node types
            fitView
            attributionPosition="bottom-right"
          >
            <Background color="#374151" gap={16} />
            <Controls className="bg-gray-800 border-gray-700 fill-gray-200" />
            <MiniMap style={{ height: 100 }} zoomable pannable className="bg-gray-800 border-gray-700" nodeColor={() => '#4b5563'} />

            {/* Left Toolbar: Operations */}
            <Panel position="top-left" className="m-4">
              <div className="flex items-center gap-2 p-2 bg-gray-800/80 backdrop-blur border border-gray-700 rounded-lg shadow-xl">
                <ToolbarButton 
                  onClick={() => addNode('child')} 
                  icon={<Plus className="w-4 h-4" />} 
                  tooltip="新增子节点" 
                  highlight
                />
                <ToolbarButton 
                  onClick={() => addNode('sibling')} 
                  icon={<GitMerge className="w-4 h-4" />} 
                  tooltip="新增兄弟节点" 
                />
                <div className="w-px h-4 bg-gray-600 mx-1" />
                <ToolbarButton 
                  onClick={deleteNode} 
                  icon={<Trash2 className="w-4 h-4" />} 
                  tooltip="删除节点" 
                  danger
                />
                <ToolbarButton 
                  onClick={() => {}} 
                  icon={<RotateCcw className="w-4 h-4" />} 
                  tooltip="撤销" 
                />
                <ToolbarButton 
                  onClick={() => {}} 
                  icon={<Share2 className="w-4 h-4" />} 
                  tooltip="分享" 
                />
              </div>
            </Panel>

            {/* Right Toolbar: AI & View */}
            <Panel position="top-right" className="m-4">
              <div className="flex items-center gap-2 p-2 bg-gray-800/80 backdrop-blur border border-gray-700 rounded-lg shadow-xl">
                <ToolbarButton 
                onClick={handleToolbarAiClick} 
                icon={isGenerating ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-purple-500 border-t-transparent" /> : <Sparkles className="w-4 h-4" />} 
                tooltip={isGenerating ? "生成中..." : "AI 智能生成"} 
                ai
              />
                <div className="w-px h-4 bg-gray-600 mx-1" />
                <ToolbarButton 
                  onClick={() => reactFlowInstance?.fitView()} 
                  icon={<Maximize className="w-4 h-4" />} 
                  tooltip="适应画布" 
                />
                <ToolbarButton 
                onClick={() => onLayout('LR')} 
                icon={<Layout className="w-4 h-4" />} 
                tooltip="自动布局" 
              />
                <ToolbarButton 
                  onClick={() => {}} 
                  icon={<Palette className="w-4 h-4" />} 
                  tooltip="切换主题" 
                />
              </div>
            </Panel>

          </ReactFlow>
          

        </div>
      </ReactFlowProvider>
    </div>
  );
};

interface ToolbarButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  tooltip: string;
  highlight?: boolean;
  danger?: boolean;
  ai?: boolean;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ onClick, icon, tooltip, highlight, danger, ai }) => {
  let baseClass = "p-2 rounded-md transition-all duration-200 group relative";
  let colorClass = "text-gray-400 hover:bg-gray-700 hover:text-white";

  if (highlight) colorClass = "text-blue-400 hover:bg-blue-500/20 hover:text-blue-300";
  if (danger) colorClass = "text-red-400 hover:bg-red-500/20 hover:text-red-300";
  if (ai) colorClass = "text-purple-400 hover:bg-purple-500/20 hover:text-purple-300";

  return (
    <button className={`${baseClass} ${colorClass}`} onClick={onClick} title={tooltip}>
      {icon}
    </button>
  );
};

export default MindMapEditor;
