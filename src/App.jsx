import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth.jsx';
const Layout = lazy(() => import('./components/Layout.jsx'));
import Ball from './pages/Ball.jsx';
const Overview = lazy(() => import('./pages/Overview.jsx'));
const FileManager = lazy(() => import('./pages/FileManager.jsx'));
const AddFiles = lazy(() => import('./pages/AddFiles.jsx'));
const Topics = lazy(() => import('./pages/Topics.jsx'));
const Writing = lazy(() => import('./pages/Writing.jsx'));
const Templates = lazy(() => import('./pages/Templates.jsx'));
const KnowledgeIndex = lazy(() => import('./pages/KnowledgeIndex.jsx'));
const Invites = lazy(() => import('./pages/Invites.jsx'));

export default function App() {
  return (
    <Suspense fallback={null}>
    <Routes>
      <Route path="/" element={<Ball />} />
      <Route path="/u/:slug" element={<Ball />} />
      <Route path="/admin" element={<AuthProvider><Layout /></AuthProvider>}>
        <Route index element={<Overview />} />
        <Route path="files" element={<FileManager />} />
        <Route path="add" element={<AddFiles />} />
        <Route path="topics" element={<Topics />} />
        <Route path="topics/:id" element={<Topics />} />
        <Route path="writing" element={<Writing />} />
        <Route path="writing/:id" element={<Writing />} />
        <Route path="templates" element={<Templates />} />
        <Route path="knowledge" element={<KnowledgeIndex />} />
        <Route path="invites" element={<Invites />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
