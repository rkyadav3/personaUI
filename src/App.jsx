import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth.jsx';
const Layout = lazy(() => import('./components/Layout.jsx'));
import Home from './pages/Home.jsx';
const Ball = lazy(() => import('./pages/Ball.jsx'));
const Overview = lazy(() => import('./pages/Overview.jsx'));
const FileManager = lazy(() => import('./pages/FileManager.jsx'));
const AddFiles = lazy(() => import('./pages/AddFiles.jsx'));
const Topics = lazy(() => import('./pages/Topics.jsx'));
const Writing = lazy(() => import('./pages/Writing.jsx'));
const Templates = lazy(() => import('./pages/Templates.jsx'));
const KnowledgeIndex = lazy(() => import('./pages/KnowledgeIndex.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const PortfolioEditor = lazy(() => import('./pages/PortfolioEditor.jsx'));
const PublicProfile = lazy(() => import('./pages/PublicProfile.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const PublicPage = lazy(() => import('./pages/PublicPage.jsx'));
const SuperAdmin = lazy(() => import('./pages/SuperAdmin.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const Updates = lazy(() => import('./pages/Updates.jsx'));
const Enquiries = lazy(() => import('./pages/Enquiries.jsx'));

export default function App() {
  return (
    <AuthProvider>
    <Suspense fallback={null}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/u/:slug" element={<Ball />} />
      <Route path="/register" element={<Register />} />
      <Route path="/invite" element={<Register />} />
      <Route path="/invite/:code" element={<Register />} />
      <Route path="/login" element={<Navigate to="/admin" replace />} />
      <Route path="/p/:slug" element={<PublicProfile />} />
      <Route path="/p/:slug/:sub" element={<PublicProfile />} />
      <Route path="/admin" element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
        <Route path="files" element={<FileManager />} />
        <Route path="add" element={<AddFiles />} />
        <Route path="topics" element={<Topics />} />
        <Route path="topics/:id" element={<Topics />} />
        <Route path="writing" element={<Writing />} />
        <Route path="writing/:id" element={<Writing />} />
        <Route path="templates" element={<Templates />} />
        <Route path="knowledge" element={<KnowledgeIndex />} />
        <Route path="superadmin" element={<SuperAdmin />} />
        <Route path="page" element={<PublicPage />} />
        <Route path="portfolio" element={<PortfolioEditor />} />
        <Route path="updates" element={<Updates />} />
        <Route path="enquiries" element={<Enquiries />} />
        <Route path="invites" element={<Navigate to="/admin/superadmin?tab=invites" replace />} />
        <Route path="users" element={<Navigate to="/admin/superadmin" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </AuthProvider>
  );
}
