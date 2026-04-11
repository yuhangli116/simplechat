import { supabase } from '@/lib/supabase'
import type { Edge, Node } from 'reactflow'

export interface WorkspaceFileNode {
  id: string
  name: string
  type: 'folder' | 'file' | 'mindmap'
  path?: string
  children?: WorkspaceFileNode[]
  mindMapType?: 'outline' | 'world' | 'character' | 'event'
  customIcon?: string
  savedContent?: string | null
  savedMindMap?: {
    nodes: Node[]
    edges: Edge[]
  } | null
}

type EditorType = 'outline' | 'world' | 'character' | 'event'

type WorkRow = {
  id: string
  title: string
  description: string | null
  status: string | null
  word_count: number | null
  created_at: string
}

type ChapterRow = {
  id: string
  work_id: string
  title: string
  content: string | null
  chapter_number: number
  word_count: number | null
  status: string | null
  created_at: string
}

type MindMapRow = {
  id: string
  work_id: string
  title: string
  editor_type: EditorType
  is_default: boolean
  custom_icon: string | null
  content: {
    nodes?: Node[]
    edges?: Edge[]
  } | null
  created_at: string
}

const ROOT_NAME = '我的作品'

const DEFAULT_MIND_MAPS: Array<{ editorType: EditorType; title: string; route: string }> = [
  { editorType: 'outline', title: '作品大纲', route: 'outline' },
  { editorType: 'world', title: '世界设定', route: 'world' },
  { editorType: 'character', title: '角色塑造', route: 'characters' },
  { editorType: 'event', title: '事件细纲', route: 'events' },
]

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const isUuid = (value?: string | null) => !!value && uuidPattern.test(value)

