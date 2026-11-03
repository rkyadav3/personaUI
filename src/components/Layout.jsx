import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Glass } from 'open-glass-ui';
import GlassShell from './GlassShell.jsx';
import Login from '../pages/Login.jsx';

const NAV_GROUPS = [
  {
    category: 'Workspace',
    items: [
      { to: '/admin', label: 'Overview', icon: '📊', end: true },
      { to: '/admin/profile', label: 'Profile & Offerings', icon: '👤' },
    ],
  },
  {
    category: 'Knowledge Base',
    items: [
      { to: '/admin/files', label: 'Files & Storage', icon: '📁' },
      { to: '/admin/topics', label: 'Research Topics', icon: '💡' },
      { to: '/admin/knowledge', label: 'Knowledge Index', icon: '🧠' },
    ],
  },
  {
    category: 'Creative Studio',
    items: [
      { to: '/admin/writing', label: 'Writing & Posts', icon: '✍️' },
    ],
  },
  {
    category: 'Appearance',
    items: [
      { to: '/admin/settings', label: 'Persona Settings', icon: '⚙️' },
    ],
  },
];

export default function Layout() {
  return <GlassShell><Inner /></GlassShell>;
}

function Inner() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [needs, setNeeds] = useState(null);

  useEffect(() => {
    if (user !== null) api('profile.get').then(r => setNeeds(!r.profile), () => setNeeds(false));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (user === undefined) return <p className="muted" style={{ padding: 40 }}>Loading…</p>;
  if (!user) return <Login />;
  if (needs === null) return <p className="muted" style={{ padding: 40 }}>Loading…</p>;
  if (needs && pathname !== '/admin/profile') return <Navigate to="/admin/profile" replace />;

  return (
    <div className="shell">
      <Glass as="nav" material="regular" className="side" aria-label="Admin Studio">
        <div className="brand">Studio</div>

        {NAV_GROUPS.map(group => (
          <div key={group.category} style={{ display: 'grid', gap: 2 }}>
            <div className="side-category">{group.category}</div>
            {group.items.map(item => (
              <NavLink key={item.to} to={item.to} end={item.end} className="nav">
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}

        {user.isAdmin && (
          <div style={{ display: 'grid', gap: 2 }}>
            <div className="side-category">Administration</div>
            <NavLink to="/admin/superadmin" className="nav">
              <span className="nav-icon" aria-hidden="true">🛡️</span>
              <span>Super Admin</span>
            </NavLink>
          </div>
        )}

        <div className="who">
          <strong>{user.name || user.email}</strong>
          {user.slug && <a href={`/p/${user.slug}`} target="_blank" rel="noreferrer">View Live Persona ↗</a>}
          <button onClick={logout}>Sign out</button>
        </div>
      </Glass>

      <main className="main"><Outlet context={{ setNeeds }} /></main>
    </div>
  );
}
