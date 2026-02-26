import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
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
import { 
  Welfare, 
  Guide, 
  Records, 
  Download,
  Trash 
} from '@/pages/placeholders';

// Redirect helper for legacy routes
const LegacyStoryRedirect = () => {
  const { chapterId } = useParams();
  return <Navigate to={`/workspace/p/book-1/story/${chapterId}`} replace />;
};

// Placeholder Pages
function App() {
  const { setUser, setSession, fetchBalance } = useAuthStore();

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchBalance();
      }
    });

    // Listen for changes on auth state (logged in, signed out, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchBalance();
      }
    });

    return () => subscription.unsubscribe();
  }, [setUser, setSession, fetchBalance]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        
        {/* Redirect root to workspace */}
        <Route path="/" element={<Navigate to="/workspace/p/book-1/story/1" replace />} />
        
        {/* Main Layout Routes */}
        <Route element={<WorkspaceLayout />}>
          {/* Workspace (with FileTree) */}
          <Route path="/workspace">
            <Route index element={<Navigate to="/workspace/p/book-1/story/1" replace />} />
            
            {/* Legacy Route Support */}
            <Route path="story/:chapterId" element={<LegacyStoryRedirect />} />
            <Route path="outline" element={<Navigate to="p/book-1/outline" replace />} />
            <Route path="world" element={<Navigate to="p/book-1/world" replace />} />
            <Route path="characters" element={<Navigate to="p/book-1/characters" replace />} />

            {/* Project Routes */}
            <Route path="p/:workId">
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
        </Route>

        <Route path="*" element={<div>404 Not Found</div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
