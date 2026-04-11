import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
} from 'reactflow';
import 'reactflow/dist/style.css';
import '@/styles/reactflow.css';
import { v4 as uuidv4 } from 'uuid';
import { aiService } from '@/services/ai';
import { useAuthStore } from '@/store/useAuthStore';
import { useFileStore } from '@/store/useFileStore';
import { Plus, Trash2, GitMerge, RotateCcw, RotateCw, Share2, Sparkles, Layout, Palette, Maximize, Check } from 'lucide-react';
import MindMapNode from './MindMapNode';
import { getLayoutedElements } from '@/utils/layout';
import AIGenerationDialog from './AIGenerationDialog';
import ContextSelectorDialog from './ContextSelectorDialog';
import { getMindMapTitleFromRoute, loadMindMapContent, saveMindMapContent } from '@/lib/workspacePersistence';

interface MindMapEditorProps {
  type?: 'outline' | 'world' | 'character' | 'event';
  workId?: string;
  id?: string; // Unique ID for this specific mindmap instance
  initialData?: { nodes: Node[], edges: Edge[] };
}

const THEMES = {
  dark: { label: '深色', bgClass: 'bg-[#111827]', borderClass: 'border-gray-800', flowBg: '#374151', nodeColor: '#4b5563', edgeColor: '#6b7280', panelClass: 'bg-gray-800/80 border-gray-700' },
  light: { label: '浅色', bgClass: 'bg-white', borderClass: 'border-gray-200', flowBg: '#e5e7eb', nodeColor: '#d1d5db', edgeColor: '#9ca3af', panelClass: 'bg-white/80 border-gray-200' },
  beige: { label: '护眼', bgClass: 'bg-[#fefae0]', borderClass: 'border-[#e9edc9]', flowBg: '#faedcd', nodeColor: '#d4a373', edgeColor: '#d4a373', panelClass: 'bg-[#fefae0]/90 border-[#e9edc9]' },
  green: { label: '自然', bgClass: 'bg-[#ecfccb]', borderClass: 'border-[#bef264]', flowBg: '#d9f99d', nodeColor: '#84cc16', edgeColor: '#84cc16', panelClass: 'bg-[#ecfccb]/90 border-[#bef264]' },
};

type ThemeType = keyof typeof THEMES;

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

type AIGeneratedTreeNode = {
  label: string;
  content?: string;
  children: AIGeneratedTreeNode[];
};

const extractJsonBlock = (content: string) => {
  const cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();

  if (!cleaned) return '';

  const candidates = [
    cleaned,
    cleaned.match(/\{[\s\S]*\}/)?.[0] || '',
    cleaned.match(/\[[\s\S]*\]/)?.[0] || '',
  ].filter(Boolean);

  return candidates[0] || '';
};

const normalizeGeneratedChildren = (value: unknown): AIGeneratedTreeNode[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const labelSource = candidate.label || candidate.title || candidate.name || candidate.node || candidate.text;
      const label = typeof labelSource === 'string' ? labelSource.trim() : '';

      if (!label) {
        return null;
      }

      const contentSource = candidate.content || candidate.description || candidate.summary;

      return {
        label,
        content: typeof contentSource === 'string' ? contentSource.trim() : undefined,
        children: normalizeGeneratedChildren(candidate.children || candidate.nodes || candidate.items),
      };
    })
    .filter((item): item is AIGeneratedTreeNode => Boolean(item));
};

const parseMindMapAIResult = (content: string) => {
  const jsonBlock = extractJsonBlock(content);
  if (!jsonBlock) {
    throw new Error('AI 未返回可解析的 JSON');
  }

  const parsed = JSON.parse(jsonBlock);
  const container = Array.isArray(parsed) ? { children: parsed } : parsed;

  return {
    newLabel: typeof container.newLabel === 'string' ? container.newLabel.trim() : '',
    content:
      typeof container.content === 'string'
        ? container.content.trim()
        : typeof container.description === 'string'
          ? container.description.trim()
          : '',
    children: normalizeGeneratedChildren(container.children || container.nodes || container.items || []),
  };
};