const stripHtml = (value: string | null | undefined) =>
  (value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

const getWordCount = (value: string | null | undefined) => stripHtml(value).length

const createRoot = (children: WorkspaceFileNode[] = []): WorkspaceFileNode[] => [
  {
    id: 'root',
    name: ROOT_NAME,
    type: 'folder',
    children,
  },
]

const getEditorTypeFromRoute = (route?: string | null): EditorType => {
  if (route === 'world') return 'world'
  if (route === 'characters') return 'character'
  if (route === 'events') return 'event'
  return 'outline'
}

const getDefaultMindMapTitle = (editorType: EditorType) =>
  DEFAULT_MIND_MAPS.find((item) => item.editorType === editorType)?.title || '作品大纲'

const getStandardMindMapId = (workId: string, editorType: EditorType) => `mm-${editorType}-${workId}`

const getStandardMindMapPath = (workId: string, editorType: EditorType) => {
  const route = DEFAULT_MIND_MAPS.find((item) => item.editorType === editorType)?.route || 'outline'
  return `/workspace/p/${workId}/${route}`
}

const getWorkIdFromPath = (path?: string) => {
  if (!path) return null
  const match = path.match(/\/workspace\/p\/([^/]+)/)
  return match?.[1] || null
}

const getChapterIdFromPath = (path?: string) => {
  if (!path) return null
  const match = path.match(/\/story\/([^/]+)/)
  return match?.[1] || null
}

const getMindMapRecordId = (node: WorkspaceFileNode) => {
  if (node.path?.includes('/mindmap/')) {
    return node.path.split('/').pop() || node.id
  }
  return node.id
}

const readLocalChapterContent = (node: WorkspaceFileNode) => {
  const workId = getWorkIdFromPath(node.path)
  const chapterId = getChapterIdFromPath(node.path)
  if (!workId || !chapterId || typeof window === 'undefined') return null
  return window.localStorage.getItem(`story-${workId}-${chapterId}`)
}

const readLocalMindMapContent = (node: WorkspaceFileNode) => {
  if (typeof window === 'undefined') return null

  if (node.savedMindMap) {
    return node.savedMindMap
  }

  if (node.path?.includes('/mindmap/')) {
    const recordId = node.path.split('/').pop()
    if (!recordId) return null
    const saved = window.localStorage.getItem(`mindmap-${recordId}`)
    if (!saved) return null
    try {
      return JSON.parse(saved)
    } catch {
      return null
    }
  }

  const workId = getWorkIdFromPath(node.path)
  if (!workId) return null
  const route = node.path?.split('/').pop()
  const editorType = getEditorTypeFromRoute(route)
  const saved = window.localStorage.getItem(`mindmap-${workId}-${editorType}`)
  if (!saved) return null

  try {
    return JSON.parse(saved)
  } catch {
    return null
  }
}

const enrichNodeForTrash = async (node: WorkspaceFileNode): Promise<WorkspaceFileNode> => {
  if (node.type === 'file') {
    const content = node.savedContent ?? readLocalChapterContent(node)
    return {
      ...node,
      savedContent: content,
    }
  }

  if (node.type === 'mindmap') {
    return {
      ...node,
      savedMindMap: readLocalMindMapContent(node),
    }
  }

  if (!node.children?.length) {
    return { ...node }
  }

  const children = await Promise.all(node.children.map((child) => enrichNodeForTrash(child)))
  return {
    ...node,
    children,
  }
}

const persistNestedNodes = async (
  workId: string,
  node: WorkspaceFileNode,
  chapterNumberRef: { value: number }
) => {
  if (node.type === 'file') {
    const chapterId = getChapterIdFromPath(node.path)
    if (!isUuid(chapterId)) return

    const content = node.savedContent ?? readLocalChapterContent(node)
    await supabase.from('chapters').upsert(
      {
        id: chapterId,
        work_id: workId,
        title: node.name,
        content,
        chapter_number: chapterNumberRef.value,
        word_count: getWordCount(content),
        status: 'draft',
      },
      { onConflict: 'id' }
    )

    chapterNumberRef.value += 1
    return
  }

  if (node.type === 'mindmap') {
    const recordId = getMindMapRecordId(node)
    const isDefault = !node.path?.includes('/mindmap/')
    const route = node.path?.split('/').pop()
    const editorType = node.mindMapType || getEditorTypeFromRoute(route)
    const content = readLocalMindMapContent(node)

    await supabase.from('mind_maps').upsert(
      {
        id: recordId,
        work_id: workId,
        title: node.name,
        editor_type: editorType,
        is_default: isDefault,
        custom_icon: node.customIcon || null,
        content: content || { nodes: [], edges: [] },
      },
      { onConflict: 'id' }
    )

    return
  }

  if (!node.children?.length) return

  for (const child of node.children) {
    await persistNestedNodes(workId, child, chapterNumberRef)
  }
}

export const loadWorkspaceTree = async (userId: string): Promise<WorkspaceFileNode[]> => {
  const [{ data: worksData, error: worksError }, { data: chaptersData, error: chaptersError }, { data: mindMapsData, error: mindMapsError }] =
    await Promise.all([
      supabase.from('works').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      supabase.from('chapters').select('*').order('chapter_number', { ascending: true }),
      supabase.from('mind_maps').select('*').order('created_at', { ascending: true }),
    ])

  if (worksError) throw worksError
  if (chaptersError) throw chaptersError
  if (mindMapsError) throw mindMapsError

  const works = (worksData || []) as WorkRow[]
  const chapters = (chaptersData || []) as ChapterRow[]
  const mindMaps = (mindMapsData || []) as MindMapRow[]

  const children: WorkspaceFileNode[] = works.map((work) => {
    const workChapters = chapters
      .filter((chapter) => chapter.work_id === work.id)
      .sort((a, b) => a.chapter_number - b.chapter_number)
      .map<WorkspaceFileNode>((chapter) => ({
        id: `ch-${chapter.id}`,
        name: chapter.title,
        type: 'file',
        path: `/workspace/p/${work.id}/story/${chapter.id}`,
      }))

    const workMindMaps = mindMaps.filter((mindMap) => mindMap.work_id === work.id)
    const defaultMindMaps: WorkspaceFileNode[] = DEFAULT_MIND_MAPS.map((item) => {
      const existing = workMindMaps.find((mindMap) => mindMap.is_default && mindMap.editor_type === item.editorType)

      return {
        id: existing?.id || getStandardMindMapId(work.id, item.editorType),
        name: existing?.title || item.title,
        type: 'mindmap' as const,
        mindMapType: item.editorType,
        customIcon: existing?.custom_icon || undefined,
        path: getStandardMindMapPath(work.id, item.editorType),
      }
    })

    const customMindMaps = workMindMaps
      .filter((mindMap) => !mindMap.is_default)
      .map<WorkspaceFileNode>((mindMap) => ({
        id: `mm-custom-${mindMap.id}`,
        name: mindMap.title,
        type: 'mindmap',
        mindMapType: mindMap.editor_type,
        customIcon: mindMap.custom_icon || undefined,
        path: `/workspace/p/${work.id}/mindmap/${mindMap.id}`,
      }))

    return {
      id: work.id,
      name: work.title,
      type: 'folder' as const,
      children: [
        {
          id: `meta-${work.id}`,
          name: '作品相关',
          type: 'folder' as const,
          children: [...defaultMindMaps, ...customMindMaps],
        },
        {
          id: `chapters-${work.id}`,
          name: '正文情节',
          type: 'folder' as const,
          children: workChapters,
        },
      ],
    }
  })

  return createRoot(children)
}

export const persistWorkTree = async (userId: string, workNode: WorkspaceFileNode) => {
  if (!isUuid(workNode.id)) return

  await supabase.from('works').upsert(
    {
      id: workNode.id,
      user_id: userId,
      title: workNode.name,
      description: null,
      status: 'draft',
      word_count: 0,
    },
    { onConflict: 'id' }
  )

  const chapterNumberRef = { value: 1 }
  for (const child of workNode.children || []) {
    await persistNestedNodes(workNode.id, child, chapterNumberRef)
  }
}

export const deleteWorkspaceNode = async (node: WorkspaceFileNode) => {
  if (node.type === 'file') {
    const chapterId = getChapterIdFromPath(node.path)
    if (chapterId) {
      await supabase.from('chapters').delete().eq('id', chapterId)
    }
    return
  }

  if (node.type === 'mindmap') {
    const recordId = getMindMapRecordId(node)
    await supabase.from('mind_maps').delete().eq('id', recordId)
    return
  }

  if (isUuid(node.id)) {
    await supabase.from('works').delete().eq('id', node.id)
  }
}

export const loadChapterContent = async (chapterId: string) => {
  const { data, error } = await supabase
    .from('chapters')
    .select('content')
    .eq('id', chapterId)
    .maybeSingle()

  if (error) throw error
  return data?.content || null
}

export const saveChapterContent = async (workId: string, chapterId: string, title: string, content: string) => {
  await supabase.from('chapters').upsert(
    {
      id: chapterId,
      work_id: workId,
      title,
      content,
      word_count: getWordCount(content),
      status: 'draft',
    },
    { onConflict: 'id' }
  )
}

export const loadMindMapContent = async (params: { workId: string; id?: string; type?: EditorType }) => {
  const { workId, id, type } = params

  if (id) {
    const { data, error } = await supabase
      .from('mind_maps')
      .select('content')
      .eq('work_id', workId)
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    return data?.content || null
  }

  if (!type) return null

  const { data, error } = await supabase
    .from('mind_maps')
    .select('content')
    .eq('work_id', workId)
    .eq('is_default', true)
    .eq('editor_type', type)
    .maybeSingle()

  if (error) throw error
  return data?.content || null
}

export const saveMindMapContent = async (params: {
  workId: string
  nodeId: string
  title: string
  type: EditorType
  isDefault: boolean
  customIcon?: string
  content: { nodes: Node[]; edges: Edge[] }
}) => {
  const { workId, nodeId, title, type, isDefault, customIcon, content } = params

  await supabase.from('mind_maps').upsert(
    {
      id: nodeId,
      work_id: workId,
      title,
      editor_type: type,
      is_default: isDefault,
      custom_icon: customIcon || null,
      content,
    },
    { onConflict: 'id' }
  )
}

export const createTrashSnapshot = async (node: WorkspaceFileNode) => enrichNodeForTrash(node)

export const findNodeById = (nodes: WorkspaceFileNode[], targetId: string): WorkspaceFileNode | null => {
  for (const node of nodes) {
    if (node.id === targetId) return node
    if (node.children?.length) {
      const found = findNodeById(node.children, targetId)
      if (found) return found
    }
  }

  return null
}

export const findWorkNodeForTarget = (nodes: WorkspaceFileNode[], targetId: string): WorkspaceFileNode | null => {
  const rootChildren = nodes[0]?.children || []

  for (const workNode of rootChildren) {
    if (workNode.id === targetId) return workNode
    if (findNodeById(workNode.children || [], targetId)) {
      return workNode
    }
  }

  return null
}

export const getMindMapTitleFromRoute = getDefaultMindMapTitle
