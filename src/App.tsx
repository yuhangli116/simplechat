import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams, useLocation, useNavigate } from 'react-router-dom';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { clearGuestSession, createGuestProfile, createGuestUser, isGuestUser, loadGuestSession, useAuthStore } from '@/store/useAuthStore';
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
import { MaintenanceBanner } from '@/components/MaintenanceBanner';
import { MaintenanceGate } from '@/components/MaintenanceGate';
import { MaintenanceInteractionBlocker } from '@/components/MaintenanceInteractionBlocker';
import { SiteFooter } from '@/components/SiteFooter';
import Records from '@/pages/Records';
import { Validate } from '@/pages/placeholders';
import { MaintenanceProvider } from '@/contexts/MaintenanceContext';
import { useMaintenance } from '@/contexts/useMaintenance';
import { loadWorkspaceTree } from '@/lib/workspacePersistence';
import { createLogger } from '@/lib/logger';

const log = createLogger('App');

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
  const { user, loading } = useAuthStore();
  const location = useLocation();
  const { setFiles, files, createWorkInProgress } = useFileStore();
  const [fileStoreHydrated, setFileStoreHydrated] = React.useState(() => useFileStore.persist.hasHydrated());
  const [targetPath, setTargetPath] = React.useState<string | null>(null);
  const [resolved, setResolved] = React.useState(false);

  const isGuest = Boolean(user && isGuestUser(user));
  // 游客欢迎页只在“点击游客登录”的首次跳转展示。
  // 后续从回收站/社区点击“我的作品”回到 /workspace 时，不带该 state，应自动进入第一个作品页。
  const [showGuestWelcome] = React.useState(() =>
    Boolean((location.state as { showGuestWelcome?: boolean } | null)?.showGuestWelcome)
  );

  React.useEffect(() => {
    if (!showGuestWelcome || typeof window === 'undefined') return;
    // 清除一次性 history state，避免刷新 /workspace 后反复停留在欢迎页。
    const historyState = window.history.state;
    if (historyState && typeof historyState === 'object' && 'usr' in historyState) {
      window.history.replaceState({ ...historyState, usr: null }, '', window.location.href);
    }
  }, [showGuestWelcome]);

  React.useEffect(() => {
    if (useFileStore.persist.hasHydrated()) {
      setFileStoreHydrated(true);
      return;
    }
    return useFileStore.persist.onFinishHydration(() => {
      setFileStoreHydrated(true);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const resolveTarget = async () => {
      if (loading && !user) return;
      if (!user) {
        if (!cancelled) setResolved(true);
        return;
      }
      if (isGuest && !fileStoreHydrated) return;

      // 游客模式：只在文件树为空时加载 demo 数据，避免覆盖游客刷新前已经创建/删除过的作品树。
      if (isGuest) {
        const currentFiles = useFileStore.getState().files;
        const hasWorks = currentFiles[0]?.children && currentFiles[0].children.length > 0;
        if (!hasWorks) {
          setFiles(JSON.parse(JSON.stringify(guestDemoFileStructure)));
        }
        if (!cancelled) {
          if (!showGuestWelcome) {
            const existingPath = findFirstWorkspacePath(useFileStore.getState().files);
            setTargetPath(existingPath || '/workspace/p/book-1/outline');
          }
          setResolved(true);
        }
        return;
      }

      try {
        const remoteTree = await withTimeout(
          loadWorkspaceTree(user.id),
          8000,
          '加载工作区超时，已尝试使用本地缓存'
        );
        if (cancelled) return;
        setFiles(remoteTree as FileNode[]);
        setTargetPath(findFirstWorkspacePath(remoteTree) || null);
      } catch (error) {
        console.error('Failed to resolve workspace entry:', error);
        log.warn('Workspace entry fell back to local tree', {
          userId: user.id,
          reason: error instanceof Error ? error.message : String(error),
        });
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
  }, [setFiles, user, loading, isGuest, showGuestWelcome, fileStoreHydrated]);

  if (targetPath) {
    return <Navigate to={targetPath} replace />;
  }

  if (!resolved) {
    return <div className="p-6 text-sm text-muted-foreground">正在加载工作区...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (isGuest && showGuestWelcome) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md p-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-amber-100 rounded-full flex items-center justify-center">
            <span className="text-2xl">👋</span>
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-3">欢迎体验简单写作</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            当前正以游客身份访问网站，仅支持部分功能，注册登录后解锁全部功能，请开始体验吧！
          </p>
        </div>
      </div>
    );
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

// Auth guard: redirect unauthenticated users to login
const RequireAuth = () => {
  const { user } = useAuthStore();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};

// Guest guard: allow access for guests with demo content, redirect logged-in users to workspace
const GuestOrAuthGuard = () => {
  const { user } = useAuthStore();

  // Both guests and logged-in users can access workspace
  return <Outlet />;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value?: string | null) => !!value && uuidPattern.test(value);

const workAccessCache = new Map<string, boolean>();

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const hasLocalWork = (workId?: string | null) => {
  if (!workId) return false;
  const rootChildren = useFileStore.getState().files[0]?.children || [];
  return rootChildren.some((node) => node.id === workId || Boolean(node.path?.includes(`/workspace/p/${workId}/`)));
};

const WorkAccessGuard = () => {
  const { workId } = useParams();
  const { user, loading } = useAuthStore();
  const [allowed, setAllowed] = React.useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      if (loading && !user) {
        if (!cancelled) setAllowed(null);
        return;
      }

      if (!user) {
        if (!cancelled) setAllowed(false);
        return;
      }

      // 游客直接放行，不做数据库权限检查
      if (isGuestUser(user)) {
        if (!cancelled) setAllowed(true);
        return;
      }

      if (!isUuid(workId)) {
        if (!cancelled) setAllowed(false);
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
        const { data, error } = await withTimeout(
          Promise.resolve(
            supabase
              .from('works')
              .select('id')
              .eq('id', workId)
              .eq('user_id', user.id)
              .maybeSingle()
          ),
          6000,
          '作品权限检查超时'
        );

        const ok = Boolean(!error && data?.id);
        workAccessCache.set(cacheKey, ok);
        if (!cancelled) {
          setAllowed(ok);
        }
      } catch (error) {
        const fallbackAllowed = hasLocalWork(workId);
        workAccessCache.set(cacheKey, fallbackAllowed);
        log.warn('Work access check fell back to local tree', {
          userId: user.id,
          workId,
          allowed: fallbackAllowed,
          reason: error instanceof Error ? error.message : String(error),
        });
        if (!cancelled) {
          setAllowed(fallbackAllowed);
        }
      }
    };

    void resolve();

    return () => {
      cancelled = true;
    };
  }, [user, loading, workId]);

  if (allowed === null) {
    return <div className="p-6 text-sm text-muted-foreground">正在加载作品...</div>;
  }

  if (!allowed) {
    if (!user && !loading) {
      return <Navigate to="/login" replace />;
    }
    return <Navigate to="/workspace" replace />;
  }

  return <Outlet />;
};

const AUTH_ROUTE_PATHS = new Set(['/login', '/register', '/forgot-password', '/reset-password']);

const MaintenanceRouteGuard = () => {
  const { ready, locked } = useMaintenance();
  const location = useLocation();
  const navigate = useNavigate();
  const sawReadyRef = React.useRef(false);
  const previousLockedRef = React.useRef(false);
  const allowedLockedPathRef = React.useRef<string | null>(null);
  const currentPath = `${location.pathname}${location.search}${location.hash}`;

  useEffect(() => {
    if (!ready) return;

    const isAuthRoute = AUTH_ROUTE_PATHS.has(location.pathname);
    if (!locked) {
      sawReadyRef.current = true;
      previousLockedRef.current = false;
      allowedLockedPathRef.current = null;
      return;
    }

    const firstReady = !sawReadyRef.current;
    const justEnteredLocked = !firstReady && !previousLockedRef.current;
    sawReadyRef.current = true;
    previousLockedRef.current = true;

    if (isAuthRoute) return;

    if (justEnteredLocked) {
      allowedLockedPathRef.current = currentPath;
      log.info('Maintenance lock entered; preserving current loaded page', { path: currentPath });
      return;
    }

    if (allowedLockedPathRef.current === currentPath) return;

    log.warn('Maintenance lock redirected navigation to login', { from: currentPath });
    void useAuthStore.getState().signOut().finally(() => {
      navigate('/login', { replace: true, state: { maintenanceLocked: true } });
    });
  }, [currentPath, location.pathname, locked, navigate, ready]);

  return null;
};

const AppShell = () => {
  const { bannerVisible } = useMaintenance();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground" style={{ paddingTop: bannerVisible ? 40 : 0 }}>
      <MaintenanceBanner />
      <MaintenanceInteractionBlocker />
      <div className="min-h-0 flex-1">
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <MaintenanceRouteGuard />
          <Routes>
            <Route element={<MaintenanceGate />}>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Redirect root to login for unauthenticated users */}
              <Route path="/" element={<Navigate to="/login" replace />} />

              {/* Main Layout Routes - accessible to both guests and logged-in users */}
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

                {/* Other Sections - accessible to guests (data saved locally only) */}
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
            </Route>
          </Routes>
        </BrowserRouter>
      </div>
      <SiteFooter />
    </div>
  );
};