const MindMapEditor: React.FC<MindMapEditorProps> = ({ type = 'outline', workId, id, initialData }) => {
  const { user, fetchBalance, diamondBalance } = useAuthStore();
  const { files } = useFileStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastUsage, setLastUsage] = useState<{input_tokens: number, output_tokens: number, total_cost: number} | null>(null);
  
  // AI Context
  const [showContextSelector, setShowContextSelector] = useState(false);
  const [aiContexts, setAiContexts] = useState<Array<{ nodeId: string, content: string, sourceName: string }>>([]);

  // Theme Key based on page identity
  const themeKey = useMemo(() => {
    return id ? `mindmap-theme-${id}` : `mindmap-theme-${workId}-${type}`;
  }, [workId, type, id]);

  const storageKey = useMemo(() => {
    return id ? `mindmap-${id}` : `mindmap-${workId}-${type}`;
  }, [workId, type, id]);

  const currentPagePath = useMemo(() => {
    return id ? `/workspace/p/${workId}/mindmap/${id}` : `/workspace/p/${workId}/${type === 'character' ? 'characters' : type === 'event' ? 'events' : type}`;
  }, [id, workId, type]);

  const mindMapTitle = useMemo(() => {
    const findByPath = (nodes: typeof files): string | null => {
      for (const node of nodes) {
        if (node.path === currentPagePath) {
          return node.name;
        }
        if (node.children?.length) {
          const found = findByPath(node.children as typeof files);
          if (found) return found;
        }
      }
      return null;
    };

    return findByPath(files) || (location.state as any)?.fileName || getMindMapTitleFromRoute(type);
  }, [files, currentPagePath, location.state, type]);

  // Initialize theme from localStorage or default
  const [theme, setTheme] = useState<ThemeType>(() => {
    // Only use lazy init for initial mount. Navigation updates handle via useEffect.
    if (typeof window !== 'undefined') {
        // We can't access themeKey here easily as it's computed in component body
        // But we can reconstruct it from initial props or just default to 'dark'
        // and let the useEffect handle the correct load.
        // However, to avoid flash, we can try to read from the *current* props.
        // But props are available in scope.
        const key = id ? `mindmap-theme-${id}` : `mindmap-theme-${workId}-${type}`;
        const saved = localStorage.getItem(key);
        if (saved && THEMES[saved as ThemeType]) {
            return saved as ThemeType;
        }
    }
    return 'dark';
  });
  
  const [showThemeSelector, setShowThemeSelector] = useState(false);

  const handleThemeChange = (newTheme: ThemeType) => {
      setTheme(newTheme);
      localStorage.setItem(themeKey, newTheme);
      setShowThemeSelector(false);
  };

  // Ref to ReactFlow instance for coordinate projection
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Undo/Redo history
  const [history, setHistory] = useState<{nodes: Node[], edges: Edge[]}[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Add state to history
  const recordState = useCallback((newNodes: Node[], newEdges: Edge[]) => {
      setHistory(prev => {
          // If we are in the middle of history, discard future states (standard behavior when branching)
          // But wait, user wants "Allow Redo 1 step".
          // If we are at index 1 (of 0,1,2), and we add state.
          // Standard: discard 2. New history: 0, 1, New.
          // User requirement "Allow 3 undo steps, 1 redo step" usually applies to the *capacity* and *persistence* of redo stack.
          // If I make a NEW change, usually Redo stack is cleared.
          // The "1 redo step" rule likely applies to *traversing* history (Undo/Redo), not branching.
          // "Allow Redo 1 step" means if I Undo, I can Redo once.
          // If I make a new change, Redo is invalid.
          
          const currentHistory = prev.slice(0, historyIndex + 1);
          
          const nextHistory = [...currentHistory, { 
              nodes: JSON.parse(JSON.stringify(newNodes)), 
              edges: JSON.parse(JSON.stringify(newEdges)) 
          }];
          
          // Max 4 states (Current + 3 Undo)
          if (nextHistory.length > 4) {
              nextHistory.shift();
          }
          
          return nextHistory;
      });
      
      setHistoryIndex(prev => {
          // If we sliced, prev might be irrelevant, but we know we are at the end.
          // Length is either historyIndex + 2 or capped.
          // If capped (shifted), index stays at max-1 (3).
          // If not capped, index increments.
          
          // Easier: Calculate based on length inside setHistory?
          // We can't share variables easily.
          // But we know the logic:
          // If history was shifted, index is 3.
          // If not shifted, index is prev + 1.
          
          // Let's rely on the fact that max length is 4.
          // If prev < 3, return prev + 1.
          // If prev == 3, return 3.
          return Math.min(prev + 1, 3);
      });
  }, [historyIndex]);

  // Fetch balance on mount
  React.useEffect(() => {
    if (user) {
      fetchBalance();
    }
  }, [user]);

  const defaultData = useMemo(() => getDefaultData(type), [type]);
  const startNodes = initialData?.nodes || defaultData.nodes;
  const startEdges = initialData?.edges || defaultData.edges;

  const [nodes, setNodes, onNodesChange] = useNodesState(startNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(startEdges);
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  // Load Theme when page changes
  React.useEffect(() => {
      const saved = localStorage.getItem(themeKey);
      if (saved && THEMES[saved as ThemeType]) {
          setTheme(saved as ThemeType);
      } else {
          setTheme('dark');
      }
  }, [themeKey]);

  // Sync Node/Edge Styles when theme changes (Visual Update Only)
  React.useEffect(() => {
    setNodes(nds => nds.map(n => ({
        ...n,
        data: { ...n.data, theme }
    })));
    
    setEdges(eds => eds.map(e => ({
        ...e,
        style: { ...e.style, stroke: THEMES[theme].edgeColor }
    })));
  }, [theme, setNodes, setEdges]);

  // Initialize history
  React.useEffect(() => {
      if (history.length === 0 && nodes.length > 0) {
          setHistory([{ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }]);
          setHistoryIndex(0);
      }
  }, []);

  // (Removed old Theme Persistence & Sync effect)
  
  // (Removed Load Theme on Mount effect as it is now handled by useState lazy initialization)

  const handleAiClick = useCallback((nodeId: string) => {
    // DEV MODE: Allow without login
    // if (!user) {
    //   alert('请先登录后使用AI功能');
    //   navigate('/login');
    //   return;
    // }
    setSelectedNodeId(nodeId);
    setShowAIDialog(true);
  }, [user, navigate]);

  const handleToolbarAiClick = useCallback(() => {
    // DEV MODE: Allow without login
    // if (!user) {
    //   alert('请先登录后使用AI功能');
    //   navigate('/login');
    //   return;
    // }
    if (!selectedNodeId) {
        alert('请先选择一个节点');
        return;
    }
    setShowAIDialog(true);
  }, [user, selectedNodeId, navigate]);

  const handleCloseAiDialog = () => {
    setShowAIDialog(false);
  };

  const handleNodeLabelChange = useCallback((nodeId: string, newLabel: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: { ...node.data, label: newLabel },
          };
        }
        return node;
      })
    );
    // We don't explicitly record history here because history is manual in this component
    // and we want to avoid too many history states for typing.
    // However, since this is called on blur/enter (committed change), we SHOULD record it.
    // We need the NEW state to record.
    // Since setNodes is async-ish in React batching, we can't get the new nodes immediately.
    // But we can construct them.
    
    // Better approach: Calculate new nodes, set them, AND record history.
    setNodes((currentNodes) => {
        const newNodes = currentNodes.map((node) => {
            if (node.id === nodeId) {
                return {
                    ...node,
                    data: { ...node.data, label: newLabel },
                };
            }
            return node;
        });
        
        // Record state with current edges (assuming edges didn't change)
        // Accessing edges state inside setNodes callback is tricky if not using functional update for recordState.
        // But recordState uses setHistory which is fine.
        // However, we need the *current* edges.
        // We can't easily access 'edges' state inside 'setNodes' callback without it being a dependency.
        // Let's just trigger a side effect or use a separate effect? 
        // No, let's just do it in the render cycle or use a ref for edges?
        
        // Simpler: Just update state. 
        // User didn't strictly ask for Undo on text edit, but "saving" is the priority.
        // The main issue is "content reverts".
        return newNodes;
    });
  }, [setNodes]);

  const nodeTypes = useMemo(() => ({
    mindMap: (props: any) => {
      return (
        <MindMapNode 
            {...props} 
            data={{
            ...props.data,
            onAiClick: () => handleAiClick(props.id),
            onChange: (newLabel: string) => handleNodeLabelChange(props.id, newLabel),
            aiActive: props.id === selectedNodeId && showAIDialog,
            theme: theme
            }} 
        />
      );
    },
  }), [handleAiClick, selectedNodeId, showAIDialog, theme, handleNodeLabelChange]);
  
  // Load from localStorage or reset when type/workId/id changes

  // Load from localStorage or reset when type/workId/id changes
  React.useEffect(() => {
    if (!workId && !id) {
      const newData = getDefaultData(type);
      setNodes(newData.nodes);
      setEdges(newData.edges);
      return;
    }

    const applyMindMapData = (content: { nodes?: Node[]; edges?: Edge[] } | null) => {
      const newData = getDefaultData(type);
      if (location.state && (location.state as any).fileName) {
          const fileName = (location.state as any).fileName;
          newData.nodes[0].data.label = fileName;
      }
      if (content?.nodes?.length) {
        setNodes(content.nodes);
        setEdges(content.edges || []);
        return;
      }
      setNodes(newData.nodes);
      setEdges(newData.edges);
    };

    const loadData = async () => {
      if (user && workId) {
        try {
          const remoteContent = await loadMindMapContent({ workId, id, type: id ? undefined : type });
          if (remoteContent) {
            localStorage.setItem(storageKey, JSON.stringify(remoteContent));
            applyMindMapData(remoteContent as { nodes?: Node[]; edges?: Edge[] } | null);
            return;
          }
        } catch (error) {
          console.error('Failed to load mind map from Supabase:', error);
        }
      }

      const saved = localStorage.getItem(storageKey);
      if (!saved) {
        applyMindMapData(null);
        return;
      }

      try {
        applyMindMapData(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved mindmap', e);
        applyMindMapData(null);
      }
    };

    loadData();
  }, [type, workId, id, setNodes, setEdges, location.state, user, storageKey]);

  React.useEffect(() => {
    if (!workId && !id) return;
    const timeout = setTimeout(() => {
      const payload = { nodes, edges };
      localStorage.setItem(storageKey, JSON.stringify(payload));
      if (user && workId) {
        saveMindMapContent({
          workId,
          nodeId: id || `mm-${type}-${workId}`,
          title: mindMapTitle,
          type,
          isDefault: !id,
          content: payload,
        }).catch((error) => {
          console.error('Failed to save mind map to Supabase:', error);
        });
      }
    }, 1000);
    return () => clearTimeout(timeout);
  }, [nodes, edges, workId, type, id, user, storageKey, mindMapTitle]);

  // Center view on mount or data change
  React.useEffect(() => {
    if (reactFlowInstance && nodes.length > 0) {
      const timeout = setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.2 });
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [reactFlowInstance, type, workId, id, nodes.length]);

  React.useEffect(() => {
    if (!showAIDialog || !selectedNode || !reactFlowInstance) return;

    const width = typeof (selectedNode as Node & { width?: number }).width === 'number' ? (selectedNode as Node & { width?: number }).width || 0 : 0;
    const height = typeof (selectedNode as Node & { height?: number }).height === 'number' ? (selectedNode as Node & { height?: number }).height || 0 : 0;
    const centerX = selectedNode.position.x + width / 2;
    const centerY = selectedNode.position.y + height / 2;
    const currentZoom = typeof reactFlowInstance.getZoom === 'function' ? reactFlowInstance.getZoom() : 1;

    reactFlowInstance.setCenter(centerX, centerY, {
      zoom: Math.max(currentZoom, 1.1),
      duration: 400,
    });
  }, [showAIDialog, selectedNode, reactFlowInstance]);

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setShowAIDialog(false);
  }, []);

  // --- Operations ---
  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;
    
    const newIndex = historyIndex - 1;
    const state = history[newIndex];
    
    if (state) {
        setNodes(JSON.parse(JSON.stringify(state.nodes)));
        setEdges(JSON.parse(JSON.stringify(state.edges)));
    }
    
    // We update historyIndex first.
    setHistoryIndex(newIndex);
    
    // Enforce "Max 1 redo step"
    // After undoing, we are at newIndex. Future steps are from newIndex + 1 to end.
    // If length - 1 - newIndex > 1, we should truncate history from the end.
    setHistory(prev => {
        const newHistory = [...prev];
        while (newHistory.length - 1 - newIndex > 1) {
            newHistory.pop();
        }
        return newHistory;
    });
  }, [historyIndex, history, setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    
    const newIndex = historyIndex + 1;
    const state = history[newIndex];
    if (state) {
        setNodes(JSON.parse(JSON.stringify(state.nodes)));
        setEdges(JSON.parse(JSON.stringify(state.edges)));
    }
    setHistoryIndex(newIndex);
  }, [historyIndex, history, setNodes, setEdges]);

  const toggleThemeSelector = useCallback(() => {
    setShowThemeSelector((v) => !v);
  }, []);

  const addNode = (type: 'child' | 'sibling') => {
    // DEV MODE: Allow adding nodes without login
    // if (!user) {
    //   if (confirm('新建节点功能需要登录，是否立即登录？')) {
    //     navigate('/login');
    //   }
    //   return;
    // }
    if (!selectedNodeId) {
      alert('请先选择一个节点');
      return;
    }

    const selectedNode = nodes.find(n => n.id === selectedNodeId);
    if (!selectedNode) return;

    const SIBLING_Y_OFFSET = 100;

    let newPos = { x: 0, y: 0 };
    let parentId = '';
    let workingNodes = [...nodes];

    const getNodeWidth = (node: Node) => {
      const renderedWidth = (node as any).width;
      if (typeof renderedWidth === 'number' && renderedWidth > 0) return renderedWidth;
      return Math.max(150, ((node.data?.label as string)?.length || 5) * 14 + 40);
    };

    const getMaxY = (nodeId: string, sourceNodes: Node[]): number => {
      const childEdges = edges.filter(e => e.source === nodeId);
      const childNodes = sourceNodes.filter(n => childEdges.some(e => e.target === n.id));
      if (childNodes.length === 0) {
        const node = sourceNodes.find(n => n.id === nodeId);
        return node ? node.position.y : 0;
      }
      return Math.max(...childNodes.map(child => getMaxY(child.id, sourceNodes)));
    };

    const getDescendantIds = (startIds: string[]) => {
      const result = new Set<string>(startIds);
      const queue = [...startIds];
      while (queue.length > 0) {
        const current = queue.shift()!;
        const children = edges.filter(e => e.source === current).map(e => e.target);
        children.forEach(id => {
          if (!result.has(id)) {
            result.add(id);
            queue.push(id);
          }
        });
      }
      return result;
    };

    if (type === 'sibling') {
       const parentEdge = edges.find(e => e.target === selectedNodeId);
       if (!parentEdge) {
         alert('根节点无法添加兄弟节点');
         return;
       }
       parentId = parentEdge.source;
       
       const siblingEdges = edges.filter(e => e.source === parentId);
       const siblingNodes = workingNodes.filter(n => siblingEdges.some(e => e.target === n.id));
       const sortedSiblings = [...siblingNodes].sort((a, b) => a.position.y - b.position.y);
       const lastSibling = sortedSiblings[sortedSiblings.length - 1];

       if (lastSibling) {
           const maxY = getMaxY(lastSibling.id, workingNodes);
           newPos = { x: lastSibling.position.x, y: maxY + SIBLING_Y_OFFSET };
       } else {
           newPos = { x: selectedNode.position.x, y: selectedNode.position.y + SIBLING_Y_OFFSET };
       }
       
    } else {
       parentId = selectedNodeId;
       const requiredChildX = selectedNode.position.x + getNodeWidth(selectedNode) + 50;
       const childEdges = edges.filter(e => e.source === parentId);
       let childNodes = workingNodes.filter(n => childEdges.some(e => e.target === n.id));

       if (childNodes.length > 0) {
            const minChildX = Math.min(...childNodes.map(n => n.position.x));
            if (requiredChildX > minChildX) {
              const delta = requiredChildX - minChildX;
              const idsToShift = getDescendantIds(childNodes.map(n => n.id));
              workingNodes = workingNodes.map(n => (
                idsToShift.has(n.id)
                  ? { ...n, position: { ...n.position, x: n.position.x + delta } }
                  : n
              ));
              childNodes = workingNodes.filter(n => childEdges.some(e => e.target === n.id));
            }
            const sortedChildren = [...childNodes].sort((a, b) => a.position.y - b.position.y);
            const lastChild = sortedChildren[sortedChildren.length - 1];
            const maxY = getMaxY(lastChild.id, workingNodes);
            newPos = { x: Math.max(requiredChildX, lastChild.position.x), y: maxY + SIBLING_Y_OFFSET };
       } else {
            newPos = { x: requiredChildX, y: selectedNode.position.y };
       }
    }

    const newNodeId = uuidv4();
    
    const newNode: Node = {
      id: newNodeId,
      type: 'mindMap',
      data: { label: '新节点', theme },
      position: newPos,
    };

    const newEdge: Edge = {
      id: `e-${parentId}-${newNodeId}`,
      source: parentId,
      target: newNodeId,
      type: 'smoothstep',
      style: { stroke: THEMES[theme].edgeColor }
    };

    const nextNodes = [...workingNodes, newNode];
    const nextEdges = [...edges, newEdge];

    setNodes(nextNodes);
    setEdges(nextEdges);
    recordState(nextNodes, nextEdges);
  };

  const deleteNode = () => {
    if (!selectedNodeId) return;
    const nextNodes = nodes.filter((n) => n.id !== selectedNodeId);
    const nextEdges = edges.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId);
    
    setNodes(nextNodes);
    setEdges(nextEdges);
    recordState(nextNodes, nextEdges);
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
      recordState(layoutedNodes, layoutedEdges);
      
      setTimeout(() => {
          reactFlowInstance?.fitView();
      }, 50);
    },
    [nodes, edges, setNodes, setEdges, reactFlowInstance, recordState]
  );

  // --- AI Generation Logic ---
  
  // (Old handleAiClick removed to avoid duplicate declaration)

  const handleAiSubmit = async (model: string, userPrompt: string) => {
    // Dev Mode: Allow without login
    // if (!user) {
    //   alert('请先登录后使用AI功能');
    //   return;
    // }
    
    const targetNodeId = selectedNodeId;
    if (!targetNodeId) return;

    const selectedNode = nodes.find(n => n.id === targetNodeId);
    if (!selectedNode) return;

    setIsGenerating(true);

    try {
        let finalContext = '';
        let summarizationUsage = null;
        
        if (aiContexts.length > 0) {
            let combinedContext = '';
            aiContexts.forEach(ctx => {
                combinedContext += `来源: ${ctx.sourceName}\n内容:\n${ctx.content}\n\n`;
            });
            
            if (combinedContext.length > 3000) {
                const summaryRes = await aiService.summarizeContext(combinedContext, user?.id);
                if (summaryRes.error) {
                    alert(`总结上下文失败: ${summaryRes.error}`);
                    setIsGenerating(false);
                    return;
                }
                finalContext = `【经过精简的参考上下文摘要】\n${summaryRes.content}`;
                if (summaryRes.usage) summarizationUsage = summaryRes.usage;
            } else {
                finalContext = `【参考上下文】\n${combinedContext}`;
            }
        }

        // Construct Prompt
        const prompt = `你是一个专业的小说大纲生成助手。
当前选中节点是：${selectedNode.data.label}
根节点是：${nodes.find(n => n.data.isRoot)?.data.label || '未知小说'}

用户需求：${userPrompt}

请根据用户需求和上下文，为当前节点补全内容，并在需要时生成子节点。
请直接返回一个纯 JSON 对象，结构如下：
{
  "newLabel": "可选，新标题",
  "content": "可选，当前节点的正文描述",
  "children": [
    {
      "label": "子节点标题",
      "content": "可选，子节点描述",
      "children": [
         { "label": "孙子节点（可选）", "content": "可选" }
      ]
    }
  ]
}
注意：
1. 返回必须是合法的 JSON。
2. 不要包含 Markdown 格式（如 \`\`\`json）。
3. 如果用户只想补全当前节点，可以让 children 为空，但要返回 content。
4. children 中每个节点都必须包含 label 字段。`;

        const response = await aiService.generateText({
            prompt,
            context: finalContext,
            model: model as any, 
            userId: user?.id || 'guest-user' // Guest fallback
        });

        if (response.content) {
            try {
                const result = parseMindMapAIResult(response.content);
                
                let currentNodes = [...nodes];
                let currentEdges = [...edges];
                let stateChanged = false;

                if (result.newLabel) {
                    currentNodes = currentNodes.map((node) =>
                      node.id === targetNodeId
                        ? { ...node, data: { ...node.data, label: result.newLabel } }
                        : node
                    );
                    stateChanged = true;
                }

                if (result.content) {
                    currentNodes = currentNodes.map((node) =>
                      node.id === targetNodeId
                        ? { ...node, data: { ...node.data, content: result.content } }
                        : node
                    );
                    stateChanged = true;
                }

                if (result.children.length > 0) {
                    const existingChildIds = new Set<string>();
                    const queue = currentEdges.filter((edge) => edge.source === targetNodeId).map((edge) => edge.target);

                    while (queue.length > 0) {
                      const currentId = queue.shift()!;
                      if (existingChildIds.has(currentId)) {
                        continue;
                      }
                      existingChildIds.add(currentId);
                      currentEdges
                        .filter((edge) => edge.source === currentId)
                        .forEach((edge) => queue.push(edge.target));
                    }

                    currentNodes = currentNodes.filter((node) => !existingChildIds.has(node.id));
                    currentEdges = currentEdges.filter(
                      (edge) => edge.source !== targetNodeId && !existingChildIds.has(edge.source) && !existingChildIds.has(edge.target)
                    );

                    const newNodesToAdd: Node[] = [];
                    const newEdgesToAdd: Edge[] = [];

                    const processChildren = (
                      parentId: string,
                      children: AIGeneratedTreeNode[],
                      parentX: number,
                      parentY: number,
                      level: number
                    ) => {
                      children.forEach((child, index) => {
                        const childId = uuidv4();
                        const posX = parentX + 250;
                        const posY = parentY + index * 110 + level * 10;

                        newNodesToAdd.push({
                          id: childId,
                          type: 'mindMap',
                          data: {
                            label: child.label,
                            content: child.content,
                            theme,
                          },
                          position: { x: posX, y: posY },
                        });

                        newEdgesToAdd.push({
                          id: `e-${parentId}-${childId}`,
                          source: parentId,
                          target: childId,
                          type: 'smoothstep',
                          style: { stroke: THEMES[theme].edgeColor }
                        });

                        if (child.children.length > 0) {
                          processChildren(childId, child.children, posX, posY, level + 1);
                        }
                      });
                    };

                    const parentNode = currentNodes.find((node) => node.id === targetNodeId);
                    if (parentNode) {
                      processChildren(targetNodeId, result.children, parentNode.position.x, parentNode.position.y, 0);
                      currentNodes = [...currentNodes, ...newNodesToAdd];
                      currentEdges = [...currentEdges, ...newEdgesToAdd];
                      stateChanged = true;
                    }
                }
                
                if (stateChanged) {
                    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
                      currentNodes,
                      currentEdges,
                      'LR'
                    );

                    setNodes(layoutedNodes);
                    setEdges(layoutedEdges);
                    recordState(layoutedNodes, layoutedEdges);
                }

                setShowAIDialog(false);
                
                if (response.usage) {
                    const totalCost = response.usage.total_cost + (summarizationUsage ? summarizationUsage.total_cost : 0);
                    const inputTokens = response.usage.input_tokens + (summarizationUsage ? summarizationUsage.input_tokens : 0);
                    const outputTokens = response.usage.output_tokens + (summarizationUsage ? summarizationUsage.output_tokens : 0);
                    setLastUsage({
                        input_tokens: inputTokens,
                        output_tokens: outputTokens,
                        total_cost: totalCost
                    });
                    setTimeout(() => setLastUsage(null), 5000);
                }

                fetchBalance();

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
  
  return (
    <div className={`w-full h-full min-h-[600px] relative rounded-lg overflow-hidden border transition-colors ${THEMES[theme].bgClass} ${THEMES[theme].borderClass}`} ref={reactFlowWrapper}>
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
            <Background color={THEMES[theme].flowBg} gap={16} />
            <Controls className={THEMES[theme].panelClass} />
            <MiniMap 
                style={{ height: 100 }} 
                zoomable 
                pannable 
                className={THEMES[theme].panelClass} 
                nodeColor={() => THEMES[theme].nodeColor} 
            />

            {/* Left Toolbar: Operations */}
            <Panel position="top-left" className="m-4">
              <div className={`flex items-center gap-2 p-2 backdrop-blur border rounded-lg shadow-xl ${THEMES[theme].panelClass}`}>
                <ToolbarButton 
                  onClick={() => addNode('child')} 
                  icon={<Plus className="w-4 h-4" />} 
                  tooltip="新增子节点" 
                  highlight
                  theme={theme}
                />
                <ToolbarButton 
                  onClick={() => addNode('sibling')} 
                  icon={<GitMerge className="w-4 h-4" />} 
                  tooltip="新增兄弟节点" 
                  theme={theme}
                />
                <div className={`w-px h-4 mx-1 ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'}`} />
                <ToolbarButton 
                  onClick={deleteNode} 
                  icon={<Trash2 className="w-4 h-4" />} 
                  tooltip="删除节点" 
                  danger
                  theme={theme}
                />
                <div className={`w-px h-4 mx-1 ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'}`} />
                <ToolbarButton 
                  onClick={handleUndo} 
                  icon={<RotateCcw className="w-4 h-4" />} 
                  tooltip="向左撤销" 
                  theme={theme}
                />
                <ToolbarButton 
                  onClick={handleRedo} 
                  icon={<RotateCw className="w-4 h-4" />} 
                  tooltip="向右恢复" 
                  theme={theme}
                />
              </div>
            </Panel>

            {/* Right Toolbar: AI & View */}
            <Panel position="top-right" className="m-4">
              <div className={`flex items-center gap-2 p-2 backdrop-blur border rounded-lg shadow-xl ${THEMES[theme].panelClass}`}>
                <ToolbarButton 
                onClick={handleToolbarAiClick} 
                icon={isGenerating ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-purple-500 border-t-transparent" /> : <Sparkles className="w-4 h-4" />} 
                tooltip={isGenerating ? "生成中..." : "AI 智能生成"} 
                ai
                theme={theme}
              />
                <div className={`w-px h-4 mx-1 ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'}`} />
                <ToolbarButton 
                  onClick={() => reactFlowInstance?.fitView()} 
                  icon={<Maximize className="w-4 h-4" />} 
                  tooltip="适应画布" 
                  theme={theme}
                />
                <ToolbarButton 
                onClick={() => onLayout('LR')} 
                icon={<Layout className="w-4 h-4" />} 
                tooltip="自动布局" 
                theme={theme}
              />
                <div className="relative">
                    <ToolbarButton 
                      onClick={toggleThemeSelector} 
                      icon={<Palette className="w-4 h-4" />} 
                      tooltip="切换主题" 
                      theme={theme}
                    />
                    {showThemeSelector && (
                      <div className={`absolute top-12 right-0 p-3 rounded-lg border shadow-xl flex flex-col gap-2 w-max z-50 ${theme === 'dark' ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
                        <div className="text-xs font-bold mb-1 opacity-70">选择主题</div>
                        <div className="grid grid-cols-2 gap-2">
                        {(Object.keys(THEMES) as ThemeType[]).map((t) => (
                          <button
                            key={t}
                            onClick={() => handleThemeChange(t)}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-gray-100'} ${theme === t ? 'ring-1 ring-blue-500 bg-blue-500/10' : ''}`}
                            title={THEMES[t].label}
                          >
                            <div 
                               className="w-4 h-4 rounded-full border shadow-sm"
                               style={{ backgroundColor: t === 'dark' ? '#1f2937' : t === 'light' ? '#ffffff' : t === 'beige' ? '#fefae0' : '#ecfccb', borderColor: 'rgba(0,0,0,0.1)' }}
                            />
                            <span className="text-sm font-medium">{THEMES[t].label}</span>
                            {theme === t && <Check className="w-3 h-3 ml-auto opacity-80 text-blue-500" />}
                          </button>
                        ))}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            </Panel>

            {/* AI Usage Toast */}
            {lastUsage && (
                <Panel position="bottom-center">
                    <div className="mb-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="bg-purple-50 border border-purple-200 text-purple-700 px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium">
                            <Sparkles className="w-4 h-4 text-purple-500" />
                            <span>AI 生成成功</span>
                            <span className="text-purple-600/80 bg-purple-100/50 px-2 py-0.5 rounded-full text-xs border border-purple-200/50 ml-2">
                                消耗: {lastUsage.total_cost} 钻石 (In: {lastUsage.input_tokens}, Out: {lastUsage.output_tokens})
                            </span>
                        </div>
                    </div>
                </Panel>
            )}

          </ReactFlow>
          

        </div>
      </ReactFlowProvider>

      {showAIDialog && selectedNode && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/20 backdrop-blur-[2px] px-4" onClick={handleCloseAiDialog}>
          <div className="flex w-full max-w-5xl items-start justify-center gap-4" onClick={(event) => event.stopPropagation()}>
            <div className={`hidden xl:block mt-10 w-72 rounded-2xl border p-4 shadow-2xl ${theme === 'dark' ? 'bg-gray-900/95 border-gray-700 text-white' : 'bg-white/95 border-gray-200 text-gray-900'}`}>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-500">当前编辑节点</div>
              <div className="mt-3 rounded-xl border border-purple-200/60 bg-purple-50/80 p-4 text-gray-900">
                <div className="text-sm font-semibold">{selectedNode.data.label}</div>
                <div className="mt-2 text-xs leading-5 text-gray-600">
                  {typeof selectedNode.data.content === 'string' && selectedNode.data.content.trim()
                    ? selectedNode.data.content
                    : '这个节点会保持在画布中心，你现在输入的提示词会直接作用于它，并在需要时自动创建子节点。'}
                </div>
              </div>
            </div>
            <div className="pointer-events-auto">
              <AIGenerationDialog
                isOpen={true}
                onClose={handleCloseAiDialog}
                onSubmit={handleAiSubmit}
                nodeLabel={selectedNode.data.label}
                nodeId={selectedNode.id}
                balance={diamondBalance}
                contexts={aiContexts}
                onAddContext={() => setShowContextSelector(true)}
                onRemoveContext={(index) => {
                  setAiContexts((prev) => prev.filter((_, i) => i !== index));
                }}
                isGenerating={isGenerating}
                loadingText="AI生成中..."
                lastUsage={lastUsage}
              />
            </div>
          </div>
        </div>
      )}

      {/* Context Selector Dialog */}
      <ContextSelectorDialog 
        isOpen={showContextSelector}
        onClose={() => setShowContextSelector(false)}
        onSelect={(context) => {
            setAiContexts(prev => [...prev, context]);
            // We don't close AI dialog, we just update context
        }}
        workId={workId}
      />
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
  theme?: string;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ onClick, icon, tooltip, highlight, danger, ai, theme = 'dark' }) => {
  const isDark = theme === 'dark';
  const baseClass = "p-2 rounded-md transition-all duration-200 group relative";
  
  // Default colors based on theme
  let colorClass = isDark 
    ? "text-gray-400 hover:bg-gray-700 hover:text-white" 
    : "text-gray-500 hover:bg-gray-100 hover:text-gray-900";

  if (highlight) colorClass = "text-blue-500 hover:bg-blue-500/20";
  if (danger) colorClass = "text-red-500 hover:bg-red-500/20";
  if (ai) colorClass = "text-purple-500 hover:bg-purple-500/20";

  return (
    <button className={`${baseClass} ${colorClass}`} onClick={onClick} title={tooltip}>
      {icon}
    </button>
  );
};

export default MindMapEditor;
