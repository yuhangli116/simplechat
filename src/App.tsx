import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import { useTrashStore } from '@/store/useTrashStore';
import { type FileNode, guestDemoFileStructure, useFileStore } from '@/store/useFileStore';
import Login from '@/pages/auth/Login';
import Register from '@/pages/auth/Register';
import ForgotPassword from '@/pages/auth/ForgotPassword';
import ResetPassword from '@/pages/auth/ResetPassword';
import WorkspaceLayout from '@/layouts/WorkspaceLayout';
import StoryEditor from '@/pages/workspace/StoryEditor';
import Outline from '@/pages/workspace/Outline';
import World from '@/pages/workspace/World';
import Characters from '@/pages/workspace/Characters';
import Events from '@/pages/workspace/Events';
import CustomMindMap from '@/pages/workspace/CustomMindMap';
import Membership from '@/pages/Membership';
import Prompts from '@/pages/Prompts';
import Community from '@/pages/Community';
import Trash from '@/pages/Trash';
import Welfare from '@/pages/Welfare';
import Guide from '@/pages/Guide';
import Download from '@/pages/Download';
import { ToastContainer } from '@/components/ToastContainer';
import Records from '@/pages/Records';
import { Validate } from '@/pages/placeholders';
import { loadWorkspaceTree } from '@/lib/workspacePersistence';

// Redirect helper for legacy routes
const LegacyStoryRedirect = () => {
  return <Navigate to="/workspace" replace />;
};

const findFirstWorkspacePath = (nodes: FileNode[]): string | null => {
  for (const node of nodes) {
    if (node.path) return node.path;
    if (node.children?.length) {
      const childPath = findFirstWorkspacePath(node.children);
      if (childPath) return childPath;
    }
  }
  return null;
};

const WorkspaceIndexRoute = () => {
  const { user } = useAuthStore();
  const { setFiles, createWorkInProgress } = useFileStore();
  const [targetPath, setTargetPath] = React.useState<string | null>(null);
  const [resolved, setResolved] = React.useState(false);

  useEffect(() => {
    let cancelled = false;

    const resolveTarget = async () => {
      if (!user) {
        setFiles(JSON.parse(JSON.stringify(guestDemoFileStructure)));
        if (!cancelled) {
          setTargetPath('/workspace/p/book-1/story/1');
          setResolved(true);
        }
        return;
      }

      try {
        const remoteTree = await loadWorkspaceTree(user.id);
        if (cancelled) return;
        setFiles(remoteTree as FileNode[]);
        setTargetPath(findFirstWorkspacePath(remoteTree) || null);
      } catch (error) {
        console.error('Failed to resolve workspace entry:', error);
        if (!cancelled) {
          const localPath = findFirstWorkspacePath(useFileStore.getState().files);
          setTargetPath(localPath || null);
        }
      } finally {
        if (!cancelled) {
          setResolved(true);
        }
      }
    };

    void resolveTarget();

    return () => {
      cancelled = true;
    };
  }, [setFiles, user]);

  if (targetPath) {
    return <Navigate to={targetPath} replace />;
  }

  if (!resolved) {
    return <div className="p-6 text-sm text-muted-foreground">正在加载工作区...</div>;
  }

  if (createWorkInProgress) {
    return <div className="p-6 text-sm text-muted-foreground">正在创建作品...</div>;
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold">还没有作品</h2>
      <p className="mt-2 text-sm text-muted-foreground">请在左侧点击新建作品，创建后会自动进入对应页面。</p>
    </div>
  );
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value?: string | null) => !!value && uuidPattern.test(value);

const workAccessCache = new Map<string, boolean>();

const WorkAccessGuard = () => {
  const { workId } = useParams();
  const { user } = useAuthStore();
  const [allowed, setAllowed] = React.useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      if (!user) {
        setAllowed(true);
        return;
      }

      if (!isUuid(workId)) {
        setAllowed(false);
        return;
      }

      const cacheKey = `${user.id}:${workId}`;
      const cached = workAccessCache.get(cacheKey);
      if (typeof cached === 'boolean') {
        setAllowed(cached);
        return;
      }

      setAllowed(null);
      try {
        const { data, error } = await supabase
          .from('works')
          .select('id')
          .eq('id', workId)
          .eq('user_id', user.id)
          .maybeSingle();

        const ok = Boolean(!error && data?.id);
        workAccessCache.set(cacheKey, ok);
        if (!cancelled) {
          setAllowed(ok);
        }
      } catch {
        workAccessCache.set(cacheKey, false);
        if (!cancelled) {
          setAllowed(false);
        }
      }
    };

    void resolve();

    return () => {
      cancelled = true;
    };
  }, [user, workId]);

  if (allowed === null) {
    return <div className="p-6 text-sm text-muted-foreground">正在加载作品...</div>;
  }

  if (!allowed) {
    return <Navigate to="/workspace" replace />;
  }

  return <Outlet />;
};

// Placeholder Pages
function App() {
  const { setUser, setSession, fetchProfile } = useAuthStore();
  const clearExpired = useTrashStore(state => state.clearExpired);

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile();
      }
    });

    // Listen for changes on auth state (logged in, signed out, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile();
      }
    });

    // Auto-clear expired trash items on app load
    void clearExpired();

    return () => subscription.unsubscribe();
  }, [setUser, setSession, fetchProfile, clearExpired]);

  return (
    <>
      <ToastContainer />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        
        {/* Redirect root to workspace */}
        <Route path="/" element={<Navigate to="/workspace" replace />} />
        
        {/* Main Layout Routes */}
        <Route element={<WorkspaceLayout />}>
          {/* Workspace (with FileTree) */}
          <Route path="/workspace">
            <Route index element={<WorkspaceIndexRoute />} />
            
            {/* Legacy Route Support */}
            <Route path="story/:chapterId" element={<LegacyStoryRedirect />} />
            <Route path="outline" element={<Navigate to="/workspace" replace />} />
            <Route path="world" element={<Navigate to="/workspace" replace />} />
            <Route path="characters" element={<Navigate to="/workspace" replace />} />

            {/* Project Routes */}
            <Route path="p/:workId" element={<WorkAccessGuard />}>
              <Route path="story/:chapterId" element={<StoryEditor />} />
              <Route path="outline" element={<Outline />} />
              <Route path="world" element={<World />} />
              <Route path="characters" element={<Characters />} />
              <Route path="events" element={<Events />} />
              <Route path="mindmap/:mindMapId" element={<CustomMindMap />} />
            </Route>
          </Route>

          {/* Other Sections (No FileTree) */}
          <Route path="/community" element={<Community />} />
          <Route path="/welfare" element={<Welfare />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/prompts" element={<Prompts />} />
          <Route path="/membership" element={<Membership />} />
          <Route path="/records" element={<Records />} />
          <Route path="/download" element={<Download />} />
          <Route path="/trash" element={<Trash />} />
          <Route path="/validate" element={<Validate />} />
        </Route>

        <Route path="*" element={<div>404 Not Found</div>} />
      </Routes>
    </BrowserRouter>
    </>
  );
}

export default App;
