import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { AuthProvider } from './lib/auth.jsx';
const Layout = lazy(() => import('./components/Layout.jsx'));
import Home from './pages/Home.jsx';
import { Loading } from './components/Ui.jsx';
import { LegacyLookRedirect, LegacyPersonaRedirect, LegacyPortfolioRedirect } from './pages/LegacyRedirects.jsx';
const Overview = lazy(() => import('./pages/Overview.jsx'));
const FileManager = lazy(() => import('./pages/FileManager.jsx'));
const AddFiles = lazy(() => import('./pages/AddFiles.jsx'));
const Topics = lazy(() => import('./pages/Topics.jsx'));
const Writing = lazy(() => import('./pages/Writing.jsx'));
const Templates = lazy(() => import('./pages/Templates.jsx'));
const KnowledgeIndex = lazy(() => import('./pages/KnowledgeIndex.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const PublicProfile = lazy(() => import('./pages/PublicProfile.jsx'));
const SuperAdmin = lazy(() => import('./pages/SuperAdmin.jsx'));
const Invites = lazy(() => import('./pages/Invites.jsx'));
const Suggestions = lazy(() => import('./pages/Suggestions.jsx'));
const Support = lazy(() => import('./pages/Support.jsx'));
const PlatformPayments = lazy(() => import('./pages/PlatformPayments.jsx'));
const MainSiteSettings = lazy(() => import('./pages/MainSiteSettings.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const ContentManager = lazy(() => import('./pages/ContentManager.jsx'));
const LegacyContentRedirect = lazy(() => import('./pages/LegacyContentRedirect.jsx'));
const Enquiries = lazy(() => import('./pages/Enquiries.jsx'));
const Purchases = lazy(() => import('./pages/Purchases.jsx'));
const Questions = lazy(() => import('./pages/Questions.jsx'));
function LegacySuperAdmin() {
  const [params] = useSearchParams();
  return <Navigate to={params.get('tab') === 'invites' ? '/superadmin/invites' : '/superadmin/customers'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
    <Suspense fallback={<Loading label="Opening page…" />}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/u/:slug" element={<LegacyPersonaRedirect />} />
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
        <Route path="superadmin" element={<LegacySuperAdmin />} />
        <Route path="page" element={<LegacyLookRedirect />} />
        <Route path="portfolio" element={<LegacyPortfolioRedirect />} />
        <Route path="store" element={<ContentManager store />} />
        <Route path="activity" element={<ContentManager />} />
        <Route path="updates" element={<LegacyContentRedirect />} />
        <Route path="enquiries" element={<Enquiries />} />
        <Route path="questions" element={<Questions />} />
        <Route path="purchases" element={<Purchases />} />
        <Route path="invites" element={<Invites />} />
        <Route path="suggestions" element={<Suggestions />} />
        <Route path="support" element={<Support />} />
        <Route path="support/:id" element={<Support />} />
        <Route path="users" element={<Navigate to="/superadmin/customers" replace />} />
      </Route>
      <Route path="/superadmin" element={<Layout superadmin />}>
        <Route index element={<SuperAdmin />} />
        <Route path="customers" element={<SuperAdmin />} />
        <Route path="invites" element={<Invites />} />
        <Route path="suggestions" element={<Suggestions />} />
        <Route path="support" element={<Support />} />
        <Route path="support/:id" element={<Support />} />
        <Route path="sales" element={<PlatformPayments />} />
        <Route path="settings" element={<MainSiteSettings />} />
      </Route>
      <Route path="/superadmin/payments" element={<Navigate to="/superadmin/sales" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </AuthProvider>
  );
}
