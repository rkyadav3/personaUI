import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import Login from '../pages/Login.jsx';

const NAV = [
  ['/admin', 'Overview', true], ['/admin/files', 'File manager'], ['/admin/add', 'Add files'], ['/admin/topics', 'Research topics'],
  ['/admin/writing', 'Writing'], ['/admin/templates', 'Templates'], ['/admin/knowledge', 'Knowledge index'],
];

export default function Layout() {
  const { user, logout } = useAuth();
  if (user === undefined) return <p className="muted" style={{ padding: 40 }}>Loading…</p>;
  if (!user) return <Login />;
  return (
    <div className="shell">
      <nav className="side" aria-label="Admin">
        <div className="brand">Studio</div>
        {NAV.map(([to, label, end]) => <NavLink key={to} to={to} end={end} className="nav">{label}</NavLink>)}
        {user.isAdmin && <NavLink to="/admin/invites" className="nav">Invites</NavLink>}
        <div className="who">
          <span>{user.name || user.email}</span>
          {user.slug && <a href={`/u/${user.slug}`} target="_blank" rel="noreferrer">View site</a>}
          <button onClick={logout}>Sign out</button>
        </div>
      </nav>
      <main className="main"><Outlet /></main>
    </div>
  );
}
