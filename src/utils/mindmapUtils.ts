import { Node, Edge } from 'reactflow';

/**
 * Extracts the text content of a node and all its descendants in a structured format.
 * 
 * @param nodes All nodes in the mind map
 * @param edges All edges in the mind map
 * @param rootId The ID of the node to start extraction from
 * @returns A formatted string containing the context
 */
export const getNodeContext = (nodes: Node[], edges: Edge[], rootId: string): string => {
  const rootNode = nodes.find(n => n.id === rootId);
  if (!rootNode) return '';

  let context = '';
  
  // Map to store children for each node for efficient traversal
  const childrenMap = new Map<string, string[]>();
  edges.forEach(edge => {
    if (!childrenMap.has(edge.source)) {
      childrenMap.set(edge.source, []);
    }
    childrenMap.get(edge.source)?.push(edge.target);
  });

  // Recursive function to traverse and build context
  const traverse = (nodeId: string, depth: number) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Indentation based on depth
    const indent = '  '.repeat(depth);
    context += `${indent}- ${node.data.label}\n`;
    
    // If node has detailed content (e.g. story chapter), include it
    if (node.data.content) {
        const contentLines = String(node.data.content).split('\n');
        contentLines.forEach((line: string) => {
            if (line.trim()) {
                context += `${indent}  ${line.trim()}\n`;
            }
        });
    }

    const children = childrenMap.get(nodeId) || [];
    
    // Sort children by Y position to maintain visual order (top to bottom)
    const childNodes = children
      .map(id => nodes.find(n => n.id === id))
      .filter((n): n is Node => !!n)
      .sort((a, b) => a.position.y - b.position.y);

    childNodes.forEach(child => {
      traverse(child.id, depth + 1);
    });
  };

  traverse(rootId, 0);
  
  return context;
};

/**
 * Helper to get all descendant IDs
 */
export const getDescendantIds = (nodes: Node[], edges: Edge[], rootId: string): string[] => {
    const descendants: string[] = [];
    const childrenMap = new Map<string, string[]>();
    edges.forEach(edge => {
        if (!childrenMap.has(edge.source)) {
            childrenMap.set(edge.source, []);
        }
        childrenMap.get(edge.source)?.push(edge.target);
    });

    const traverse = (nodeId: string) => {
        const children = childrenMap.get(nodeId) || [];
        children.forEach(childId => {
            descendants.push(childId);
            traverse(childId);
        });
    };

    traverse(rootId);
    return descendants;
};