// Placeholder Pages
function App() {
  const { setUser, setSession, setProfile, setLoading, setDiamondBalance, fetchProfile } = useAuthStore();
  const clearExpired = useTrashStore(state => state.clearExpired);

  useEffect(() => {
    const restoreGuestSession = () => {
      const guestSession = loadGuestSession();
      if (!guestSession) return false;
      log.info('Restoring guest session', { guestId: guestSession.guestId });
      setSession(null);
      setUser(createGuestUser(guestSession.guestId));
      setProfile(createGuestProfile(guestSession.guestId));
      setDiamondBalance(0);
      return true;
    };

    // Check active sessions and sets the user
    setLoading(true);
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      if (useAuthStore.getState().signingOut) {
        log.info('Initial session restore skipped while signing out');
        setLoading(false);
        return;
      }
      if (session?.user) {
        log.info('Initial Supabase session restored', { userId: session.user.id });
        clearGuestSession();
        setSession(session);
        setUser(session.user);
        fetchProfile();
        setLoading(false);
        return;
      }
      if (!restoreGuestSession()) {
        log.info('No active session found on app load');
        setSession(null);
        setUser(null);
      }
      setLoading(false);
    }).catch((error: unknown) => {
      log.error('Initial session restore failed', {}, error);
      setSession(null);
      setUser(null);
      setLoading(false);
    });

    // Listen for changes on auth state (logged in, signed out, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      log.info('Supabase auth state changed', { event: _event, userId: session?.user?.id || null });
      if (useAuthStore.getState().signingOut) {
        log.info('Auth state change skipped while signing out', { event: _event });
        return;
      }
      if (session?.user) {
        clearGuestSession();
        setSession(session);
        setUser(session.user);
        fetchProfile();
        setLoading(false);
        return;
      }
      if (!restoreGuestSession()) {
        setSession(null);
        setUser(null);
      }
      setLoading(false);
    });

    // Auto-clear expired trash items on app load
    void clearExpired();

    return () => subscription.unsubscribe();
  }, [setUser, setSession, setProfile, setLoading, setDiamondBalance, fetchProfile, clearExpired]);

  return (
    <>
      <ToastContainer />
      <MaintenanceProvider>
        <AppShell />
      </MaintenanceProvider>
    </>
  );
}

export default App;
