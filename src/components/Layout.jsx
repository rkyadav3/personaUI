import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import Login from '../pages/Login.jsx';

const NAV = [
  ['/admin', 'Overview', true], ['/admin/profile', 'Profile'], ['/admin/files', 'File manager'], ['/admin/add', 'Add files'], ['/admin/topics', 'Research topics'],
  ['/admin/writing', 'Writing'], ['/admin/templates', 'Templates'], ['/admin/knowledge', 'Knowledge index'], ['/admin/settings', 'Settings'],
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [needs, setNeeds] = useState(null);   // true until the person has confirmed a profile
  useEffect(() => { if (user) api('profile.get').then(r => setNeeds(!r.profile), () => setNeeds(false)); }, [user?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (user === undefined) return <p className="muted" style={{ padding: 40 }}>Loading…</p>;
  if (!user) return <Login />;
  if (needs === null) return <p className="muted" style={{ padding: 40 }}>Loading…</p>;
  if (needs && pathname !== '/admin/profile') return <Navigate to="/admin/profile" replace />;
  return (
    <div className="shell">
      <nav className="side" aria-label="Admin">
        <div className="brand">Studio</div>
        {NAV.map(([to, label, end]) => <NavLink key={to} to={to} end={end} className="nav">{label}</NavLink>)}
        {user.isAdmin && <NavLink to="/admin/invites" className="nav">Invites</NavLink>}
        <div className="who">
          <span>{user.name || user.email}</span>
          {user.slug && <a href={`/u/${user.slug}`} target="_blank" rel="noreferrer">View site</a>}
          {user.slug && !needs && <a href={`/p/${user.slug}`} target="_blank" rel="noreferrer">Public profile</a>}
          <button onClick={logout}>Sign out</button>
        </div>
      </nav>
      <main className="main"><Outlet context={{ setNeeds }} /></main>
    </div>
  );
}
