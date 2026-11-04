import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Glass } from './Glass.jsx';
import GlassShell from './GlassShell.jsx';
import Login from '../pages/Login.jsx';

const NAV_GROUPS = [
  {
    category: 'Workspace',
    items: [
      { to: '/admin', label: 'Overview', icon: '📊', end: true },
      { to: '/admin/profile', label: 'Profile & Offerings', icon: '👤' },
      { to: '/admin/updates', label: 'Updates & Schedule', icon: '🗓️' },
      { to: '/admin/enquiries', label: 'Enquiries', icon: '📥', badge: true },
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
      { to: '/admin/portfolio', label: 'Portfolio Pages', icon: '🧩' },
      { to: '/admin/page', label: 'Look & Store', icon: '🪟' },
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
  const [needs, setNeeds] = useState(null), [unread, setUnread] = useState(0);

  useEffect(() => {
    if (user !== null) api('profile.get').then(r => setNeeds(!r.profile), () => setNeeds(false));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {   // the unread count on the Enquiries link: refreshed on every page change and whenever the inbox changes
    if (!user) return undefined;
    const load = () => api('enquiries.count').then(r => setUnread(r.new || 0), () => {});
    load(); window.addEventListener('enquiries-changed', load);
    return () => window.removeEventListener('enquiries-changed', load);
  }, [user?.id, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (user === undefined) return <p className="muted" style={{ padding: 40 }}>Loading…</p>;
  if (!user) return <Login />;
  if (needs === null) return <p className="muted" style={{ padding: 40 }}>Loading…</p>;
  if (needs && !['/admin/profile', '/admin/superadmin', '/admin/invites'].includes(pathname)) return <Navigate to="/admin/profile" replace />;

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
                {item.badge && unread > 0 && <span className="super-badge" style={{ marginLeft: 'auto' }} aria-label={`${unread} new`}>{unread}</span>}
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
            <NavLink to="/admin/superadmin?tab=invites" className="nav">
              <span className="nav-icon" aria-hidden="true">✉️</span>
              <span>Invite Links</span>
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
